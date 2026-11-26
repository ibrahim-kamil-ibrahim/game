import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/database';
import { api, auth, resetDatabase, seedBase, type TestContext } from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  await resetDatabase();
  ctx = await seedBase();
});

describe('Employer credential provisioning', () => {
  it('auto-generates a username and temporary password and exposes them to the admin', async () => {
    const created = await api
      .post('/api/v1/admin/employers')
      .set(auth(ctx.adminToken))
      .send({ fullName: 'Generated Employer', phone: '+251900111222' });

    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toContain('no-store');

    const username = created.body.data.username as string;
    const tempPassword = created.body.data.temporaryPassword as string;

    expect(username).toMatch(/^[a-z0-9._-]+$/);
    expect(username).toContain('generated-employer');
    expect(tempPassword.length).toBeGreaterThanOrEqual(14);
    expect(tempPassword).toMatch(/[A-Za-z]/);
    expect(tempPassword).toMatch(/[0-9]/);

    const detail = await api
      .get(`/api/v1/admin/employers/${created.body.data.id}`)
      .set(auth(ctx.adminToken));

    expect(detail.status).toBe(200);
    expect(detail.headers['cache-control']).toContain('no-store');
    expect(detail.body.data.credentials.username).toBe(username);
    expect(detail.body.data.credentials.temporaryPassword).toBe(tempPassword);
    expect(detail.body.data.credentials.setAt).toBeTruthy();

    // The hash, not the temporary password, is what authenticates.
    const login = await api
      .post('/api/v1/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username, password: tempPassword });
    expect(login.status).toBe(200);

    // The employer's credentials remain readable and copyable by the admin
    // even after sign-in.
    const afterLogin = await api
      .get(`/api/v1/admin/employers/${created.body.data.id}`)
      .set(auth(ctx.adminToken));
    expect(afterLogin.body.data.credentials.temporaryPassword).toBe(tempPassword);
    expect(afterLogin.body.data.credentials.setAt).toBeTruthy();

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(stored.initialPasswordEncrypted).toBeTruthy();
    expect(stored.passwordHash).not.toBe(tempPassword);
    expect(stored.passwordHash.startsWith('$2')).toBe(true);
  });

  it('supports an admin password reset that generates a new temporary password', async () => {
    const created = await api
      .post('/api/v1/admin/employers')
      .set(auth(ctx.adminToken))
      .send({ fullName: 'Reset Credential Tester' });

    const username = created.body.data.username as string;
    const oldPassword = created.body.data.temporaryPassword as string;

    const reset = await api
      .post(`/api/v1/admin/employers/${created.body.data.id}/reset-password`)
      .set(auth(ctx.adminToken))
      .send({});

    expect(reset.status).toBe(200);
    expect(reset.headers['cache-control']).toContain('no-store');
    const newPassword = reset.body.data.temporaryPassword as string;
    expect(newPassword).toBeTruthy();
    expect(newPassword).not.toBe(oldPassword);

    const oldLogin = await api
      .post('/api/v1/auth/login')
      .send({ username, password: oldPassword });
    expect(oldLogin.status).toBe(401);

    const newLogin = await api
      .post('/api/v1/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username, password: newPassword });
    expect(newLogin.status).toBe(200);

    const detail = await api
      .get(`/api/v1/admin/employers/${created.body.data.id}`)
      .set(auth(ctx.adminToken));
    expect(detail.body.data.credentials.temporaryPassword).toBe(newPassword);
  });

  it('keeps explicit usernames/passwords for API compatibility and rejects duplicates', async () => {
    const created = await api
      .post('/api/v1/admin/employers')
      .set(auth(ctx.adminToken))
      .send({
        fullName: 'Explicit Credentials',
        username: 'explicit.user',
        password: 'Explicit@12345',
      });

    expect(created.status).toBe(201);
    expect(created.body.data.username).toBe('explicit.user');
    expect(created.body.data.temporaryPassword).toBe('Explicit@12345');

    const duplicate = await api
      .post('/api/v1/admin/employers')
      .set(auth(ctx.adminToken))
      .send({ fullName: 'Duplicate', username: 'explicit.user' });
    expect(duplicate.status).toBe(409);

    const login = await api
      .post('/api/v1/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username: 'explicit.user', password: 'Explicit@12345' });
    expect(login.status).toBe(200);
  });

  it('soft-deletes an employer and blocks further logins', async () => {
    const created = await api
      .post('/api/v1/admin/employers')
      .set(auth(ctx.adminToken))
      .send({ fullName: 'Delete Me' });
    expect(created.status).toBe(201);

    const deleted = await api
      .delete(`/api/v1/admin/employers/${created.body.data.id}`)
      .set(auth(ctx.adminToken));
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.deleted).toBe(true);

    const login = await api
      .post('/api/v1/auth/login')
      .set('x-client-type', 'mobile')
      .send({ username: created.body.data.username, password: created.body.data.temporaryPassword });
    expect(login.status).toBe(401);
  });
});
