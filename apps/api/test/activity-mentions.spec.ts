import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let adminToken = '';
let salesToken = '';
let serviceToken = '';
let readonlyToken = '';
let superadminToken = '';
let companyId = '';
let contactId = '';
let opportunityId = '';

beforeAll(async () => {
  app = await createTestApp();
  const server = app.getHttpServer();
  const [admin, sales, service, readonly, superadmin] = await Promise.all([
    supertest(server).post('/api/v1/auth/login').send({ email: 'admin@haksan.local', password: 'admin12345' }),
    supertest(server).post('/api/v1/auth/login').send({ email: 'sales@haksan.local', password: 'sales12345' }),
    supertest(server).post('/api/v1/auth/login').send({ email: 'service@haksan.local', password: 'service12345' }),
    supertest(server).post('/api/v1/auth/login').send({ email: 'readonly@haksan.local', password: 'readonly12345' }),
    supertest(server).post('/api/v1/auth/login').send({ email: 'superadmin@haksan.local', password: 'superadmin12345' }),
  ]);
  adminToken = admin.body.accessToken;
  salesToken = sales.body.accessToken;
  serviceToken = service.body.accessToken;
  readonlyToken = readonly.body.accessToken;
  superadminToken = superadmin.body.accessToken;

  // Test firmasını servis rolünün de görebildiği cari müşteri havuzundan seç.
  // Admin listesinin ilk satırı sıralamaya göre potansiyel müşteri/tedarikçi
  // olabildiği için tam test paketinde servis kapsamı dışında kalabiliyordu.
  const companies = await supertest(server)
    .get('/api/v1/companies?pageSize=10')
    .set('Authorization', `Bearer ${serviceToken}`);
  expect(companies.status, JSON.stringify(companies.body)).toBe(200);
  expect(companies.body.data.length).toBeGreaterThan(0);
  companyId = companies.body.data[0].id;
  const contact = await supertest(server)
    .post('/api/v1/contacts')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ companyId, fullName: `Aktivite filtre kontağı ${Date.now()}` });
  expect(contact.status, JSON.stringify(contact.body)).toBe(201);
  contactId = contact.body.id;
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
  it('filters the complete activity data set by contact on the server', async () => {
    const server = app.getHttpServer();
    const activity = await supertest(server)
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        contactId,
        activityTypeCode: 'customer_visit',
        subject: `Kontak geçmişi ${Date.now()}`,
        activityDate: new Date().toISOString(),
      })
      .expect(201);

    const filtered = await supertest(server)
      .get(`/api/v1/activities?contactId=${contactId}&pageSize=10`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(filtered.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(filtered.body.data.some((row: { id: string }) => row.id === activity.body.id)).toBe(true);
    expect(filtered.body.data.every((row: { contactId: string | null }) => row.contactId === contactId)).toBe(true);
  });

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

    const detail = await supertest(server)
      .get(`/api/v1/activities/${activity.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status, JSON.stringify(detail.body)).toBe(200);
    expect(detail.body).toMatchObject({
      id: activity.body.id,
      companyId,
      subject,
      type: { code: 'customer_visit', name: 'Müşteri Ziyareti' },
      files: expect.any(Array),
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

  it('shows standalone activities only to sales, service, admin and super admin roles', async () => {
    const server = app.getHttpServer();
    const suffix = Date.now();
    const standalone = await supertest(server)
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        activityTypeCode: 'customer_visit',
        subject: `Rol kontrollü dış aktivite ${suffix}`,
        activityDate: new Date().toISOString(),
      })
      .expect(201);
    const linked = await supertest(server)
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        opportunityId,
        activityTypeCode: 'note',
        subject: `Rol kontrollü fırsat aktivitesi ${suffix}`,
        activityDate: new Date().toISOString(),
      })
      .expect(201);

    for (const roleToken of [salesToken, serviceToken, adminToken, superadminToken]) {
      const visible = await supertest(server)
        .get(`/api/v1/activities?companyId=${companyId}&pageSize=100`)
        .set('Authorization', `Bearer ${roleToken}`)
        .expect(200);
      expect(visible.body.data.some((row: { id: string }) => row.id === standalone.body.id)).toBe(true);
    }

    const readonly = await supertest(server)
      .get(`/api/v1/activities?companyId=${companyId}&pageSize=100`)
      .set('Authorization', `Bearer ${readonlyToken}`)
      .expect(200);
    expect(readonly.body.data.some((row: { id: string }) => row.id === standalone.body.id)).toBe(false);
    expect(readonly.body.data.some((row: { id: string }) => row.id === linked.body.id)).toBe(true);
  });

  it('converts a standalone activity to an opportunity and transfers the activity atomically', async () => {
    const server = app.getHttpServer();
    const suffix = Date.now();
    const activity = await supertest(server)
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        activityTypeCode: 'customer_visit',
        subject: `Fırsata dönüşecek dış aktivite ${suffix}`,
        description: 'Bu açıklama fırsat geçmişinde görünmeye devam etmeli.',
        activityDate: new Date().toISOString(),
      })
      .expect(201);

    const converted = await supertest(server)
      .post(`/api/v1/opportunities/from-activity/${activity.body.id}`)
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({
        companyId,
        title: `Dış aktiviteden fırsat ${suffix}`,
        description: activity.body.description,
        currencyCode: 'EUR',
      })
      .expect(201);

    const opportunityActivities = await supertest(server)
      .get(`/api/v1/activities?opportunityId=${converted.body.id}&pageSize=100`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      opportunityActivities.body.data.find((row: { id: string }) => row.id === activity.body.id),
    ).toMatchObject({
      id: activity.body.id,
      companyId,
      opportunityId: converted.body.id,
      subject: activity.body.subject,
      description: activity.body.description,
    });

    // Aynı aktivite iki fırsata taşınamaz; koşullu update yeni fırsatı da geri alır.
    await supertest(server)
      .post(`/api/v1/opportunities/from-activity/${activity.body.id}`)
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({
        companyId,
        title: `Mükerrer dönüşüm ${suffix}`,
        currencyCode: 'EUR',
      })
      .expect(409);
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
