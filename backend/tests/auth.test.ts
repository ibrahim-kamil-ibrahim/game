import { describe, expect, it, beforeAll } from 'vitest';
import { prisma } from '../src/config/database';
import { api, auth, resetDatabase, seedBase, type TestContext } from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  await resetDatabase();
  ctx = await seedBase();
});

describe('Authentication', () => {
  it('logs in an admin and returns the profile', async () => {
    const response = await api
      .post('/api/v1/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username: 'admin-test', password: 'Password@123' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.role).toBe('ADMIN');
    expect(response.body.data.accessToken).toBeTruthy();
    expect(response.body.data.refreshToken).toBeTruthy();

    const me = await api.get('/api/v1/auth/me').set(auth(ctx.adminToken));
    expect(me.status).toBe(200);
    expect(me.body.data.user.username).toBe('admin-test');
    expect(me.body.data.user.business.name).toBe('Test Gaming Center');
  });

  it('rejects a wrong password without leaking which field was wrong', async () => {
    const response = await api
      .post('/api/v1/auth/login')
      .send({ username: 'admin-test', password: 'wrong-password' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(response.body.error.message).toBe('Invalid username or password');
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const login = await api
      .post('/api/v1/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username: 'employer-test', password: 'Password@123' });

    const original = login.body.data.refreshToken as string;

    const refreshed = await api
      .post('/api/v1/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: original });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.refreshToken).not.toBe(original);

    const reused = await api
      .post('/api/v1/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: original });

    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('REFRESH_TOKEN_REUSED');

    // The whole family was revoked, including the rotated token.
    const familyToken = refreshed.body.data.refreshToken as string;
    const afterReuse = await api
      .post('/api/v1/auth/refresh')
      .set('x-client-type', 'mobile')
      .send({ refreshToken: familyToken });
    expect(afterReuse.status).toBe(401);
  });

  it('blocks suspended employers even with a previously valid token', async () => {
    const login = await api
      .post('/api/v1/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username: 'employer-test', password: 'Password@123' });
    const token = login.body.data.accessToken as string;

    await prisma.user.update({
      where: { id: ctx.employerId },
      data: { status: 'SUSPENDED' },
    });

    const me = await api.get('/api/v1/auth/me').set(auth(token));
    expect(me.status).toBe(403);
    expect(me.body.error.code).toBe('ACCOUNT_SUSPENDED');

    const reLogin = await api
      .post('/api/v1/auth/login')
      .send({ username: 'employer-test', password: 'Password@123' });
    expect(reLogin.status).toBe(403);

    await prisma.user.update({ where: { id: ctx.employerId }, data: { status: 'ACTIVE' } });
  });

  it('enforces role-based access control on the backend', async () => {
    const dashboard = await api.get('/api/v1/admin/dashboard').set(auth(ctx.employerToken));
    expect(dashboard.status).toBe(403);

    const createMachine = await api
      .post('/api/v1/machines')
      .set(auth(ctx.employerToken))
      .send({ name: 'Hack Machine', code: 'HACK-1' });
    expect(createMachine.status).toBe(403);

    const expenses = await api.get('/api/v1/expenses').set(auth(ctx.employerToken));
    expect(expenses.status).toBe(403);

    const adminDashboard = await api.get('/api/v1/admin/dashboard').set(auth(ctx.adminToken));
    expect(adminDashboard.status).toBe(200);

    const unauthenticated = await api.get('/api/v1/machines');
    expect(unauthenticated.status).toBe(401);
  });

  it('changes the password and revokes existing refresh tokens', async () => {
    const created = await prisma.user.create({
      data: {
        businessId: ctx.businessId,
        role: 'EMPLOYER',
        fullName: 'Password Tester',
        username: 'password-tester',
        passwordHash: await import('../src/utils/auth').then((m) => m.hashPassword('Password@123')),
        status: 'ACTIVE',
      },
    });

    const login = await api
      .post('/api/v1/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username: 'password-tester', password: 'Password@123' });
    const token = login.body.data.accessToken as string;
    const refreshToken = login.body.data.refreshToken as string;

    const changed = await api
      .patch('/api/v1/auth/password')
      .set(auth(token))
      .send({ currentPassword: 'Password@123', newPassword: 'NewPassword@456' });
    expect(changed.status).toBe(200);

    const oldPassword = await api
      .post('/api/v1/auth/login')
      .send({ username: 'password-tester', password: 'Password@123' });
    expect(oldPassword.status).toBe(401);

    const newPassword = await api
      .post('/api/v1/auth/login')
      .send({ username: 'password-tester', password: 'NewPassword@456' });
    expect(newPassword.status).toBe(200);

    const revokedRefresh = await api
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });
    expect(revokedRefresh.status).toBe(401);

    await prisma.user.delete({ where: { id: created.id } });
  });
});
