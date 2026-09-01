/** Ziyaret, arama ve diğer temaslar raporda tek Aktivite metriğinde birleşir. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { normalizeCompanyName } from '../src/shared/utils/text-normalization';

type Totals = { quotes: number; activities: number };

describe('Team activity report', () => {
  let app: NestFastifyApplication;
  let token: string;
  let userId: string;
  let divisionId: string;
  let companyId: string | undefined;
  const companyName = `Ekip Aktivite Testi ${Date.now()}`;
  const createdActivityIds: string[] = [];

  const totals = async (): Promise<Totals> => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/reports/team-activity?period=week&scope=self')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return response.body.totals;
  };

  const logActivity = async (
    activityTypeCode: string,
    subject: string,
    content?: { description?: string; result?: string; nextFollowUpAt?: string },
  ) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, activityTypeCode, subject, activityDate: new Date().toISOString(), ...content })
      .expect(201);
    createdActivityIds.push(response.body.id);
    return response;
  };

  beforeAll(async () => {
    app = await createTestApp();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' })
      .expect(201);
    token = login.body.accessToken;
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    userId = me.body.user.id;
    divisionId = me.body.user.divisions[0].id;

    const company = await request(app.getHttpServer())
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyType: 'company',
        legalTitle: companyName,
        relationTypeCode: 'customer',
        customerStatusCode: 'potential',
        divisionIds: [divisionId],
      })
      .expect(201);
    companyId = company.body.id;
  });

  afterAll(async () => {
    // Firma silme bağımlı aktiviteler yüzünden 409 döner; önce onlar temizlenir.
    for (const id of createdActivityIds) {
      await request(app.getHttpServer())
        .delete(`/api/v1/activities/${id}`)
        .set('Authorization', `Bearer ${token}`);
    }
    if (companyId) {
      await request(app.getHttpServer())
        .delete(`/api/v1/companies/${companyId}`)
        .set('Authorization', `Bearer ${token}`);
    }
    await app.close();
  });

  it('aktivite olarak girilen ziyaret, arama ve notu tek Aktivite metriğinde sayar', async () => {
    const before = await totals();

    await logActivity('customer_visit', 'Ziyaret aktivitesi');
    await logActivity('outgoing_call', 'Arama aktivitesi');
    await logActivity('note', 'Serbest not');

    const after = await totals();
    expect(after.activities - before.activities).toBe(3);
    expect(after).not.toHaveProperty('visits');
    expect(after).not.toHaveProperty('calls');
  });

  it('legacy ziyaret formundan girilen kayıt da Aktivite metriğine eklenir', async () => {
    const before = await totals();
    await request(app.getHttpServer())
      .post('/api/v1/visits')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, visitDate: new Date().toISOString(), visitPurpose: 'Rapor testi' })
      .expect(201);

    const after = await totals();
    expect(after.activities - before.activities).toBe(1);

    const monthly = await request(app.getHttpServer())
      .get('/api/v1/reports/monthly-activities')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(monthly.body.reduce((sum: number, row: { count: number }) => sum + row.count, 0)).toBeGreaterThan(0);
  });

  it('aktivite içeriğini detay yanıtında döndürür', async () => {
    const marker = `İçerik testi ${Date.now()}`;
    const followUpAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await logActivity('customer_visit', marker, {
      description: 'Müşterinin üretim hattı ve kapasite ihtiyacı görüşüldü.',
      result: 'Teknik keşif planlandı.',
      nextFollowUpAt: followUpAt,
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/reports/team-activity/details?period=week&scope=self&metric=activities')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const item = response.body.items.find((candidate: any) => candidate.title === marker);
    expect(item).toBeDefined();
    expect(item.content).toEqual({
      detail: 'Müşterinin üretim hattı ve kapasite ihtiyacı görüşüldü.',
      result: 'Teknik keşif planlandı.',
      location: null,
      nextAction: null,
      followUpAt,
    });
  });

  it('tüm aktivite türlerini kişi ve firma bilgisiyle tek tek listeler', async () => {
    const types = [
      ['incoming_call', 'Gelen Arama'],
      ['outgoing_call', 'Giden Arama'],
      ['customer_visit', 'Müşteri Ziyareti'],
      ['online_meeting', 'Çevrimiçi Toplantı'],
      ['showroom_meeting', 'Showroom Toplantısı'],
      ['email', 'E-posta / Mail'],
      ['whatsapp', 'WhatsApp'],
      ['note', 'Yorum'],
    ] as const;
    const marker = `Detay listesi ${Date.now()}`;
    for (const [code, label] of types) {
      await logActivity(code, `${marker} · ${label}`);
    }

    const response = await request(app.getHttpServer())
      .get(`/api/v1/reports/team-activity/details?period=week&scope=self&metric=all&userId=${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const created = response.body.items.filter((item: any) => item.title.startsWith(marker));
    expect(created).toHaveLength(types.length);
    expect(created.map((item: any) => item.typeCode).sort()).toEqual(types.map(([code]) => code).sort());
    expect(created.map((item: any) => item.typeName).sort()).toEqual(types.map(([, label]) => label).sort());
    expect(created.every((item: any) => item.userId === userId)).toBe(true);
    expect(created.every((item: any) => item.company.id === companyId)).toBe(true);
    // Firma unvanı kayıtta BÜYÜK harfe normalize ediliyor; detay yanıtı
    // saklanan değeri döndürür, ham girdiyi değil.
    expect(created.every((item: any) => item.company.name === normalizeCompanyName(companyName))).toBe(true);
  });
});
