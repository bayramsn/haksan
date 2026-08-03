import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
const tokens: Record<string, string> = {};

async function login(server: any, email: string, password: string) {
  const r = await supertest(server).post('/api/v1/auth/login').send({ email, password });
  return r.body.accessToken as string;
}

beforeAll(async () => {
  app = await createTestApp();
  // Reset any lockouts from prior tests
  const { getDb } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');
  await getDb().execute(sql`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email LIKE '%@haksan.local'`);

  const server = app.getHttpServer();
  tokens.superAdmin = await login(server, 'superadmin@haksan.local', 'superadmin12345');
  tokens.admin = await login(server, 'admin@haksan.local', 'admin12345');
  tokens.sales = await login(server, 'sales@haksan.local', 'sales12345');
  tokens.service = await login(server, 'service@haksan.local', 'service12345');
  tokens.finance = await login(server, 'finance@haksan.local', 'finance12345');
});

afterAll(async () => {
  await app.close();
});

describe('RBAC permissions', () => {
  it('admin can read users', async () => {
    const r = await supertest(app.getHttpServer()).get('/api/v1/users').set('Authorization', `Bearer ${tokens.admin}`);
    expect(r.status).toBe(200);
  });

  it('admin can save and list user targets', async () => {
    const server = app.getHttpServer();
    const users = await supertest(server).get('/api/v1/users').set('Authorization', `Bearer ${tokens.admin}`);
    expect(users.status).toBe(200);
    const targetUser = users.body[0];
    expect(targetUser?.id).toBeTruthy();

    const period = '2026-06';
    const saved = await supertest(server)
      .post(`/api/v1/users/${targetUser.id}/targets`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        period,
        currency: 'USD',
        salesAmount: 420000,
        salesNewCustomers: 4,
        serviceCompleted: 12,
        digitalLeadTarget: 80,
        visitTarget: 20,
        callTarget: 120,
        quoteTarget: 16,
      });
    expect(saved.status).toBe(201);
    expect(saved.body.userId).toBe(targetUser.id);
    expect(saved.body.period).toBe(period);
    expect(saved.body.currency).toBe('USD');
    expect(Number(saved.body.salesAmount)).toBe(420000);
    expect(saved.body.visitTarget).toBe(20);

    const listed = await supertest(server)
      .get(`/api/v1/user-targets?period=${period}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(listed.status).toBe(200);
    expect(listed.body.some((row: any) => row.userId === targetUser.id && row.period === period)).toBe(true);
  });

  it('super_admin can create and update role permissions', async () => {
    const server = app.getHttpServer();
    const perms = await supertest(server).get('/api/v1/permissions').set('Authorization', `Bearer ${tokens.superAdmin}`);
    expect(perms.status).toBe(200);
    const reportsRead = perms.body.find((p: any) => p.code === 'reports.read');
    const reportsExport = perms.body.find((p: any) => p.code === 'reports.export');
    expect(reportsRead).toBeTruthy();
    expect(reportsExport).toBeTruthy();

    const code = `test_role_${Date.now()}`;
    const created = await supertest(server)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${tokens.superAdmin}`)
      .send({ code, name: 'Test Role', description: 'created by api test', permissionCodes: ['reports.read'] });
    expect(created.status).toBe(201);

    const patched = await supertest(server)
      .patch(`/api/v1/roles/${created.body.id}`)
      .set('Authorization', `Bearer ${tokens.superAdmin}`)
      .send({ name: 'Test Role Updated', description: 'updated by api test', permissionCodes: ['reports.read', 'reports.export'] });
    expect(patched.status).toBe(200);

    const roles = await supertest(server).get('/api/v1/roles').set('Authorization', `Bearer ${tokens.superAdmin}`);
    const updated = roles.body.find((r: any) => r.id === created.body.id);
    expect(updated.name).toBe('Test Role Updated');
    expect(updated.permissions.map((p: any) => p.code).sort()).toEqual(['reports.export', 'reports.read']);
  });

  it('admin can read roles but cannot create or update roles', async () => {
    const server = app.getHttpServer();
    const roles = await supertest(server).get('/api/v1/roles').set('Authorization', `Bearer ${tokens.admin}`);
    expect(roles.status).toBe(200);
    expect(roles.body.length).toBeGreaterThan(0);

    const created = await supertest(server)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ code: `admin_forbidden_${Date.now()}`, name: 'Forbidden Admin Role', permissionCodes: [] });
    expect(created.status).toBe(403);

    const patched = await supertest(server)
      .patch(`/api/v1/roles/${roles.body[0].id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ name: roles.body[0].name, permissionCodes: [] });
    expect(patched.status).toBe(403);
  });

  it('sales cannot read roles', async () => {
    const r = await supertest(app.getHttpServer()).get('/api/v1/roles').set('Authorization', `Bearer ${tokens.sales}`);
    expect(r.status).toBe(403);
  });

  it('sales cannot read users (admin scope)', async () => {
    const r = await supertest(app.getHttpServer()).get('/api/v1/users').set('Authorization', `Bearer ${tokens.sales}`);
    expect(r.status).toBe(403);
  });

  it('sales cannot delete users (admin scope)', async () => {
    const users = await supertest(app.getHttpServer()).get('/api/v1/users').set('Authorization', `Bearer ${tokens.admin}`);
    expect(users.status).toBe(200);
    const target = users.body.find((row: any) => row.email === 'readonly@haksan.local') ?? users.body[0];
    expect(target?.id).toBeTruthy();

    const r = await supertest(app.getHttpServer())
      .delete(`/api/v1/users/${target.id}`)
      .set('Authorization', `Bearer ${tokens.sales}`);
    expect(r.status).toBe(403);
  });

  it('admin (users.*) cannot delete users — deletion is super_admin only', async () => {
    const server = app.getHttpServer();
    const users = await supertest(server).get('/api/v1/users').set('Authorization', `Bearer ${tokens.admin}`);
    expect(users.status).toBe(200);
    const target = users.body.find((row: any) => row.email === 'readonly@haksan.local') ?? users.body[0];
    expect(target?.id).toBeTruthy();

    const r = await supertest(server)
      .delete(`/api/v1/users/${target.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(r.status).toBe(403);
  });

  it('admin can unlock a temporarily locked user account', async () => {
    const server = app.getHttpServer();
    const email = `locked-user-${Date.now()}@haksan.local`;
    const password = 'lockedUser12345';

    const created = await supertest(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        fullName: 'Locked User Test',
        email,
        username: `locked-${Date.now().toString(36)}`,
        password,
        roleCodes: ['readonly'],
        divisionIds: [],
      });
    expect(created.status).toBe(201);
    const userId = created.body.id;

    const { getDb } = await import('../src/db/client');
    const { users } = await import('../src/db/schema/users');
    const { eq } = await import('drizzle-orm');
    await getDb()
      .update(users)
      .set({ failedLoginAttempts: 9, lockedUntil: new Date(Date.now() + 10 * 60_000) })
      .where(eq(users.id, userId));

    const lockedLogin = await supertest(server).post('/api/v1/auth/login').send({ email, password });
    expect(lockedLogin.status).toBe(423);

    const listed = await supertest(server).get('/api/v1/users').set('Authorization', `Bearer ${tokens.admin}`);
    expect(listed.status).toBe(200);
    const lockedRow = listed.body.find((row: any) => row.id === userId);
    expect(lockedRow.failedLoginAttempts).toBe(9);
    expect(lockedRow.lockedUntil).toBeTruthy();

    const salesUnlock = await supertest(server)
      .post(`/api/v1/users/${userId}/unlock`)
      .set('Authorization', `Bearer ${tokens.sales}`)
      .send({});
    expect(salesUnlock.status).toBe(403);

    const unlocked = await supertest(server)
      .post(`/api/v1/users/${userId}/unlock`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({});
    expect(unlocked.status).toBe(201);
    expect(unlocked.body).toMatchObject({ ok: true, id: userId, failedLoginAttempts: 0, lockedUntil: null });

    const relogin = await supertest(server).post('/api/v1/auth/login').send({ email, password });
    expect(relogin.status).toBe(201);
    expect(relogin.body.accessToken).toBeTruthy();
  });

  it('super_admin can soft-delete a user, revoke refresh, and hide it from the user list', async () => {
    const server = app.getHttpServer();
    const email = `delete-user-${Date.now()}@haksan.local`;
    const password = 'deleteUser12345';

    const created = await supertest(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        fullName: 'Delete User Test',
        email,
        username: `delete-${Date.now().toString(36)}`,
        password,
        roleCodes: ['readonly'],
        divisionIds: [],
      });
    expect(created.status).toBe(201);
    const userId = created.body.id;
    expect(userId).toBeTruthy();

    const agent = supertest.agent(server);
    const login = await agent.post('/api/v1/auth/login').send({ email, password });
    expect(login.status).toBe(201);
    expect(login.body.accessToken).toBeTruthy();

    const removed = await supertest(server)
      .delete(`/api/v1/users/${userId}`)
      .set('Authorization', `Bearer ${tokens.superAdmin}`);
    expect(removed.status).toBe(200);
    expect(removed.body.ok).toBe(true);

    const listed = await supertest(server).get('/api/v1/users').set('Authorization', `Bearer ${tokens.admin}`);
    expect(listed.status).toBe(200);
    expect(listed.body.some((row: any) => row.id === userId)).toBe(false);

    const relogin = await supertest(server).post('/api/v1/auth/login').send({ email, password });
    expect(relogin.status).toBe(401);

    const refreshed = await agent.post('/api/v1/auth/refresh').send();
    expect(refreshed.status).toBe(401);
  });

  it('admin (users.*) cannot escalate by assigning super_admin; super_admin can', async () => {
    const server = app.getHttpServer();

    // createUser: a non-super-admin minting a new super_admin is rejected.
    const escalateCreate = await supertest(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        fullName: 'Escalation Attempt',
        email: `escalate-${Date.now()}@haksan.local`,
        username: `escalate-${Date.now().toString(36)}`,
        password: 'escalate12345',
        roleCodes: ['super_admin'],
        divisionIds: [],
      });
    expect(escalateCreate.status).toBe(403);

    // updateUser: a non-super-admin granting an existing user super_admin is rejected.
    const list = await supertest(server).get('/api/v1/users').set('Authorization', `Bearer ${tokens.admin}`);
    const target = list.body.find((row: any) => row.email === 'readonly@haksan.local') ?? list.body[0];
    expect(target?.id).toBeTruthy();
    const escalateUpdate = await supertest(server)
      .patch(`/api/v1/users/${target.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ roleCodes: ['super_admin'] });
    expect(escalateUpdate.status).toBe(403);

    // Positive control: super_admin may legitimately create another super_admin.
    const allowed = await supertest(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokens.superAdmin}`)
      .send({
        fullName: 'Legit Super Admin',
        email: `legit-sa-${Date.now()}@haksan.local`,
        username: `legit-sa-${Date.now().toString(36)}`,
        password: 'legitsa12345',
        roleCodes: ['super_admin'],
        divisionIds: [],
      });
    expect(allowed.status).toBe(201);
  });

  it('super_admin cannot delete their own account', async () => {
    const server = app.getHttpServer();
    const me = await supertest(server).get('/api/v1/auth/me').set('Authorization', `Bearer ${tokens.superAdmin}`);
    expect(me.status).toBe(200);

    const selfDelete = await supertest(server)
      .delete(`/api/v1/users/${me.body.user.id}`)
      .set('Authorization', `Bearer ${tokens.superAdmin}`);
    expect(selfDelete.status).toBe(403);
  });

  it('password & email changes are super_admin only; admin (users.*) is rejected', async () => {
    const server = app.getHttpServer();
    // Yan etki bırakmamak için bu teste özel atılabilir bir kullanıcı oluştur.
    const email = `pw-email-target-${Date.now()}@haksan.local`;
    const created = await supertest(server)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({
        fullName: 'PwEmail Target',
        email,
        username: `pw-target-${Date.now().toString(36)}`,
        password: 'initialPwd12345',
        roleCodes: ['readonly'],
        divisionIds: [],
      });
    expect(created.status).toBe(201);
    const targetId = created.body.id;

    // admin: şifre değişimi yasak
    const adminPw = await supertest(server)
      .patch(`/api/v1/users/${targetId}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ password: 'newPassword12345' });
    expect(adminPw.status).toBe(403);

    // admin: e-posta değişimi yasak
    const adminEmail = await supertest(server)
      .patch(`/api/v1/users/${targetId}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ email: `changed-${Date.now()}@haksan.local` });
    expect(adminEmail.status).toBe(403);

    // admin: hassas olmayan alan (fullName) hâlâ güncellenebilir
    const adminName = await supertest(server)
      .patch(`/api/v1/users/${targetId}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ fullName: 'PwEmail Target 2' });
    expect(adminName.status).toBe(200);

    // super_admin: şifre değişimi serbest
    const superPw = await supertest(server)
      .patch(`/api/v1/users/${targetId}`)
      .set('Authorization', `Bearer ${tokens.superAdmin}`)
      .send({ password: 'superSetPwd12345' });
    expect(superPw.status).toBe(200);

    // super_admin: e-posta değişimi serbest
    const newEmail = `pw-email-renamed-${Date.now()}@haksan.local`;
    const superEmail = await supertest(server)
      .patch(`/api/v1/users/${targetId}`)
      .set('Authorization', `Bearer ${tokens.superAdmin}`)
      .send({ email: newEmail });
    expect(superEmail.status).toBe(200);
  });

  it('sales can read companies', async () => {
    const r = await supertest(app.getHttpServer()).get('/api/v1/companies').set('Authorization', `Bearer ${tokens.sales}`);
    expect(r.status).toBe(200);
  });

  it('service cannot create quotes', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${tokens.service}`)
      .send({ companyId: '00000000-0000-0000-0000-000000000000', quoteDate: new Date().toISOString() });
    expect([403, 404, 400]).toContain(r.status); // 403 ideal; 400/404 acceptable if validation hits first
    // but the key is that NOT 201/200
    expect([200, 201]).not.toContain(r.status);
  });

  it('finance can list receivables (own scope)', async () => {
    const r = await supertest(app.getHttpServer()).get('/api/v1/receivables').set('Authorization', `Bearer ${tokens.finance}`);
    expect(r.status).toBe(200);
  });

  it('sales cannot list payments (finance scope)', async () => {
    const r = await supertest(app.getHttpServer()).get('/api/v1/payments').set('Authorization', `Bearer ${tokens.sales}`);
    expect(r.status).toBe(403);
  });
});
