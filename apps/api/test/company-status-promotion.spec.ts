import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

describe('Company status promotion on first sales order', () => {
  let app: NestFastifyApplication;
  let token = '';
  let divisionId = '';
  const companyIds: string[] = [];
  const orderIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@haksan.local', password: 'admin12345' })
      .expect(201);
    token = login.body.accessToken;

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    divisionId = me.body.user.divisions[0].id;
  });

  afterAll(async () => {
    for (const orderId of orderIds) {
      await request(app.getHttpServer())
        .delete(`/api/v1/sales-orders/${orderId}`)
        .set('Authorization', `Bearer ${token}`);
    }
    for (const companyId of companyIds) {
      await request(app.getHttpServer())
        .delete(`/api/v1/companies/${companyId}`)
        .set('Authorization', `Bearer ${token}`);
    }
    await app.close();
  });

  const createOrderForStatus = async (status: 'potential' | 'passive' | 'blacklist') => {
    const suffix = `${status}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const company = await request(app.getHttpServer())
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalTitle: `Sipariş statü testi ${suffix}`,
        relationTypeCode: 'customer',
        customerStatusCode: status,
        divisionId,
      })
      .expect(201);
    companyIds.push(company.body.id);

    const order = await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyId: company.body.id,
        divisionId,
        orderDate: new Date().toISOString(),
        currencyCode: 'USD',
      })
      .expect(201);
    orderIds.push(order.body.id);

    const updatedCompany = await request(app.getHttpServer())
      .get('/api/v1/companies')
      .query({ search: suffix, divisionId, pageSize: 10 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const row = updatedCompany.body.data.find((item: { id: string }) => item.id === company.body.id);
    return row.customerStatus.code as string;
  };

  it('promotes only potential companies to active', async () => {
    await expect(createOrderForStatus('potential')).resolves.toBe('active');
  });

  it.each(['passive', 'blacklist'] as const)('preserves %s companies', async (status) => {
    await expect(createOrderForStatus(status)).resolves.toBe(status);
  });
});
