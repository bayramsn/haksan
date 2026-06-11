import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import * as argon2 from 'argon2';
import { eq, and } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { getDb, schema } from '../src/db/client';

let app: NestFastifyApplication;
let tenantA = { accessToken: '', companyId: '' };
let tenantB = { accessToken: '', userId: '', companyId: '' };

beforeAll(async () => {
  app = await createTestApp();
  const db = getDb();

  // Create a second tenant + user + company (Tenant B)
  const tenantSlug = 'tenant-b-iso-test';
  let tb = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, tenantSlug) });
  if (!tb) {
    [tb] = await db.insert(schema.tenants).values({ name: 'Tenant B', slug: tenantSlug, isActive: true }).returning();
  }
  let userB = await db.query.users.findFirst({
    where: and(eq(schema.users.tenantId, tb.id), eq(schema.users.email, 'tenantb@iso.test')),
  });
  if (!userB) {
    const hash = await argon2.hash('tenantb12345', { type: argon2.argon2id });
    [userB] = await db
      .insert(schema.users)
      .values({ tenantId: tb.id, email: 'tenantb@iso.test', fullName: 'Tenant B User', passwordHash: hash })
      .returning();
    // give admin role
    let adminRole = await db.query.roles.findFirst({ where: and(eq(schema.roles.tenantId, tb.id), eq(schema.roles.code, 'admin')) });
    if (!adminRole) {
      [adminRole] = await db.insert(schema.roles).values({ tenantId: tb.id, code: 'admin', name: 'Admin', isSystemRole: true }).returning();
      const allPerms = await db.query.permissions.findMany();
      const rows = allPerms.map((p) => ({ roleId: adminRole!.id, permissionId: p.id }));
      if (rows.length) await db.insert(schema.rolePermissions).values(rows).onConflictDoNothing();
    }
    await db.insert(schema.userRoles).values({ userId: userB.id, roleId: adminRole.id }).onConflictDoNothing();
  }
  tenantB.userId = userB.id;
  // company in tenant B
  let cb = await db.query.companies.findFirst({
    where: and(eq(schema.companies.tenantId, tb.id), eq(schema.companies.legalTitle, 'Tenant B Company')),
  });
  if (!cb) {
    [cb] = await db.insert(schema.companies).values({ tenantId: tb.id, legalTitle: 'Tenant B Company' }).returning();
  }
  tenantB.companyId = cb.id;

  // login as tenant B
  const tbLogin = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'tenantb@iso.test', password: 'tenantb12345' });
  tenantB.accessToken = tbLogin.body.accessToken;

  // login as tenant A (haksan admin)
  const taLogin = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'admin@haksan.local', password: 'admin12345' });
  tenantA.accessToken = taLogin.body.accessToken;
  // pick one of tenant A's companies
  const listA = await supertest(app.getHttpServer()).get('/api/v1/companies').set('Authorization', `Bearer ${tenantA.accessToken}`);
  tenantA.companyId = listA.body.data[0].id;
});

afterAll(async () => {
  await app.close();
});

describe('Tenant isolation', () => {
  it('Tenant A cannot see Tenant B company by id', async () => {
    const r = await supertest(app.getHttpServer())
      .get(`/api/v1/companies/${tenantB.companyId}`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`);
    expect(r.status).toBe(404);
  });

  it('Tenant B cannot see Tenant A company by id', async () => {
    const r = await supertest(app.getHttpServer())
      .get(`/api/v1/companies/${tenantA.companyId}`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(r.status).toBe(404);
  });

  it('Tenant B cannot update Tenant A company', async () => {
    const r = await supertest(app.getHttpServer())
      .patch(`/api/v1/companies/${tenantA.companyId}`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .send({ legalTitle: 'HACKED' });
    expect([403, 404]).toContain(r.status);
  });

  it('Tenant B company list only returns Tenant B records', async () => {
    const r = await supertest(app.getHttpServer())
      .get('/api/v1/companies')
      .set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(r.status).toBe(200);
    for (const c of r.body.data) {
      expect(c.id).not.toBe(tenantA.companyId);
    }
  });
});
