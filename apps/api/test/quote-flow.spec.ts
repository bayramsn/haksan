import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let adminToken: string;
let companyId: string;
let opportunityId: string;
let quoteId: string;
let quoteBusinessLine: string;
let proformaId: string;
let productModelId: string;

beforeAll(async () => {
  app = await createTestApp();
  const login = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'admin@haksan.local', password: 'admin12345' });
  adminToken = login.body.accessToken;
  const r = await supertest(app.getHttpServer()).get('/api/v1/companies').set('Authorization', `Bearer ${adminToken}`);
  companyId = r.body.data[0].id;
  const productList = await supertest(app.getHttpServer())
    .get('/api/v1/products?pageSize=1')
    .set('Authorization', `Bearer ${adminToken}`);
  productModelId = productList.body.data[0].id;
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
    quoteId = r.body.id;
    quoteBusinessLine = r.body.businessLine;
    expect(['CNC', 'UNI', 'SACISLE']).toContain(quoteBusinessLine);
    expect(r.body.documentNo).toMatch(new RegExp(`^${quoteBusinessLine}-\\d{4}/\\d{3}$`));

    const item = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${quoteId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productModelId,
        description: `CNC-${'UZUNOZELLIK'.repeat(175)}`,
        quantity: 1,
        unitPrice: 100000,
        discountAmount: 5000,
        vatRate: 20,
        sortOrder: 0,
      });
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

  it('creates proforma, contract and commercial invoice in the quote business line series', async () => {
    const [proforma, contract, invoice] = await Promise.all([
      supertest(app.getHttpServer())
        .post('/api/v1/proformas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quoteId, issueDate: new Date().toISOString(), statusCode: 'draft' }),
      supertest(app.getHttpServer())
        .post('/api/v1/contracts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quoteId, signedDate: new Date().toISOString(), statusCode: 'draft' }),
      supertest(app.getHttpServer())
        .post('/api/v1/commercial-invoices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quoteId, invoiceDate: new Date().toISOString(), statusCode: 'draft' }),
    ]);

    expect(proforma.status).toBe(201);
    proformaId = proforma.body.id;
    expect(proforma.body.documentNo).toMatch(new RegExp(`^${quoteBusinessLine}-PRF-\\d{4}/\\d{3}$`));
    expect(contract.status).toBe(201);
    expect(contract.body.contractNo).toMatch(new RegExp(`^${quoteBusinessLine}-SOZ-\\d{4}/\\d{3}$`));
    expect(invoice.status).toBe(201);
    expect(invoice.body.invoiceNo).toMatch(new RegExp(`^${quoteBusinessLine}-FAT-\\d{4}/\\d{3}$`));
  });

  it('refuses to send an itemless quote', async () => {
    const draft = await supertest(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ companyId, quoteDate: new Date().toISOString(), currencyCode: 'USD' });
    expect(draft.status).toBe(201);

    const sent = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${draft.body.id}/send`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect([400, 422]).toContain(sent.status);
  });

  it('snapshots sent commercial documents and prevents later mutation or deletion', async () => {
    const finalized = await supertest(app.getHttpServer())
      .patch(`/api/v1/proformas/${proformaId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusCode: 'sent' });
    expect(finalized.status).toBe(200);
    expect(finalized.body.finalizedAt).toBeTruthy();
    expect(finalized.body.documentSnapshot?.company).toBeTruthy();
    expect(finalized.body.documentSnapshot?.items).toHaveLength(1);
    expect(finalized.body.documentSnapshot?.schemaVersion).toBe(2);
    expect(finalized.body.documentSnapshot?.items[0]?.unitCode).toBe('adet');
    expect(finalized.body.documentSnapshot?.items[0]?.product?.id).toBe(productModelId);
    expect(finalized.body.documentSnapshot?.items[0]?.product?.brandName).toBeTruthy();

    const changed = await supertest(app.getHttpServer())
      .patch(`/api/v1/proformas/${proformaId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ issueDate: new Date(Date.now() + 86_400_000).toISOString() });
    expect(changed.status).toBe(409);

    const removed = await supertest(app.getHttpServer())
      .delete(`/api/v1/proformas/${proformaId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(removed.status).toBe(409);
  });

  it('snapshots sent quotes and requires a new revision for changes', async () => {
    const sent = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${quoteId}/send`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(sent.status).toBe(201);

    const got = await supertest(app.getHttpServer())
      .get(`/api/v1/quotes/${quoteId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(got.status).toBe(200);
    expect(got.body.finalizedAt).toBeTruthy();
    expect(got.body.documentSnapshot?.items).toHaveLength(1);

    const pdf = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${quoteId}/generate-pdf`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(201);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
    expect((pdf.body.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(2);

    const changed = await supertest(app.getHttpServer())
      .patch(`/api/v1/quotes/${quoteId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'Bu değişiklik kesinleşmiş teklife uygulanmamalı' });
    expect(changed.status).toBe(409);
  });

  it('does not soft-delete a company that has historical documents', async () => {
    const removed = await supertest(app.getHttpServer())
      .delete(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(removed.status).toBe(409);
    const companies = await supertest(app.getHttpServer())
      .get('/api/v1/companies?pageSize=100')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(companies.body.data.some((company: { id: string }) => company.id === companyId)).toBe(true);
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
