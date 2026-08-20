import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let adminToken = '';
let salesToken = '';
let superadminToken = '';
let companyId = '';
let opportunityId = '';

beforeAll(async () => {
  app = await createTestApp();
  const server = app.getHttpServer();
  const [admin, sales, superadmin] = await Promise.all([
    supertest(server).post('/api/v1/auth/login').send({ email: 'admin@haksan.local', password: 'admin12345' }),
    supertest(server).post('/api/v1/auth/login').send({ email: 'sales@haksan.local', password: 'sales12345' }),
    supertest(server).post('/api/v1/auth/login').send({ email: 'superadmin@haksan.local', password: 'superadmin12345' }),
  ]);
  adminToken = admin.body.accessToken;
  salesToken = sales.body.accessToken;
  superadminToken = superadmin.body.accessToken;

  const companies = await supertest(server)
    .get('/api/v1/companies?pageSize=10')
    .set('Authorization', `Bearer ${adminToken}`);
  companyId = companies.body.data[0].id;
  const opportunity = await supertest(server)
    .post('/api/v1/opportunities')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ companyId, title: `Bahsetme testi ${Date.now()}`, currencyCode: 'EUR' });
  opportunityId = opportunity.body.id;
});

afterAll(async () => {
  await app.close();
});

describe('Activity mentions', () => {
  it('creates and lists a company activity without an opportunity', async () => {
    const server = app.getHttpServer();
    const subject = `Fırsat dışı müşteri ziyareti ${Date.now()}`;
    const activity = await supertest(server)
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        activityTypeCode: 'customer_visit',
        subject,
        description: 'Firma kartından doğrudan girilen ziyaret kaydı.',
        activityDate: new Date().toISOString(),
      });

    expect(activity.status, JSON.stringify(activity.body)).toBe(201);
    expect(activity.body).toMatchObject({
      companyId,
      opportunityId: null,
      subject,
      origin: 'manual',
    });

    const activityList = await supertest(server)
      .get(`/api/v1/activities?companyId=${companyId}&pageSize=100`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(activityList.status, JSON.stringify(activityList.body)).toBe(200);
    expect(
      activityList.body.data.find((row: { id: string }) => row.id === activity.body.id),
    ).toMatchObject({
      companyId,
      opportunityId: null,
      subject,
      origin: 'manual',
      type: { code: 'customer_visit', name: 'Müşteri Ziyareti' },
    });
  });

  it('resolves a mention notification to the exact activity in its opportunity', async () => {
    const server = app.getHttpServer();
    const activity = await supertest(server)
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        opportunityId,
        companyId,
        activityTypeCode: 'note',
        subject: '@Ersin teklif şartlarını kontrol eder misin?',
        description: 'Bildirim fırsat içindeki bu aktiviteye gitmeli.',
        activityDate: new Date().toISOString(),
      });
    expect(activity.status, JSON.stringify(activity.body)).toBe(201);
    expect(activity.body.origin).toBe('manual');

    const activityList = await supertest(server)
      .get(`/api/v1/activities?opportunityId=${opportunityId}&pageSize=10`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(activityList.status, JSON.stringify(activityList.body)).toBe(200);
    expect(
      activityList.body.data.find((row: { id: string }) => row.id === activity.body.id),
    ).toMatchObject({ origin: 'manual' });

    const salesNotifications = await supertest(server)
      .get('/api/v1/notifications?unread=true&pageSize=200')
      .set('Authorization', `Bearer ${salesToken}`);
    const mention = salesNotifications.body.data.find(
      (row: { type: string; entityId?: string }) => row.type === 'mention' && row.entityId === activity.body.id,
    );
    expect(mention).toMatchObject({
      entityType: 'activity',
      entityId: activity.body.id,
      target: {
        kind: 'opportunity',
        opportunityId,
        activityId: activity.body.id,
      },
    });

    const updated = await supertest(server)
      .patch(`/api/v1/activities/${activity.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Aynı @Ersin bahsi tekrar bildirim üretmemeli; yeni @Süper bahsi üretmeli.' });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);

    const salesAfterUpdate = await supertest(server)
      .get('/api/v1/notifications?unread=true&pageSize=200')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(
      salesAfterUpdate.body.data.filter(
        (row: { type: string; entityId?: string }) => row.type === 'mention' && row.entityId === activity.body.id,
      ),
    ).toHaveLength(1);

    const superadminNotifications = await supertest(server)
      .get('/api/v1/notifications?unread=true&pageSize=200')
      .set('Authorization', `Bearer ${superadminToken}`);
    expect(
      superadminNotifications.body.data.some(
        (row: { type: string; entityId?: string }) => row.type === 'mention' && row.entityId === activity.body.id,
      ),
    ).toBe(true);
  });
});
