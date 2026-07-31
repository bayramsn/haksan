import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq } from 'drizzle-orm';
import { createTestApp } from './setup';
import type { DbClient } from '../src/db/client';
import { auditLogs } from '../src/db/schema/audit';
import { opportunities } from '../src/db/schema/crm';
import { DB } from '../src/shared/database/database.module';

let app: NestFastifyApplication;
let db: DbClient;
let superAdminToken = '';
let superAdminUserId = '';
let readonlyToken = '';
let companyId = '';
const suffix = Date.now();

beforeAll(async () => {
  app = await createTestApp();
  db = app.get<DbClient>(DB);
  const server = app.getHttpServer();

  const [superAdminLogin, readonlyLogin] = await Promise.all([
    supertest(server)
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' }),
    supertest(server)
      .post('/api/v1/auth/login')
      .send({ email: 'readonly@haksan.local', password: 'readonly12345' }),
  ]);
  superAdminToken = superAdminLogin.body.accessToken;
  superAdminUserId = superAdminLogin.body.user.id;
  readonlyToken = readonlyLogin.body.accessToken;

  const companies = await supertest(server)
    .get('/api/v1/companies?pageSize=1')
    .set('Authorization', `Bearer ${superAdminToken}`);
  companyId = companies.body.data[0].id;
});

afterAll(async () => {
  await app.close();
});

async function expectSoftDeleted(id: string, actorUserId: string) {
  const row = await db.query.opportunities.findFirst({ where: eq(opportunities.id, id) });
  expect(row?.deletedAt).toBeInstanceOf(Date);
  expect(row?.updatedBy).toBe(actorUserId);

  const audit = await db.query.auditLogs.findFirst({
    where: and(
      eq(auditLogs.action, 'opportunity.deleted'),
      eq(auditLogs.resourceType, 'opportunity'),
      eq(auditLogs.resourceId, id),
    ),
  });
  expect(audit).toMatchObject({
    actorUserId,
    action: 'opportunity.deleted',
    resourceType: 'opportunity',
    resourceId: id,
  });
  expect(audit?.newValues).toMatchObject({ deletedAt: expect.any(String) });
}

describe('Lead and opportunity card deletion', () => {
  it('enforces delete permission and soft-deletes a Lead card', async () => {
    const server = app.getHttpServer();
    const created = await supertest(server)
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        leadContactName: `Silinecek Lead ${suffix}`,
        leadContactValue: '05325550001',
        title: `Silinecek Lead ürünü ${suffix}`,
        currencyCode: 'TRY',
      });

    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.qualificationStage).toBe('lead');
    const leadId = created.body.id as string;

    const forbidden = await supertest(server)
      .delete(`/api/v1/opportunities/${leadId}`)
      .set('Authorization', `Bearer ${readonlyToken}`);
    expect(forbidden.status).toBe(403);

    const removed = await supertest(server)
      .delete(`/api/v1/opportunities/${leadId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect(removed.body).toMatchObject({ ok: true, deletedAt: expect.any(String) });

    const hiddenDetail = await supertest(server)
      .get(`/api/v1/opportunities/${leadId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(hiddenDetail.status).toBe(404);

    const leads = await supertest(server)
      .get('/api/v1/opportunities?lifecycle=lead&pageSize=100')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(leads.body.data.some((row: { id: string }) => row.id === leadId)).toBe(false);

    await expectSoftDeleted(leadId, superAdminUserId);
  });

  it('soft-deletes a converted opportunity from the opportunity pool', async () => {
    const server = app.getHttpServer();
    const created = await supertest(server)
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        companyId,
        ownerUserId: superAdminUserId,
        title: `Silinecek Fırsat ${suffix}`,
        currencyCode: 'EUR',
        nextAction: 'Silme testinden önce takip',
        nextActionAt: '2030-01-15T09:30:00.000Z',
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const opportunityId = created.body.id as string;
    const converted = await supertest(server)
      .post(`/api/v1/opportunities/${opportunityId}/convert`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ note: 'Silme akışı testi', overrideReason: 'Silme testi için nitelendirme eksikleri kabul edildi' });
    expect(converted.status, JSON.stringify(converted.body)).toBe(201);
    expect(converted.body.qualificationStage).toBe('c');

    const removed = await supertest(server)
      .delete(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect(removed.body).toMatchObject({ ok: true, deletedAt: expect.any(String) });

    const opportunitiesList = await supertest(server)
      .get('/api/v1/opportunities?lifecycle=opportunity&pageSize=100')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(opportunitiesList.body.data.some((row: { id: string }) => row.id === opportunityId)).toBe(false);

    await expectSoftDeleted(opportunityId, superAdminUserId);
  });
});
