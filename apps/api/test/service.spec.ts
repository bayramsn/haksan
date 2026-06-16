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

describe('Service — kurulum / sevkiyat / teslimat', () => {
  it('kurulum oluşturur ve saha ücretini hesaplar (İstanbul içi 90dk → 105$)', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/installations')
      .set('Authorization', auth())
      .send({ companyId, locationType: 'istanbul_ici', durationMinutes: 90, scheduledDate: now() });
    expect(r.status).toBe(201);
    expect(Number(r.body.feeAmount)).toBe(105);
  });

  it('var olmayan companyId ile kurulum reddedilir (tenant izolasyonu)', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/installations')
      .set('Authorization', auth())
      .send({ companyId: '00000000-0000-0000-0000-000000000000', locationType: 'istanbul_ici', durationMinutes: 60 });
    expect([403, 404]).toContain(r.status);
  });

  it('sevkiyat oluşturur ve durumunu günceller', async () => {
    const c = await supertest(app.getHttpServer())
      .post('/api/v1/shipments')
      .set('Authorization', auth())
      .send({ carrier: 'DHL', trackingNo: 'TRK-TEST-1', origin: 'Hamburg', destination: 'İstanbul', statusCode: 'preparing' });
    expect(c.status).toBe(201);
    const u = await supertest(app.getHttpServer())
      .patch(`/api/v1/shipments/${c.body.id}/status`)
      .set('Authorization', auth())
      .send({ statusCode: 'in_transit' });
    expect(u.status).toBe(200);
  });

  it('teslimat oluşturur ve durumunu günceller', async () => {
    const c = await supertest(app.getHttpServer())
      .post('/api/v1/deliveries')
      .set('Authorization', auth())
      .send({ companyId, deliveryDate: now(), signedBy: 'Test Kişi', status: 'pending' });
    expect(c.status).toBe(201);
    const u = await supertest(app.getHttpServer())
      .patch(`/api/v1/deliveries/${c.body.id}/status`)
      .set('Authorization', auth())
      .send({ status: 'completed' });
    expect(u.status).toBe(200);
  });

  it('sevkiyatı satır kalemleri (paketleme listesi) ile oluşturur ve detayda döndürür', async () => {
    const c = await supertest(app.getHttpServer())
      .post('/api/v1/shipments')
      .set('Authorization', auth())
      .send({
        companyId,
        carrier: 'UPS',
        trackingNo: 'TRK-ITEMS-1',
        origin: 'Rotterdam',
        destination: 'Adana',
        incoterm: 'CIF',
        statusCode: 'preparing',
        items: [
          { description: 'CNC Torna Tezgahı', serialNumber: 'SN-TEST-100', quantity: 1 },
          { description: 'Kontrol Ünitesi', serialNumber: 'SN-TEST-101', quantity: 1 },
        ],
      });
    expect(c.status).toBe(201);
    expect(c.body.companyId).toBe(companyId);
    expect(c.body.incoterm).toBe('CIF');

    const detail = await supertest(app.getHttpServer())
      .get(`/api/v1/shipments/${c.body.id}`)
      .set('Authorization', auth());
    expect(detail.status).toBe(200);
    expect(detail.body.items).toHaveLength(2);
    expect(detail.body.items.map((i: { serialNumber: string }) => i.serialNumber)).toContain('SN-TEST-100');
  });
});
