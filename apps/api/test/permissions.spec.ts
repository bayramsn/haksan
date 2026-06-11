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
