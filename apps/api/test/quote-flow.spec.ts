import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let adminToken: string;
let companyId: string;
let opportunityId: string;

beforeAll(async () => {
  app = await createTestApp();
  const login = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'admin@haksan.local', password: 'admin12345' });
  adminToken = login.body.accessToken;
  const r = await supertest(app.getHttpServer()).get('/api/v1/companies').set('Authorization', `Bearer ${adminToken}`);
  companyId = r.body.data[0].id;
});

afterAll(async () => {
  await app.close();
});

describe('ERP flow', () => {
  it('creates an opportunity in lead stage', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ companyId, title: 'Test opp', estimatedValue: 100000, currencyCode: 'USD', probability: 50 });
    expect(r.status).toBe(201);
    expect(r.body.stage?.code).toBe('lead');
    opportunityId = r.body.id;
  });

  it('moves lead → sales', async () => {
    const r = await supertest(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}/stage`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStage: 'sales' });
    expect(r.status).toBe(200);
    expect(r.body.stage?.code).toBe('sales');
  });

  it('refuses to go directly from sales → contract (skipping quote)', async () => {
    const r = await supertest(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}/stage`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStage: 'contract' });
    expect([422, 400]).toContain(r.status);
  });

  it('creates a quote on the opportunity and recalculates totals', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ companyId, opportunityId, quoteDate: new Date().toISOString(), currencyCode: 'USD' });
    expect(r.status).toBe(201);
    const quoteId = r.body.id;

    const item = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${quoteId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'CNC tezgah', quantity: 1, unitPrice: 100000, discountAmount: 5000, vatRate: 20, sortOrder: 0 });
    expect(item.status).toBe(201);

    const got = await supertest(app.getHttpServer())
      .get(`/api/v1/quotes/${quoteId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(got.status).toBe(200);
    // subtotal = 100000 - 5000 = 95000; vat = 19000; grand = 114000
    expect(Number(got.body.subtotal)).toBe(95000);
    expect(Number(got.body.vatAmount)).toBe(19000);
    expect(Number(got.body.grandTotal)).toBe(114000);
  });

  it('moves sales → quote (now that a quote exists)', async () => {
    const r = await supertest(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}/stage`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStage: 'quote' });
    expect(r.status).toBe(200);
    expect(r.body.stage?.code).toBe('quote');
  });

  it('cancels opportunity with required reason', async () => {
    const r = await supertest(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}/stage`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStage: 'cancelled', cancellationReasonCode: 'budget' });
    expect(r.status).toBe(200);
    expect(r.body.stage?.code).toBe('cancelled');
  });

  it('rejects cancelled stage without reason', async () => {
    // new opportunity for this test
    const create = await supertest(app.getHttpServer())
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ companyId, title: 'Test opp 2', currencyCode: 'USD', probability: 50 });
    const id = create.body.id;
    const r = await supertest(app.getHttpServer())
      .patch(`/api/v1/opportunities/${id}/stage`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStage: 'cancelled' });
    expect([422, 400]).toContain(r.status);
  });
});
