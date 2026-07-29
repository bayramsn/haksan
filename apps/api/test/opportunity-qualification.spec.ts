import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { createTestApp } from './setup';
import type { DbClient } from '../src/db/client';
import { opportunities, opportunityApprovals } from '../src/db/schema/crm';
import { opportunityStatuses } from '../src/db/schema/lookup';
import { DB } from '../src/shared/database/database.module';

let app: NestFastifyApplication;
let db: DbClient;
let token = '';
let readonlyToken = '';
let companyId = '';
let opportunityId = '';
const suffix = Date.now();

beforeAll(async () => {
  app = await createTestApp();
  db = app.get<DbClient>(DB);
  const server = app.getHttpServer();
  const login = await supertest(server)
    .post('/api/v1/auth/login')
    .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' });
  token = login.body.accessToken;
  const readonlyLogin = await supertest(server)
    .post('/api/v1/auth/login')
    .send({ email: 'readonly@haksan.local', password: 'readonly12345' });
  readonlyToken = readonlyLogin.body.accessToken;

  const companies = await supertest(server)
    .get('/api/v1/companies?pageSize=10')
    .set('Authorization', `Bearer ${token}`);
  companyId = companies.body.data[0].id;
});

afterAll(async () => {
  await app.close();
});

describe('Opportunity qualification pipeline', () => {
  it('creates a Lead and exposes it through the lead lifecycle filter', async () => {
    const server = app.getHttpServer();
    const created = await supertest(server)
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyId,
        title: `Qualification test ${suffix}`,
        currencyCode: 'EUR',
      });

    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.qualificationStage).toBe('lead');
    expect(created.body.leadFollowUpStatus).toBe('new');
    expect(created.body.nextAction).toBeNull();
    expect(created.body.qualificationReadiness).toMatchObject({
      stage: 'lead',
      nextStage: 'c',
      ready: true,
    });
    opportunityId = created.body.id;

    const leads = await supertest(server)
      .get('/api/v1/opportunities?lifecycle=lead&pageSize=100')
      .set('Authorization', `Bearer ${token}`);
    expect(leads.status).toBe(200);
    expect(leads.body.data.some((row: { id: string }) => row.id === opportunityId)).toBe(true);
  });

  it('stores the Lead follow-up status and shared next action safely', async () => {
    const server = app.getHttpServer();
    const invalid = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadFollowUpStatus: 'not-a-status' });
    expect(invalid.status).toBe(422);

    const nextActionAt = '2030-01-15T09:30:00.000Z';
    const updated = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        leadFollowUpStatus: 'attempting',
        nextAction: 'Teknik ihtiyaç listesini teyit etmek için satın alma müdürünü ara',
        nextActionAt,
      });

    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body).toMatchObject({
      leadFollowUpStatus: 'attempting',
      nextAction: 'Teknik ihtiyaç listesini teyit etmek için satın alma müdürünü ara',
      nextActionAt,
    });

    const dateWithoutAction = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nextAction: null, nextActionAt });
    expect(dateWithoutAction.status).toBe(422);

    const disqualified = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadFollowUpStatus: 'disqualified' });
    expect(disqualified.status).toBe(200);
    const blockedConversion = await supertest(server)
      .post(`/api/v1/opportunities/${opportunityId}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'Uygun değilken çevrilmemeli' });
    expect(blockedConversion.status).toBe(422);

    const restored = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadFollowUpStatus: 'attempting' });
    expect(restored.status).toBe(200);
  });

  it('converts a Lead to C and removes it from the Leadler pool', async () => {
    const server = app.getHttpServer();
    const converted = await supertest(server)
      .post(`/api/v1/opportunities/${opportunityId}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'Test dönüşümü' });

    expect(converted.status, JSON.stringify(converted.body)).toBe(201);
    expect(converted.body.qualificationStage).toBe('c');
    expect(converted.body.qualificationHistory[0]).toMatchObject({
      fromStage: 'lead',
      toStage: 'c',
    });

    const leads = await supertest(server)
      .get(`/api/v1/opportunities?lifecycle=lead&search=${encodeURIComponent(`Qualification test ${suffix}`)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(leads.status).toBe(200);
    expect(leads.body.data).toHaveLength(0);

    const opportunities = await supertest(server)
      .get(`/api/v1/opportunities?lifecycle=opportunity&search=${encodeURIComponent(`Qualification test ${suffix}`)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(opportunities.status).toBe(200);
    expect(opportunities.body.data.some((row: { id: string }) => row.id === opportunityId)).toBe(true);
  });

  it('enforces ordered transitions and returns field-level blockers', async () => {
    const server = app.getHttpServer();
    const skipped = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}/qualification-stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStage: 'a' });
    expect(skipped.status).toBe(422);
    expect(skipped.body.error?.message).toContain('sırayla');

    const blocked = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}/qualification-stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStage: 'b' });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error?.message).toContain('eksik');
    expect(blocked.body.error?.details?.blockers).toEqual(expect.arrayContaining(['Kontak bağlı']));
  });

  it('protects operational approvals with opportunities.approve', async () => {
    const server = app.getHttpServer();
    const forbidden = await supertest(server)
      .post(`/api/v1/opportunities/${opportunityId}/approvals/payment`)
      .set('Authorization', `Bearer ${readonlyToken}`)
      .send({ decision: 'approved' });
    expect(forbidden.status).toBe(403);

    const wrongStage = await supertest(server)
      .post(`/api/v1/opportunities/${opportunityId}/approvals/payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'approved' });
    expect(wrongStage.status).toBe(422);
    expect(wrongStage.body.error?.message).toContain('A+');
  });

  it('invalidates payment and WIN approvals when payment evidence changes', async () => {
    const server = app.getHttpServer();
    const opportunity = await db.query.opportunities.findFirst({
      where: eq(opportunities.id, opportunityId),
    });
    expect(opportunity).toBeTruthy();

    await db
      .update(opportunities)
      .set({
        qualificationStage: 'a_plus',
        paymentMethod: 'wire_transfer',
        paymentTerms: '30 gün vadeli',
      })
      .where(eq(opportunities.id, opportunityId));
    await db
      .insert(opportunityApprovals)
      .values([
        {
          tenantId: opportunity!.tenantId,
          opportunityId,
          approvalType: 'payment',
          status: 'approved',
          decidedBy: opportunity!.ownerUserId,
          decidedAt: new Date(),
        },
        {
          tenantId: opportunity!.tenantId,
          opportunityId,
          approvalType: 'win',
          status: 'approved',
          decidedBy: opportunity!.ownerUserId,
          decidedAt: new Date(),
        },
      ])
      .onConflictDoUpdate({
        target: [opportunityApprovals.opportunityId, opportunityApprovals.approvalType],
        set: {
          status: 'approved',
          decidedBy: opportunity!.ownerUserId,
          decidedAt: new Date(),
          deletedAt: null,
        },
      });

    const changed = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentTerms: '60 gün vadeli' });

    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body.qualificationReadiness.approvals).toMatchObject({
      payment: 'pending',
      win: 'pending',
    });
  });

  it('requires a LOST reason, then archives the terminal opportunity without deleting it', async () => {
    const server = app.getHttpServer();
    const missingReason = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}/qualification-stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStage: 'lost' });
    expect(missingReason.status).toBe(422);

    const lost = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}/qualification-stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        toStage: 'lost',
        cancellationReasonCode: 'qualification_test',
        note: 'Test kayıp gerekçesi',
      });
    expect(lost.status, JSON.stringify(lost.body)).toBe(200);
    expect(lost.body.qualificationStage).toBe('lost');

    const closed = await supertest(server)
      .post(`/api/v1/opportunities/${opportunityId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Qualification testi tamamlandı' });
    expect(closed.status, JSON.stringify(closed.body)).toBe(201);
    expect(closed.body.closedAt).toBeTruthy();

    const archive = await supertest(server)
      .get(`/api/v1/opportunities?view=closed&qualificationStage=lost&search=${encodeURIComponent(`Qualification test ${suffix}`)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(archive.status).toBe(200);
    expect(archive.body.data.some((row: { id: string }) => row.id === opportunityId)).toBe(true);

    const direct = await supertest(server)
      .get(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(direct.status).toBe(200);

    const reopened = await supertest(server)
      .post(`/api/v1/opportunities/${opportunityId}/reopen`)
      .set('Authorization', `Bearer ${token}`);
    expect(reopened.status, JSON.stringify(reopened.body)).toBe(201);
    expect(reopened.body.closedAt).toBeNull();
    expect(reopened.body.qualificationStage).toBe('a_plus');
    expect(reopened.body.qualificationHistory[0]).toMatchObject({
      fromStage: 'lost',
      toStage: 'a_plus',
    });
    const [reopenedRow, openStatus] = await Promise.all([
      db.query.opportunities.findFirst({ where: eq(opportunities.id, opportunityId) }),
      db.query.opportunityStatuses.findFirst({ where: eq(opportunityStatuses.code, 'open') }),
    ]);
    expect(reopenedRow?.statusId).toBe(openStatus?.id);
  });
});
