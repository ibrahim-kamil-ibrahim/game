import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/database';
import { expireDueSessions, dispatchExpiryWarnings } from '../src/jobs/sessionExpiry';
import { checkLowCashAlerts } from '../src/jobs/lowCashAlert';
import {
  api,
  auth,
  cashPayment,
  createMachineWithQr,
  createPackage,
  resetDatabase,
  seedBase,
  type TestContext,
} from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  await resetDatabase();
  ctx = await seedBase();
});

describe('Server-side session expiration', () => {
  it('expires sessions whose end time has passed and releases the machine', async () => {
    const { machine } = await createMachineWithQr(ctx.businessId, { code: 'EXP-1' });
    const pkg = await createPackage(ctx.businessId, { durationMinutes: 30, priceSantim: 5000 });
    const payment = await cashPayment(ctx.employerToken, machine.id, pkg.id);
    const started = await api
      .post('/api/v1/sessions/start')
      .set(auth(ctx.employerToken))
      .send({ paymentId: payment.body.data.id });
    expect(started.status).toBe(201);
    const sessionId = started.body.data.session.id as string;

    // Simulate time passing: the server's end timestamp is authoritative.
    const start = new Date(Date.now() - 31 * 60 * 1000);
    const end = new Date(Date.now() - 60 * 1000);
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { startedAt: start, endsAt: end },
    });

    const result = await expireDueSessions(new Date());
    expect(result.sessionIds).toContain(sessionId);

    const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe('EXPIRED');
    expect(session.actualEndedAt?.toISOString()).toBe(end.toISOString());
    expect(session.actualDurationSeconds).toBeGreaterThan(29 * 60);

    const machineAfter = await prisma.gameMachine.findUniqueOrThrow({ where: { id: machine.id } });
    expect(machineAfter.status).toBe('AVAILABLE');

    const paymentAfter = await prisma.payment.findUniqueOrThrow({ where: { id: payment.body.data.id } });
    expect(paymentAfter.status).toBe('PAID');

    const events = await prisma.sessionEvent.findMany({ where: { sessionId } });
    expect(events.map((event) => event.type)).toContain('EXPIRED');

    const employerNotifications = await prisma.notification.count({
      where: { userId: ctx.employerId, type: 'SESSION_EXPIRED' },
    });
    const adminNotifications = await prisma.notification.count({
      where: { audience: 'ADMIN', type: 'SESSION_EXPIRED' },
    });
    expect(employerNotifications).toBeGreaterThan(0);
    expect(adminNotifications).toBeGreaterThan(0);
  });

  it('is idempotent when the expiry worker runs repeatedly', async () => {
    const { machine } = await createMachineWithQr(ctx.businessId, { code: 'EXP-2' });
    const pkg = await createPackage(ctx.businessId);
    const payment = await cashPayment(ctx.employerToken, machine.id, pkg.id);
    const started = await api
      .post('/api/v1/sessions/start')
      .set(auth(ctx.employerToken))
      .send({ paymentId: payment.body.data.id });
    const sessionId = started.body.data.session.id as string;

    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { startedAt: new Date(Date.now() - 31 * 60_000), endsAt: new Date(Date.now() - 1000) },
    });

    const first = await expireDueSessions(new Date());
    expect(first.sessionIds).toContain(sessionId);
    const second = await expireDueSessions(new Date());
    expect(second.sessionIds).not.toContain(sessionId);

    const expiredEvents = await prisma.sessionEvent.count({
      where: { sessionId, type: 'EXPIRED' },
    });
    expect(expiredEvents).toBe(1);
  });

  it('reconciles multiple sessions that expired while the server was offline', async () => {
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const { machine } = await createMachineWithQr(ctx.businessId, {
        code: `OFFLINE-${index}-${Date.now().toString(36).slice(-4)}`,
      });
      const pkg = await createPackage(ctx.businessId);
      const payment = await cashPayment(ctx.employerToken, machine.id, pkg.id);
      const started = await api
        .post('/api/v1/sessions/start')
        .set(auth(ctx.employerToken))
        .send({ paymentId: payment.body.data.id });
      const sessionId = started.body.data.session.id as string;
      ids.push(sessionId);
      await prisma.gameSession.update({
        where: { id: sessionId },
        data: { startedAt: new Date(Date.now() - (index + 31) * 60_000), endsAt: new Date(Date.now() - (index + 1) * 60_000) },
      });
    }

    const result = await expireDueSessions(new Date());
    for (const id of ids) {
      expect(result.sessionIds).toContain(id);
    }

    const stillActive = await prisma.gameSession.count({
      where: { id: { in: ids }, status: 'ACTIVE' },
    });
    expect(stillActive).toBe(0);
  });

  it('sends de-duplicated expiry warnings before the timer runs out', async () => {
    const { machine } = await createMachineWithQr(ctx.businessId, { code: 'WARN-1' });
    const pkg = await createPackage(ctx.businessId, { durationMinutes: 10 });
    const payment = await cashPayment(ctx.employerToken, machine.id, pkg.id);
    const started = await api
      .post('/api/v1/sessions/start')
      .set(auth(ctx.employerToken))
      .send({ paymentId: payment.body.data.id });
    const sessionId = started.body.data.session.id as string;

    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { endsAt: new Date(Date.now() + 4 * 60 * 1000 + 30_000) },
    });

    const firstRun = await dispatchExpiryWarnings(new Date());
    expect(firstRun).toBeGreaterThanOrEqual(1);

    const secondRun = await dispatchExpiryWarnings(new Date());
    expect(secondRun).toBe(0);

    const warnings = await prisma.notification.findMany({
      where: { userId: ctx.employerId, type: 'SESSION_EXPIRING' },
    });
    const sessionWarnings = warnings.filter(
      (notification) => (notification.data as { sessionId?: string } | null)?.sessionId === sessionId,
    );
    expect(sessionWarnings).toHaveLength(1);
  });

  it('alerts admins once per day when collected cash is below the threshold', async () => {
    await prisma.businessSettings.update({
      where: { businessId: ctx.businessId },
      data: { lowCashThresholdSantim: 100_000_000 },
    });

    // 19:00 in Africa/Addis_Ababa (UTC+3).
    const evening = new Date('2026-11-23T16:00:00.000Z');

    const first = await checkLowCashAlerts(evening);
    expect(first).toBeGreaterThanOrEqual(1);

    const second = await checkLowCashAlerts(evening);
    expect(second).toBe(0);

    const alert = await prisma.notification.findFirst({
      where: { businessId: ctx.businessId, audience: 'ADMIN', type: 'SYSTEM' },
    });
    expect(alert).toBeTruthy();
    expect(alert!.title).toBe('Low cash collection today');

    await prisma.businessSettings.update({
      where: { businessId: ctx.businessId },
      data: { lowCashThresholdSantim: null },
    });
  });
});
