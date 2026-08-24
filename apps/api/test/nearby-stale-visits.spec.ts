import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let token = '';
let superAdminToken = '';
let companyId = '';
/** Test verisi paylaşılan bir dev veritabanında da kalmasın diye toplanır. */
const createdCompanyIds: string[] = [];
const createdActivityIds: string[] = [];

/** Ziyaret aktivitesi yazar ve temizlik için kimliğini biriktirir. */
async function logVisit(companyId: string, subject: string, activityDate: Date): Promise<void> {
  const res = await supertest(app.getHttpServer())
    .post('/api/v1/activities')
    .set('Authorization', `Bearer ${token}`)
    .send({ companyId, activityTypeCode: 'customer_visit', subject, activityDate: activityDate.toISOString() })
    .expect(201);
  createdActivityIds.push(res.body.id);
}

async function createLocatedCompany(label: string): Promise<string> {
  const created = await supertest(app.getHttpServer())
    .post('/api/v1/companies')
    .set('Authorization', `Bearer ${token}`)
    .send({ legalTitle: `${label} ${Date.now()}`, relationTypeCode: 'customer' });
  const id = created.body.id;
  createdCompanyIds.push(id);
  await supertest(app.getHttpServer())
    .patch(`/api/v1/companies/${id}/location`)
    .set('Authorization', `Bearer ${token}`)
    .send({ ...HERE, source: 'manual' })
    .expect(200);
  return id;
}

// Ankara Kızılay civarı — testte kullanılan sabit "buradayım" noktası.
const HERE = { latitude: 39.9208, longitude: 32.8541 };
// ~450 km uzakta (İstanbul) — yarıçap dışında kalmalı.
const FAR = { latitude: 41.0082, longitude: 28.9784 };

const nearby = (body: Record<string, unknown>) =>
  supertest(app.getHttpServer())
    .post('/api/v1/companies/nearby-stale-visits')
    .set('Authorization', `Bearer ${token}`)
    .send(body);

beforeAll(async () => {
  app = await createTestApp();
  const login = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'admin@haksan.local', password: 'admin12345' });
  token = login.body.accessToken;
  const superAdminLogin = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' });
  superAdminToken = superAdminLogin.body.accessToken;

  companyId = await createLocatedCompany('Yakınlık Testi');
});

afterAll(async () => {
  // Bu paket paylaşılan bir yerel veritabanına karşı da koşabilir; ürettiği
  // firmaları ve okunmamış bildirimleri geride bırakma.
  const server = app.getHttpServer();
  // Firma silme bağımlı kayıt varken 409 döner; önce aktiviteleri kaldır.
  for (const id of createdActivityIds) {
    await supertest(server).delete(`/api/v1/activities/${id}`).set('Authorization', `Bearer ${token}`);
  }
  for (const id of createdCompanyIds) {
    await supertest(server).delete(`/api/v1/companies/${id}`).set('Authorization', `Bearer ${token}`);
  }
  const unread = await supertest(server)
    .get('/api/v1/notifications?unread=true&pageSize=100')
    .set('Authorization', `Bearer ${token}`);
  for (const row of (unread.body.data ?? []) as Array<{ id: string; type: string; entityId: string; actionStatus?: string | null }>) {
    if (row.type === 'nearby_stale_visit' && createdCompanyIds.includes(row.entityId)) {
      if (row.actionStatus === 'pending') {
        await supertest(server)
          .post(`/api/v1/notifications/${row.id}/respond`)
          .set('Authorization', `Bearer ${token}`)
          .send({ decision: 'yes' });
      } else {
        await supertest(server).patch(`/api/v1/notifications/${row.id}/read`).set('Authorization', `Bearer ${token}`);
      }
    }
  }
  await app.close();
});

