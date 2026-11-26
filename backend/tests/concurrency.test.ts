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

describe('Concurrent session protection', () => {
  it('allows only one of two simultaneous starts on the same machine', async () => {
    const second = await createEmployerAccount(ctx.businessId, 'race-employer');
    const { machine, qrPayload } = await createMachineWithQr(ctx.businessId, { code: 'RACE-1' });
    const pkg = await createPackage(ctx.businessId, { durationMinutes: 15, priceSantim: 3000 });

    const paymentA = await cashPayment(ctx.employerToken, machine.id, pkg.id, 'race-payment-a');
    const paymentB = await cashPayment(second.token, machine.id, pkg.id, 'race-payment-b');
    expect(paymentA.status).toBe(201);
    expect(paymentB.status).toBe(201);

    const [startA, startB] = await Promise.all([
      api.post('/api/v1/sessions/start').set(auth(ctx.employerToken)).send({ paymentId: paymentA.body.data.id, qrToken: qrPayload }),
      api.post('/api/v1/sessions/start').set(auth(second.token)).send({ paymentId: paymentB.body.data.id, qrToken: qrPayload }),
    ]);

    const statuses = [startA.status, startB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const activeSessions = await prisma.gameSession.count({
      where: { machineId: machine.id, status: { in: ['ACTIVE', 'PAUSED', 'CREATED'] } },
    });
    expect(activeSessions).toBe(1);

    const payments = await prisma.payment.findMany({ where: { machineId: machine.id } });
    const voided = payments.filter((payment) => payment.status === 'VOIDED');
    expect(voided).toHaveLength(1);
    expect(payments.filter((payment) => payment.status === 'PAID')).toHaveLength(1);

    const machineAfter = await prisma.gameMachine.findUniqueOrThrow({ where: { id: machine.id } });
    expect(machineAfter.status).toBe('IN_USE');
  });

  it('returns the same session for parallel retries of the same payment', async () => {
    const { machine, qrPayload } = await createMachineWithQr(ctx.businessId, { code: 'RACE-2' });
    const pkg = await createPackage(ctx.businessId);
    const payment = await cashPayment(ctx.employerToken, machine.id, pkg.id);

    const [first, second] = await Promise.all([
      api.post('/api/v1/sessions/start').set(auth(ctx.employerToken)).send({ paymentId: payment.body.data.id, qrToken: qrPayload }),
      api.post('/api/v1/sessions/start').set(auth(ctx.employerToken)).send({ paymentId: payment.body.data.id, qrToken: qrPayload }),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 201]);
    expect(first.body.data.session.id).toBe(second.body.data.session.id);

    const count = await prisma.gameSession.count({ where: { paymentId: payment.body.data.id } });
    expect(count).toBe(1);
  });

  it('enforces the database partial unique index independently of application logic', async () => {
    const { machine, qrPayload } = await createMachineWithQr(ctx.businessId, { code: 'RACE-3' });
    const pkg = await createPackage(ctx.businessId);
    const paymentA = await cashPayment(ctx.employerToken, machine.id, pkg.id);
    const started = await api
      .post('/api/v1/sessions/start')
      .set(auth(ctx.employerToken))
      .send({ paymentId: paymentA.body.data.id, qrToken: qrPayload });
    expect(started.status).toBe(201);

    // Attempting to insert a second active session directly must fail at the DB
    // layer, protecting even future code paths that forget the application check.
    const business = await prisma.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
    const secondPayment = await prisma.payment.create({
      data: {
        businessId: business.id,
        transactionRef: `DIRECT-${Date.now()}`,
        type: 'RENTAL',
        employerId: ctx.employerId,
        createdById: ctx.employerId,
        machineId: machine.id,
        packageId: pkg.id,
        packageNameSnapshot: pkg.name,
        durationMinutesSnapshot: pkg.durationMinutes,
        amountSantim: pkg.priceSantim,
        method: 'CASH',
        status: 'PAID',
        paidAt: new Date(),
      },
    });

    await expect(
      prisma.gameSession.create({
        data: {
          businessId: business.id,
          machineId: machine.id,
          employerId: ctx.employerId,
          paymentId: secondPayment.id,
          packageId: pkg.id,
          packageNameSnapshot: pkg.name,
          durationMinutesSnapshot: pkg.durationMinutes,
          priceSantim: pkg.priceSantim,
          status: 'ACTIVE',
          startedAt: new Date(),
          endsAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      }),
    ).rejects.toThrow();
  });
});
