import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { assistantOpportunitySummarySchema } from '@haksan/shared';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let token = '';
let companyId = '';

beforeAll(async () => {
  app = await createTestApp();
  const server = app.getHttpServer();
  const login = await supertest(server)
    .post('/api/v1/auth/login')
    .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' });
  expect(login.status, JSON.stringify(login.body)).toBe(201);
  token = login.body.accessToken;

  const companies = await supertest(server)
    .get('/api/v1/companies')
    .set('Authorization', `Bearer ${token}`);
  expect(companies.status, JSON.stringify(companies.body)).toBe(200);
  companyId = companies.body.data[0].id;
});

afterAll(async () => {
  await app?.close();
});

describe('controlled opportunity summary', () => {
  it('returns a schema-valid, explicitly labelled CRM/AI summary on demand', async () => {
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyId,
        title: `summary-${Date.now()}`,
        currencyCode: 'USD',
        estimatedValue: 125_000,
        probability: 55,
        nextAction: 'Teknik ihtiyaçları doğrula',
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const response = await supertest(app.getHttpServer())
      .post(`/api/v1/assistant/opportunities/${created.body.id}/summary`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const summary = assistantOpportunitySummarySchema.parse(response.body);
    expect(['ai', 'deterministic']).toContain(summary.mode);
    expect(summary.source.id).toBe(created.body.id);
    expect(summary.dataCoverage).toBeGreaterThan(0);
    expect(summary.summary.length).toBeGreaterThan(0);
  });
});
