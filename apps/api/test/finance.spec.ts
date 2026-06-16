import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let adminToken: string;
let companyId: string;
const auth = () => `Bearer ${adminToken}`;
const now = () => new Date().toISOString();

beforeAll(async () => {
  app = await createTestApp();
  const login = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'admin@haksan.local', password: 'admin12345' });
  adminToken = login.body.accessToken;
  const r = await supertest(app.getHttpServer()).get('/api/v1/companies').set('Authorization', auth());
  companyId = r.body.data[0].id;
});

afterAll(async () => {
  await app.close();
});

describe('Finance — kasa hareketleri (alınan/ödenen)', () => {
  it('giren (alınan) ödeme oluşturur', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', auth())
      .send({ direction: 'in', companyId, amount: 5000, currencyCode: 'USD', paymentDate: now(), paymentMethod: 'cash' });
    expect(r.status).toBe(201);
    expect(r.body.direction).toBe('in');
  });

  it('çıkan (ödenen) ödeme oluşturur', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', auth())
      .send({ direction: 'out', companyId, amount: 1250, currencyCode: 'EUR', paymentDate: now(), paymentMethod: 'bank_transfer' });
    expect(r.status).toBe(201);
    expect(r.body.direction).toBe('out');
  });

  it('receivableId ve companyId ikisi de yoksa reddedilir', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', auth())
      .send({ direction: 'in', amount: 100, currencyCode: 'USD', paymentDate: now(), paymentMethod: 'cash' });
    expect([400, 422]).toContain(r.status);
  });

  it('başka tenant/var olmayan companyId reddedilir (tenant izolasyonu)', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', auth())
      .send({ direction: 'in', companyId: '00000000-0000-0000-0000-000000000000', amount: 100, currencyCode: 'USD', paymentDate: now(), paymentMethod: 'cash' });
    expect([403, 404]).toContain(r.status);
  });

  it('ödeme listesi direction alanını taşır', async () => {
    const r = await supertest(app.getHttpServer()).get('/api/v1/payments').set('Authorization', auth());
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data)).toBe(true);
    expect(r.body.data[0]).toHaveProperty('direction');
  });
});
