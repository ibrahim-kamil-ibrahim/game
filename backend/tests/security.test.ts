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

describe('Security and authorization boundaries', () => {
  it('prevents employers from reading another employer records', async () => {
    const other = await createEmployerAccount(ctx.businessId, 'private-employer');
    const { machine } = await createMachineWithQr(ctx.businessId, { code: 'PRIV-1' });
    const pkg = await createPackage(ctx.businessId);
    const payment = await cashPayment(other.token, machine.id, pkg.id);

    const sessionStart = await api
      .post('/api/v1/sessions/start')
      .set(auth(other.token))
      .send({ paymentId: payment.body.data.id });
    expect(sessionStart.status).toBe(201);
    const sessionId = sessionStart.body.data.session.id as string;

    expect((await api.get(`/api/v1/payments/${payment.body.data.id}`).set(auth(ctx.employerToken))).status).toBe(403);
    expect((await api.get(`/api/v1/sessions/${sessionId}`).set(auth(ctx.employerToken))).status).toBe(403);
    expect((await api.get(`/api/v1/sessions/${sessionId}/events`).set(auth(ctx.employerToken))).status).toBe(403);

    const otherHistory = await api.get('/api/v1/payments').set(auth(ctx.employerToken));
    expect(otherHistory.body.data.some((item: { id: string }) => item.id === payment.body.data.id)).toBe(false);

    // The admin is allowed to inspect everything.
    expect((await api.get(`/api/v1/sessions/${sessionId}`).set(auth(ctx.adminToken))).status).toBe(200);
  });

  it('blocks employers from every administrative surface', async () => {
    const employerToken = ctx.employerToken;
    const attempts = await Promise.all([
      api.get('/api/v1/admin/employers').set(auth(employerToken)),
      api.post('/api/v1/admin/employers').set(auth(employerToken)).send({
        fullName: 'Sneaky',
        username: 'sneaky',
        password: 'Password@123',
      }),
      api.post('/api/v1/packages').set(auth(employerToken)).send({
        name: 'Cheap',
        durationMinutes: 60,
        priceSantim: 1,
      }),
      api.patch('/api/v1/settings').set(auth(employerToken)).send({ allowExtension: true }),
      api.get('/api/v1/expenses').set(auth(employerToken)),
      api.get('/api/v1/reports/revenue').set(auth(employerToken)),
      api.get('/api/v1/admin/audit-logs').set(auth(employerToken)),
      api.post('/api/v1/categories').set(auth(employerToken)).send({ name: 'Nope' }),
      api.get('/api/v1/machines/live').set(auth(employerToken)),
    ]);

    for (const attempt of attempts) {
      expect(attempt.status).toBe(403);
    }
  });

  it('rejects missing, malformed and expired-style tokens', async () => {
    expect((await api.get('/api/v1/sessions/active')).status).toBe(401);
    expect(
      (await api.get('/api/v1/sessions/active').set({ Authorization: 'Bearer not-a-jwt' })).status,
    ).toBe(401);
    expect(
      (await api.get('/api/v1/sessions/active').set({ Authorization: 'Basic abc123' })).status,
    ).toBe(401);
  });

  it('ignores client-supplied employer override and validates employers on admin payments', async () => {
    const other = await createEmployerAccount(ctx.businessId, 'override-employer');
    const { machine } = await createMachineWithQr(ctx.businessId, { code: 'OVR-1' });
    const pkg = await createPackage(ctx.businessId);

    const payment = await api
      .post('/api/v1/payments/cash')
      .set(auth(ctx.employerToken))
      .send({
        machineId: machine.id,
        packageId: pkg.id,
        idempotencyKey: 'override-payment',
        employerId: other.user.id,
      });

    expect(payment.status).toBe(201);
    expect(payment.body.data.employer.id).toBe(ctx.employerId);

    const adminMissingEmployer = await api
      .post('/api/v1/payments/cash')
      .set(auth(ctx.adminToken))
      .send({ machineId: machine.id, packageId: pkg.id, idempotencyKey: 'admin-payment-1' });
    expect(adminMissingEmployer.status).toBe(400);
  });

  it('protects completed financial records from deletion and mutation', async () => {
    const { machine } = await createMachineWithQr(ctx.businessId, { code: 'FIN-1' });
    const pkg = await createPackage(ctx.businessId);
    const payment = await cashPayment(ctx.employerToken, machine.id, pkg.id);
    const started = await api
      .post('/api/v1/sessions/start')
      .set(auth(ctx.employerToken))
      .send({ paymentId: payment.body.data.id });
    const sessionId = started.body.data.session.id as string;

    const employerVoid = await api
      .post(`/api/v1/payments/${payment.body.data.id}/void`)
      .set(auth(ctx.employerToken))
      .send({ reason: 'try to remove my record' });
    expect(employerVoid.status).toBe(403);

    const adminVoidLinked = await api
      .post(`/api/v1/payments/${payment.body.data.id}/void`)
      .set(auth(ctx.adminToken))
      .send({ reason: 'attempt' });
    expect(adminVoidLinked.status).toBe(409);

    const adminRefundActive = await api
      .post(`/api/v1/payments/${payment.body.data.id}/refund`)
      .set(auth(ctx.adminToken))
      .send({ reason: 'attempt' });
    expect(adminRefundActive.status).toBe(409);

    await api
      .post(`/api/v1/sessions/${sessionId}/end`)
      .set(auth(ctx.employerToken))
      .send({ reason: 'done' });

    const refund = await api
      .post(`/api/v1/payments/${payment.body.data.id}/refund`)
      .set(auth(ctx.adminToken))
      .send({ reason: 'Customer complaint' });
    expect(refund.status).toBe(200);
    expect(refund.body.data.status).toBe('REFUNDED');

    const paymentStillExists = await prisma.payment.findUnique({ where: { id: payment.body.data.id } });
    expect(paymentStillExists).toBeTruthy();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'PAYMENT_REFUNDED', entityId: payment.body.data.id },
    });
    expect(audit).toBeTruthy();
  });

  it('audits privileged changes with actor and before/after values', async () => {
    const pkg = await createPackage(ctx.businessId, {
      name: 'Audit Package',
      durationMinutes: 30,
      priceSantim: 5000,
    });

    const updated = await api
      .patch(`/api/v1/packages/${pkg.id}`)
      .set(auth(ctx.adminToken))
      .send({ priceSantim: 6000 });
    expect(updated.status).toBe(200);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'GamePackage', entityId: pkg.id, action: 'PACKAGE_UPDATED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeTruthy();
    expect(audit!.userId).toBe(ctx.adminId);
    expect((audit!.before as { priceSantim: number }).priceSantim).toBe(5000);
    expect((audit!.after as { priceSantim: number }).priceSantim).toBe(6000);
  });

  it('requires authentication to resolve QR payloads', async () => {
    const response = await api.post('/api/v1/qr/resolve').send({ token: 'grs:v1:abc' });
    expect(response.status).toBe(401);
  });
});
