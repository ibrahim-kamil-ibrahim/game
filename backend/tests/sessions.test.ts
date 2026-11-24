import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/database';
import {
  api,
  auth,
  cashPayment,
  createEmployerAccount,
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

async function startReadySession(options: { durationMinutes?: number; priceSantim?: number } = {}) {
  const { machine } = await createMachineWithQr(ctx.businessId, {
    code: `SESS-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
  });
  const pkg = await createPackage(ctx.businessId, {
    durationMinutes: options.durationMinutes ?? 30,
    priceSantim: options.priceSantim ?? 5000,
  });
  const payment = await cashPayment(ctx.employerToken, machine.id, pkg.id);
  expect(payment.status).toBe(201);
  const started = await api
    .post('/api/v1/sessions/start')
    .set(auth(ctx.employerToken))
    .send({ paymentId: payment.body.data.id });
  expect(started.status).toBe(201);
  return { machine, pkg, payment: payment.body.data, session: started.body.data.session };
}

describe('Cash payments and session lifecycle', () => {
  it('records a cash payment using server-authoritative package pricing', async () => {
    const { machine } = await createMachineWithQr(ctx.businessId, { code: 'CASH-1' });
    const pkg = await createPackage(ctx.businessId, { durationMinutes: 20, priceSantim: 3500 });

    const response = await api
      .post('/api/v1/payments/cash')
      .set(auth(ctx.employerToken))
      .send({
        machineId: machine.id,
        packageId: pkg.id,
        idempotencyKey: 'cash-payment-idem-1',
        amountSantim: 1,
        durationMinutes: 9999,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.amountSantim).toBe(3500);
    expect(response.body.data.durationMinutes).toBe(20);
    expect(response.body.data.status).toBe('PAID');
    expect(response.body.data.method).toBe('CASH');
    expect(response.body.data.transactionRef).toMatch(/^CASH-/);

    const duplicate = await api
      .post('/api/v1/payments/cash')
      .set(auth(ctx.employerToken))
      .send({ machineId: machine.id, packageId: pkg.id, idempotencyKey: 'cash-payment-idem-1' });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data.id).toBe(response.body.data.id);

    const paymentCount = await prisma.payment.count({ where: { machineId: machine.id } });
    expect(paymentCount).toBe(1);
  });

  it('starts a session atomically and marks the machine IN_USE', async () => {
    const { machine, session } = await startReadySession({ durationMinutes: 30, priceSantim: 5000 });

    expect(session.status).toBe('ACTIVE');
    expect(session.remainingSeconds).toBeGreaterThan(29 * 60);
    expect(session.remainingSeconds).toBeLessThanOrEqual(30 * 60);

    const refreshed = await prisma.gameMachine.findUnique({ where: { id: machine.id } });
    expect(refreshed!.status).toBe('IN_USE');

    const active = await api.get('/api/v1/sessions/active').set(auth(ctx.employerToken));
    expect(active.status).toBe(200);
    expect(active.body.data.some((item: { id: string }) => item.id === session.id)).toBe(true);
  });

  it('is idempotent when the same payment starts twice (network retry)', async () => {
    const { payment, session } = await startReadySession();

    const retry = await api
      .post('/api/v1/sessions/start')
      .set(auth(ctx.employerToken))
      .send({ paymentId: payment.id });

    expect(retry.status).toBe(201);
    expect(retry.body.data.session.id).toBe(session.id);

    const count = await prisma.gameSession.count({ where: { paymentId: payment.id } });
    expect(count).toBe(1);
  });

  it('prevents a second payment on an occupied machine', async () => {
    const { machine } = await startReadySession();
    const pkg = await createPackage(ctx.businessId, { name: 'Other', durationMinutes: 10, priceSantim: 2000 });

    const second = await api
      .post('/api/v1/payments/cash')
      .set(auth(ctx.employerToken))
      .send({ machineId: machine.id, packageId: pkg.id, idempotencyKey: 'second-on-busy' });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('MACHINE_NOT_AVAILABLE');
  });

  it('prevents employers from using another employer payment', async () => {
    const { machine } = await createMachineWithQr(ctx.businessId, { code: 'OTHER-1' });
    const pkg = await createPackage(ctx.businessId);
    const payment = await cashPayment(ctx.employerToken, machine.id, pkg.id);

    const other = await createEmployerAccount(ctx.businessId, 'other-employer');
    const attempt = await api
      .post('/api/v1/sessions/start')
      .set(auth(other.token))
      .send({ paymentId: payment.body.data.id });

    expect(attempt.status).toBe(403);

    const otherPaymentView = await api
      .get(`/api/v1/payments/${payment.body.data.id}`)
      .set(auth(other.token));
    expect(otherPaymentView.status).toBe(403);
  });

  it('ends a session manually, releases the machine and keeps the payment', async () => {
    const { machine, session, payment } = await startReadySession();

    const ended = await api
      .post(`/api/v1/sessions/${session.id}/end`)
      .set(auth(ctx.employerToken))
      .send({ reason: 'Customer finished early' });

    expect(ended.status).toBe(200);
    expect(ended.body.data.status).toBe('COMPLETED');
    expect(ended.body.data.actualEndedAt).toBeTruthy();
    expect(ended.body.data.endedByRole).toBe('EMPLOYER');

    const machineAfter = await prisma.gameMachine.findUnique({ where: { id: machine.id } });
    expect(machineAfter!.status).toBe('AVAILABLE');

    const paymentAfter = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(paymentAfter!.status).toBe('PAID');

    const endAgain = await api
      .post(`/api/v1/sessions/${session.id}/end`)
      .set(auth(ctx.employerToken))
      .send({});
    expect(endAgain.status).toBe(409);
  });

  it('extends a paid session with a separate recorded transaction', async () => {
    const { session } = await startReadySession({ durationMinutes: 10, priceSantim: 2000 });
    const extensionPackage = await createPackage(ctx.businessId, {
      name: 'Extension 10',
      durationMinutes: 10,
      priceSantim: 1500,
    });

    const before = new Date(session.endsAt).getTime();

    const extended = await api
      .post(`/api/v1/sessions/${session.id}/extend`)
      .set(auth(ctx.employerToken))
      .send({ packageId: extensionPackage.id, idempotencyKey: 'extension-1' });

    expect(extended.status).toBe(200);
    expect(extended.body.data.endsAt).toBeTruthy();
    expect(new Date(extended.body.data.endsAt).getTime()).toBeGreaterThan(before);
    expect(extended.body.data.extensions).toHaveLength(1);
    expect(extended.body.data.extensions[0].priceSantim).toBe(1500);
    expect(extended.body.data.priceSantim).toBe(3500);

    const extensionPayment = await prisma.payment.findFirst({
      where: { idempotencyKey: 'extension-1' },
    });
    expect(extensionPayment!.type).toBe('EXTENSION');
    expect(extensionPayment!.amountSantim).toBe(1500);

    const duplicate = await api
      .post(`/api/v1/sessions/${session.id}/extend`)
      .set(auth(ctx.employerToken))
      .send({ packageId: extensionPackage.id, idempotencyKey: 'extension-1' });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data.extensions).toHaveLength(1);
  });

  it('honours admin settings for extensions, pausing and manual ending', async () => {
    const { session } = await startReadySession();

    await prisma.businessSettings.update({
      where: { businessId: ctx.businessId },
      data: { allowExtension: false, allowPause: false, allowManualEnd: false, requireEndReason: true },
    });

    const extensionPackage = await createPackage(ctx.businessId, { name: 'Blocked ext', durationMinutes: 5, priceSantim: 1000 });

    const extension = await api
      .post(`/api/v1/sessions/${session.id}/extend`)
      .set(auth(ctx.employerToken))
      .send({ packageId: extensionPackage.id });
    expect(extension.status).toBe(403);
    expect(extension.body.error.code).toBe('EXTENSION_DISABLED');

    const pause = await api
      .post(`/api/v1/sessions/${session.id}/pause`)
      .set(auth(ctx.employerToken));
    expect(pause.status).toBe(403);

    const end = await api
      .post(`/api/v1/sessions/${session.id}/end`)
      .set(auth(ctx.employerToken))
      .send({ reason: 'nope' });
    expect(end.status).toBe(403);
    expect(end.body.error.code).toBe('MANUAL_END_DISABLED');

    const adminEnd = await api
      .post(`/api/v1/sessions/${session.id}/end`)
      .set(auth(ctx.adminToken))
      .send({});
    expect(adminEnd.status).toBe(400);
    expect(adminEnd.body.error.code).toBe('REASON_REQUIRED');

    const adminEndWithReason = await api
      .post(`/api/v1/sessions/${session.id}/end`)
      .set(auth(ctx.adminToken))
      .send({ reason: 'Administrative closure' });
    expect(adminEndWithReason.status).toBe(200);

    await prisma.businessSettings.update({
      where: { businessId: ctx.businessId },
      data: { allowExtension: true, allowPause: true, allowManualEnd: true, requireEndReason: false },
    });
  });

  it('pauses and resumes with correct end-time accounting', async () => {
    const { session } = await startReadySession({ durationMinutes: 30 });

    const pause = await api
      .post(`/api/v1/sessions/${session.id}/pause`)
      .set(auth(ctx.employerToken));
    expect(pause.status).toBe(200);
    expect(pause.body.data.status).toBe('PAUSED');
    const originalEndsAt = new Date(session.endsAt).getTime();
    expect(new Date(pause.body.data.endsAt).getTime()).toBe(originalEndsAt);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const resume = await api
      .post(`/api/v1/sessions/${session.id}/resume`)
      .set(auth(ctx.employerToken));
    expect(resume.status).toBe(200);
    expect(resume.body.data.status).toBe('ACTIVE');
    expect(new Date(resume.body.data.endsAt).getTime()).toBeGreaterThan(originalEndsAt);
    expect(resume.body.data.totalPausedSeconds).toBeGreaterThanOrEqual(1);

    const pausedTwice = await api
      .post(`/api/v1/sessions/${session.id}/pause`)
      .set(auth(ctx.employerToken));
    expect(pausedTwice.status).toBe(200);
    await api.post(`/api/v1/sessions/${session.id}/resume`).set(auth(ctx.employerToken));
  });

  it('rejects the application of packages that are not assigned to the machine', async () => {
    const machineCategory = await prisma.equipmentCategory.create({
      data: { businessId: ctx.businessId, name: `Cat ${Date.now()}` },
    });
    const otherCategory = await prisma.equipmentCategory.create({
      data: { businessId: ctx.businessId, name: `Other ${Date.now()}` },
    });
    const { machine } = await createMachineWithQr(ctx.businessId, {
      code: `SCOPE-${Date.now().toString(36).slice(-4)}`,
      categoryId: machineCategory.id,
    });
    const scoped = await prisma.gamePackage.create({
      data: {
        businessId: ctx.businessId,
        name: 'Wrong category',
        durationMinutes: 10,
        priceSantim: 1000,
        scope: 'CATEGORY',
        categoryId: otherCategory.id,
      },
    });

    const payment = await api
      .post('/api/v1/payments/cash')
      .set(auth(ctx.employerToken))
      .send({ machineId: machine.id, packageId: scoped.id, idempotencyKey: 'wrong-scope-1' });

    expect(payment.status).toBe(400);
    expect(payment.body.error.code).toBe('PACKAGE_NOT_APPLICABLE');
  });

  it('lists payments and sessions scoped to the employer', async () => {
    const other = await createEmployerAccount(ctx.businessId, 'history-employer');
    const { machine } = await createMachineWithQr(ctx.businessId, { code: 'HIST-1' });
    const pkg = await createPackage(ctx.businessId);
    const payment = await cashPayment(other.token, machine.id, pkg.id);

    const ownPayments = await api.get('/api/v1/payments').set(auth(other.token));
    expect(ownPayments.status).toBe(200);
    expect(ownPayments.body.data.some((p: { id: string }) => p.id === payment.body.data.id)).toBe(true);

    const othersPayments = await api.get('/api/v1/payments').set(auth(ctx.employerToken));
    expect(othersPayments.body.data.some((p: { id: string }) => p.id === payment.body.data.id)).toBe(false);

    const adminPayments = await api.get('/api/v1/payments').set(auth(ctx.adminToken));
    expect(adminPayments.body.data.some((p: { id: string }) => p.id === payment.body.data.id)).toBe(true);
  });
});
