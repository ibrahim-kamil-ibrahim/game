import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/database';
import {
  api,
  auth,
  createCategory,
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

describe('Machines and QR codes', () => {
  it('creates a machine with a permanent, non-guessable QR code', async () => {
    const category = await createCategory(ctx.businessId);

    const response = await api
      .post('/api/v1/machines')
      .set(auth(ctx.adminToken))
      .send({
        name: 'PS5 Station A',
        code: 'PS5-A',
        categoryId: category.id,
        brand: 'Sony',
        model: 'PlayStation 5',
        location: 'Front room',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.code).toBe('PS5-A');
    expect(response.body.data.qr.version).toBe(1);
    expect(response.body.data.qr.hint).toHaveLength(6);

    const stored = await prisma.machineQRCode.findFirst({
      where: { machineId: response.body.data.id, isActive: true },
    });
    expect(stored).toBeTruthy();
    expect(stored!.tokenHash).toHaveLength(64);
    expect(stored!.tokenHash.startsWith('PS5-A')).toBe(false);
    expect(stored!.tokenEncrypted).not.toContain('grs:v1:');
  });

  it('resolves a valid QR code and returns only applicable active packages', async () => {
    const { machine } = await createMachineWithQr(ctx.businessId, { name: 'Resolve Machine', code: 'RES-1' });
    await createPackage(ctx.businessId, { name: 'Global', durationMinutes: 15, priceSantim: 2500 });
    await prisma.gamePackage.create({
      data: {
        businessId: ctx.businessId,
        name: 'Inactive',
        durationMinutes: 10,
        priceSantim: 1000,
        status: 'INACTIVE',
      },
    });

    const qrJson = await api
      .get(`/api/v1/machines/${machine.id}/qr?format=json`)
      .set(auth(ctx.adminToken));
    expect(qrJson.status).toBe(200);
    expect(qrJson.body.data.payload.startsWith('grs:v1:')).toBe(true);

    const resolved = await api
      .post('/api/v1/qr/resolve')
      .set(auth(ctx.employerToken))
      .send({ token: qrJson.body.data.payload });

    expect(resolved.status).toBe(200);
    expect(resolved.body.data.machine.id).toBe(machine.id);
    expect(resolved.body.data.available).toBe(true);
    expect(resolved.body.data.packages).toHaveLength(1);
    expect(resolved.body.data.packages[0].name).toBe('Global');
  });

  it('rejects unknown and revoked QR payloads', async () => {
    const unknown = await api
      .post('/api/v1/qr/resolve')
      .set(auth(ctx.employerToken))
      .send({ token: 'grs:v1:this-token-does-not-exist' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('QR_NOT_RECOGNIZED');

    const { machine } = await createMachineWithQr(ctx.businessId, { code: 'REGEN-1' });
    const before = await api
      .get(`/api/v1/machines/${machine.id}/qr?format=json`)
      .set(auth(ctx.adminToken));
    const oldPayload = before.body.data.payload as string;

    const regenerated = await api
      .post(`/api/v1/machines/${machine.id}/qr/regenerate`)
      .set(auth(ctx.adminToken));
    expect(regenerated.status).toBe(200);
    expect(regenerated.body.data.version).toBe(2);

    const after = await api
      .get(`/api/v1/machines/${machine.id}/qr?format=json`)
      .set(auth(ctx.adminToken));
    const newPayload = after.body.data.payload as string;
    expect(newPayload).not.toBe(oldPayload);

    const oldResolve = await api
      .post('/api/v1/qr/resolve')
      .set(auth(ctx.employerToken))
      .send({ token: oldPayload });
    expect(oldResolve.status).toBe(404);

    const newResolve = await api
      .post('/api/v1/qr/resolve')
      .set(auth(ctx.employerToken))
      .send({ token: newPayload });
    expect(newResolve.status).toBe(200);
  });

  it('refuses QR scans for machines under maintenance or inactive', async () => {
    for (const status of ['MAINTENANCE', 'INACTIVE'] as const) {
      const { machine, qrPayload } = await createMachineWithQr(ctx.businessId, {
        code: `STATE-${status}`,
        status,
      });
      const resolved = await api
        .post('/api/v1/qr/resolve')
        .set(auth(ctx.employerToken))
        .send({ token: qrPayload });

      expect(resolved.status).toBe(409);
      expect(resolved.body.error.details.machine.id).toBe(machine.id);
      expect(['MACHINE_MAINTENANCE', 'MACHINE_INACTIVE']).toContain(resolved.body.error.code);
    }
  });

  it('serves the QR code as PNG and PDF for printing', async () => {
    const { machine } = await createMachineWithQr(ctx.businessId, { code: 'PRINT-1' });

    const png = await api.get(`/api/v1/machines/${machine.id}/qr?format=png`).set(auth(ctx.adminToken));
    expect(png.status).toBe(200);
    expect(png.headers['content-type']).toContain('image/png');
    expect(png.body.length).toBeGreaterThan(1000);

    const pdf = await api.get(`/api/v1/machines/${machine.id}/qr?format=pdf`).set(auth(ctx.adminToken));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.body.slice(0, 4).toString()).toBe('%PDF');
  });

  it('prevents duplicate machine codes and unauthorized mutations', async () => {
    await createMachineWithQr(ctx.businessId, { code: 'DUP-1' });
    const duplicate = await api
      .post('/api/v1/machines')
      .set(auth(ctx.adminToken))
      .send({ name: 'Duplicate', code: 'DUP-1' });
    expect(duplicate.status).toBe(409);

    const employerAttempt = await api
      .post('/api/v1/machines')
      .set(auth(ctx.employerToken))
      .send({ name: 'Not allowed', code: 'NOPE-1' });
    expect(employerAttempt.status).toBe(403);
  });

  it('blocks status changes while a machine has an active session', async () => {
    const { machine, qrPayload } = await createMachineWithQr(ctx.businessId, { code: 'BUSY-1' });
    const pkg = await createPackage(ctx.businessId);
    const payment = await api
      .post('/api/v1/payments/cash')
      .set(auth(ctx.employerToken))
      .send({ machineId: machine.id, packageId: pkg.id, idempotencyKey: 'busy-machine-payment' });
    expect(payment.status).toBe(201);

    const start = await api
      .post('/api/v1/sessions/start')
      .set(auth(ctx.employerToken))
      .send({ paymentId: payment.body.data.id, qrToken: qrPayload });
    expect(start.status).toBe(201);

    const maintenance = await api
      .patch(`/api/v1/machines/${machine.id}/status`)
      .set(auth(ctx.adminToken))
      .send({ status: 'MAINTENANCE' });
    expect(maintenance.status).toBe(409);
    expect(maintenance.body.error.code).toBe('MACHINE_HAS_ACTIVE_SESSION');
  });

  it('provides live machine monitoring data to admins', async () => {
    const live = await api.get('/api/v1/machines/live').set(auth(ctx.adminToken));
    expect(live.status).toBe(200);
    expect(live.body.data.summary.total).toBeGreaterThan(0);
    expect(Array.isArray(live.body.data.machines)).toBe(true);
    expect(live.body.data.serverTime).toBeTruthy();

    const employerLive = await api.get('/api/v1/machines/live').set(auth(ctx.employerToken));
    expect(employerLive.status).toBe(403);
  });
});
