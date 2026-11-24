import supertest from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/config/database';
import { hashPassword } from '../src/utils/auth';
import { encryptSecret } from '../src/utils/crypto';
import { generateMachineQrToken, qrImagePayload } from '../src/services/qrService';

export const app: Express = createApp();
export const api = supertest(app);

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "SessionEvent", "SessionExtension", "GameSession", "Payment",
      "PackageMachine", "GamePackage", "MachineQRCode", "GameMachine",
      "EquipmentCategory", "RefreshToken", "AuditLog", "Notification",
      "Expense", "BusinessSettings", "User", "Business"
    RESTART IDENTITY CASCADE;
  `);
}

export interface TestContext {
  businessId: string;
  adminId: string;
  adminToken: string;
  employerId: string;
  employerToken: string;
}

export async function seedBase() {
  const business = await prisma.business.create({
    data: {
      name: 'Test Gaming Center',
      timezone: 'Africa/Addis_Ababa',
      currency: 'ETB',
      settings: {
        create: {
          allowExtension: true,
          allowPause: true,
          allowManualEnd: true,
          requireEndReason: false,
          expiryWarningMinutes: 5,
        },
      },
    },
  });

  const passwordHash = await hashPassword('Password@123');
  const admin = await prisma.user.create({
    data: {
      businessId: business.id,
      role: 'ADMIN',
      fullName: 'Test Admin',
      username: 'admin-test',
      passwordHash,
      status: 'ACTIVE',
    },
  });
  const employer = await prisma.user.create({
    data: {
      businessId: business.id,
      role: 'EMPLOYER',
      fullName: 'Test Employer',
      username: 'employer-test',
      passwordHash,
      status: 'ACTIVE',
    },
  });

  const adminLogin = await api
    .post('/api/v1/auth/login')
    .set('x-client-type', 'mobile')
    .send({ username: 'admin-test', password: 'Password@123' });
  const employerLogin = await api
    .post('/api/v1/auth/login')
    .set('x-client-type', 'mobile')
    .send({ username: 'employer-test', password: 'Password@123' });

  if (adminLogin.status !== 200 || employerLogin.status !== 200) {
    throw new Error(`Login failed in test seeding: ${adminLogin.status}/${employerLogin.status}`);
  }

  return {
    businessId: business.id,
    adminId: admin.id,
    adminToken: adminLogin.body.data.accessToken as string,
    employerId: employer.id,
    employerToken: employerLogin.body.data.accessToken as string,
  } satisfies TestContext;
}

export async function createEmployerAccount(
  businessId: string,
  username: string,
  fullName = 'Second Employer',
) {
  const passwordHash = await hashPassword('Password@123');
  const user = await prisma.user.create({
    data: {
      businessId,
      role: 'EMPLOYER',
      fullName,
      username,
      passwordHash,
      status: 'ACTIVE',
    },
  });
  const login = await api
    .post('/api/v1/auth/login')
    .set('x-client-type', 'mobile')
    .send({ username, password: 'Password@123' });
  return { user, token: login.body.data.accessToken as string };
}

export async function createCategory(businessId: string, name = 'Console') {
  return prisma.equipmentCategory.create({ data: { businessId, name } });
}

export async function createPackage(
  businessId: string,
  data: { name?: string; durationMinutes?: number; priceSantim?: number; scope?: 'ALL' | 'CATEGORY' | 'MACHINES' } = {},
) {
  return prisma.gamePackage.create({
    data: {
      businessId,
      name: data.name ?? 'Standard',
      durationMinutes: data.durationMinutes ?? 30,
      priceSantim: data.priceSantim ?? 5000,
      scope: data.scope ?? 'ALL',
      status: 'ACTIVE',
    },
  });
}

export async function createMachineWithQr(
  businessId: string,
  data: { name?: string; code?: string; categoryId?: string | null; status?: 'AVAILABLE' | 'MAINTENANCE' | 'INACTIVE' } = {},
) {
  const qr = generateMachineQrToken();
  const machine = await prisma.gameMachine.create({
    data: {
      businessId,
      name: data.name ?? 'Machine One',
      code: data.code ?? `M-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      categoryId: data.categoryId ?? null,
      status: data.status ?? 'AVAILABLE',
      qrCodes: {
        create: {
          tokenHash: qr.tokenHash,
          tokenEncrypted: encryptSecret(qr.token),
          tokenHint: qr.tokenHint,
          version: 1,
        },
      },
    },
  });
  return { machine, qrPayload: qrImagePayload(qr.token) };
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function cashPayment(
  token: string,
  machineId: string,
  packageId: string,
  idempotencyKey = `idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
) {
  return api
    .post('/api/v1/payments/cash')
    .set(auth(token))
    .send({ machineId, packageId, idempotencyKey });
}
