import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let adminToken = '';
let superadminToken = '';
let companyId = '';

beforeAll(async () => {
  app = await createTestApp();
  const server = app.getHttpServer();
  const [admin, superadmin] = await Promise.all([
    supertest(server).post('/api/v1/auth/login').send({ email: 'admin@haksan.local', password: 'admin12345' }),
    supertest(server).post('/api/v1/auth/login').send({ email: 'superadmin@haksan.local', password: 'superadmin12345' }),
  ]);
  adminToken = admin.body.accessToken;
  superadminToken = superadmin.body.accessToken;
  const companies = await supertest(server)
    .get('/api/v1/companies?pageSize=10')
    .set('Authorization', `Bearer ${adminToken}`);
  companyId = companies.body.data[0].id;
});

afterAll(async () => {
  await app.close();
});

describe('Central discount approval policy', () => {
  it('routes a sales order above 10 percent to superadmin approval', async () => {
    const server = app.getHttpServer();
    const created = await supertest(server)
      .post('/api/v1/sales-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        orderDate: new Date().toISOString(),
        currencyCode: 'USD',
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const item = await supertest(server)
      .post(`/api/v1/sales-orders/${created.body.id}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'İndirim onay kalemi',
        quantity: 1,
        unitCode: 'adet',
        unitPrice: 1_000,
        discountAmount: 100.01,
        vatRate: 0,
        sortOrder: 0,
      });
    expect(item.status, JSON.stringify(item.body)).toBe(201);

    const pending = await supertest(server)
      .get(`/api/v1/sales-orders/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(pending.status).toBe(200);
    const pendingStatus = await supertest(server)
      .get(`/api/v1/sales-orders?statusCode=pending_super_admin_approval&pageSize=100`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(pendingStatus.body.data.some((row: { id: string }) => row.id === created.body.id)).toBe(true);

    const adminApproval = await supertest(server)
      .post(`/api/v1/sales-orders/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminApproval.status, JSON.stringify(adminApproval.body)).toBe(403);

    const superadminApproval = await supertest(server)
      .post(`/api/v1/sales-orders/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${superadminToken}`);
    expect(superadminApproval.status, JSON.stringify(superadminApproval.body)).toBe(201);

    const approved = await supertest(server)
      .get(`/api/v1/sales-orders/${created.body.id}`)
      .set('Authorization', `Bearer ${superadminToken}`);
    expect(approved.body.confirmedAt).toBeTruthy();
    expect(approved.body.approvedBy).toBeTruthy();
  });

  it('records the 10 percent threshold reason on purchase-order approval', async () => {
    const server = app.getHttpServer();
    const created = await supertest(server)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        purchaseType: 'administrative',
        paymentType: 'cash',
        orderDate: new Date().toISOString(),
        currencyCode: 'USD',
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const item = await supertest(server)
      .post(`/api/v1/purchase-orders/${created.body.id}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'Satın alma indirim kalemi',
        quantity: 2,
        unitCode: 'adet',
        unitPrice: 500,
        discountAmount: 101,
        vatRate: 0,
        sortOrder: 0,
      });
    expect(item.status, JSON.stringify(item.body)).toBe(201);

    const pending = await supertest(server)
      .get(`/api/v1/purchase-orders/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(pending.body.approvalReason).toContain('%10 sınırı aşıldı');
  });
});
