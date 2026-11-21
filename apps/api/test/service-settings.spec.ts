import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

// Servis Fiyat Listesi'ndeki saat ücreti şirket ayarıdır; ücretsiz açılan
// servis kaydı bu değeri alır, elle verilen ücret korunur. Ayarı geri yükler.
let app: NestFastifyApplication;
let token: string;
let companyId: string;
let original: { serviceHourlyRate: number; serviceCurrency: string };
const api = () => supertest(app.getHttpServer());
const auth = () => `Bearer ${token}`;

beforeAll(async () => {
  app = await createTestApp();
  const login = await api().post('/api/v1/auth/login').send({ email: 'admin@haksan.local', password: 'admin12345' });
  token = login.body.accessToken;
  const me = await api().get('/api/v1/auth/me').set('Authorization', auth());
  const company = await api()
    .post('/api/v1/companies')
    .set('Authorization', auth())
    .send({ legalTitle: `Servis Saat Ücreti ${Date.now()}`, divisionId: me.body.user.divisions[0].id });
  expect(company.status).toBe(201);
  companyId = company.body.id;
  const current = await api().get('/api/v1/service-settings').set('Authorization', auth());
  expect(current.status).toBe(200);
  original = current.body;
});

afterAll(async () => {
  if (original) await api().patch('/api/v1/service-settings').set('Authorization', auth()).send(original);
  await app.close();
});

describe('Servis saat ücreti ayarı', () => {
  it('güncellenir, doğrulanır ve yeni servis kaydına varsayılan olarak yazılır', async () => {
    expect(typeof original.serviceHourlyRate).toBe('number');

    const bad = await api().patch('/api/v1/service-settings').set('Authorization', auth()).send({ serviceHourlyRate: -5, serviceCurrency: 'GBP' });
    expect(bad.status).toBe(422);

    const updated = await api().patch('/api/v1/service-settings').set('Authorization', auth()).send({ serviceHourlyRate: 250.5, serviceCurrency: 'EUR' });
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ serviceHourlyRate: 250.5, serviceCurrency: 'EUR' });

    const byDefault = await api()
      .post('/api/v1/service-tickets')
      .set('Authorization', auth())
      .send({ companyId, subject: 'Vitest saat ücreti varsayılan', severity: 'normal' });
    expect(byDefault.status).toBe(201);
    expect(byDefault.body.metadata).toMatchObject({ serviceHourlyRate: 250.5, serviceCurrency: 'EUR' });

    const explicit = await api()
      .post('/api/v1/service-tickets')
      .set('Authorization', auth())
      .send({ companyId, subject: 'Vitest saat ücreti elle', severity: 'normal', metadata: { serviceHourlyRate: 99, serviceCurrency: 'USD' } });
    expect(explicit.status).toBe(201);
    expect(explicit.body.metadata).toMatchObject({ serviceHourlyRate: 99, serviceCurrency: 'USD' });
  });
});