describe('Yakındaki uğranmamış firmalar', () => {
  it('hiç ziyaret edilmemiş yakın firmayı listeler', async () => {
    const res = await nearby({ ...HERE, radiusKm: 25, staleDays: 15, notify: false });
    expect(res.status).toBe(201);
    const hit = res.body.companies.find((row: { id: string }) => row.id === companyId);
    expect(hit).toBeTruthy();
    expect(hit.daysSinceVisit).toBeNull();
    expect(hit.distanceKm).toBeLessThan(1);
  });

  it('yarıçap dışındaki konumdan bakınca firmayı döndürmez', async () => {
    const res = await nearby({ ...FAR, radiusKm: 25, staleDays: 15, notify: false });
    expect(res.status).toBe(201);
    expect(res.body.companies.some((row: { id: string }) => row.id === companyId)).toBe(false);
  });

  it('bugün ziyaret kaydı girilince firma listeden düşer', async () => {
    await logVisit(companyId, 'Yakınlık testi ziyareti', new Date());

    const res = await nearby({ ...HERE, radiusKm: 25, staleDays: 15, notify: false });
    expect(res.body.companies.some((row: { id: string }) => row.id === companyId)).toBe(false);
  });

  it('bayatlık eşiğini son ziyaret tarihine göre uygular', async () => {
    const thresholdCompanyId = await createLocatedCompany('Eşik Testi');

    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    await logVisit(thresholdCompanyId, 'Eşik testi ziyareti', twentyDaysAgo);

    const has = (body: { companies: Array<{ id: string; daysSinceVisit: number | null }> }) =>
      body.companies.find((row) => row.id === thresholdCompanyId);

    const stale15 = await nearby({ ...HERE, radiusKm: 25, staleDays: 15, notify: false });
    expect(has(stale15.body)?.daysSinceVisit).toBe(20);

    const stale30 = await nearby({ ...HERE, radiusKm: 25, staleDays: 30, notify: false });
    expect(has(stale30.body)).toBeUndefined();
  });

  it('notify=true iken firma başına bildirim üretir ve tekrarında üretmez', async () => {
    const notifyCompanyId = await createLocatedCompany('Bildirim Testi');

    await nearby({ ...HERE, radiusKm: 25, staleDays: 15, notify: true }).expect(201);
    const first = await supertest(app.getHttpServer())
      .get('/api/v1/notifications?pageSize=50')
      .set('Authorization', `Bearer ${token}`);
    const matching = (rows: Array<{ type: string; entityId: string }>) =>
      rows.filter((row) => row.type === 'nearby_stale_visit' && row.entityId === notifyCompanyId);
    expect(matching(first.body.data).length).toBe(1);
    expect(matching(first.body.data)[0]).toMatchObject({
      entityType: 'company',
      actionType: 'visit_intent',
      actionStatus: 'pending',
      readAt: null,
    });
    expect((matching(first.body.data)[0] as { body: string }).body).toContain('gidecek misiniz?');

    const notificationId = (matching(first.body.data)[0] as { id: string }).id;
    await supertest(app.getHttpServer())
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    // Aynı gün ikinci sorgu mükerrer bildirim yazmamalı.
    await nearby({ ...HERE, radiusKm: 25, staleDays: 15, notify: true }).expect(201);
    const second = await supertest(app.getHttpServer())
      .get('/api/v1/notifications?pageSize=50')
      .set('Authorization', `Bearer ${token}`);
    expect(matching(second.body.data).length).toBe(1);

    const answered = await supertest(app.getHttpServer())
      .post(`/api/v1/notifications/${notificationId}/respond`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'yes' })
      .expect(201);
    expect(answered.body).toMatchObject({ actionStatus: 'accepted', responseReason: null });
    expect(answered.body.readAt).toBeTruthy();
  });

  it('hayır yanıtında nedeni zorunlu tutar ve süper yöneticiye iletir', async () => {
    const declinedCompanyId = await createLocatedCompany('Reddedilen Ziyaret');
    await nearby({ ...HERE, radiusKm: 25, staleDays: 15, notify: true }).expect(201);

    const unread = await supertest(app.getHttpServer())
      .get('/api/v1/notifications?unread=true&pageSize=100')
      .set('Authorization', `Bearer ${token}`);
    const prompt = (unread.body.data as Array<{ id: string; type: string; entityId: string }>).find(
      (row) => row.type === 'nearby_stale_visit' && row.entityId === declinedCompanyId,
    );
    expect(prompt).toBeTruthy();

    await supertest(app.getHttpServer())
      .post(`/api/v1/notifications/${prompt!.id}/respond`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'no' })
      .expect(422);

    const reason = 'Bugünkü rota dolu; yarın için randevu planlandı.';
    const answered = await supertest(app.getHttpServer())
      .post(`/api/v1/notifications/${prompt!.id}/respond`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'no', reason })
      .expect(201);
    expect(answered.body).toMatchObject({ actionStatus: 'declined', responseReason: reason });

    const adminNotifications = await supertest(app.getHttpServer())
      .get('/api/v1/notifications?pageSize=100')
      .set('Authorization', `Bearer ${superAdminToken}`);
    const forwarded = (adminNotifications.body.data as Array<{ id: string; type: string; entityId: string; body: string }>).find(
      (row) => row.type === 'nearby_visit_declined' && row.entityId === declinedCompanyId && row.body.includes(reason),
    );
    expect(forwarded).toBeTruthy();
    await supertest(app.getHttpServer())
      .patch(`/api/v1/notifications/${forwarded!.id}/read`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);
  });

  it('geçersiz koordinatı reddeder', async () => {
    await nearby({ latitude: 999, longitude: 0, notify: false }).expect(422);
  });
});
