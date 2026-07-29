import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let token = '';
let readonlyToken = '';
let companyId = '';
let opportunityId = '';
const suffix = Date.now();

beforeAll(async () => {
  app = await createTestApp();
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
  });
});
