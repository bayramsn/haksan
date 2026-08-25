/**
 * Ziyaret ve arama iki yere kaydedilebiliyor: kendi tabloları ve aynı türdeki
 * genel aktivite kaydı. Rapor ikisini birlikte saymalı, "Aktivite" ise yalnız
 * geri kalan türleri göstermeli — aksi halde ziyaret/arama olduğundan düşük görünür.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

type Totals = { quotes: number; visits: number; calls: number; activities: number };

describe('Team activity report', () => {
  let app: NestFastifyApplication;
  let token: string;
  let divisionId: string;
  let companyId: string | undefined;
  const createdActivityIds: string[] = [];

  const totals = async (): Promise<Totals> => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/reports/team-activity?period=week&scope=self')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return response.body.totals;
  };

  const logActivity = async (activityTypeCode: string, subject: string) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, activityTypeCode, subject, activityDate: new Date().toISOString() })
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
    divisionId = me.body.user.divisions[0].id;

    const company = await request(app.getHttpServer())
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyType: 'company',
        legalTitle: `Ekip Aktivite Testi ${Date.now()}`,
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

  it('aktivite olarak girilen ziyaret ve aramayı kendi metriğinde sayar', async () => {
    const before = await totals();

    await logActivity('customer_visit', 'Ziyaret aktivitesi');
    await logActivity('outgoing_call', 'Arama aktivitesi');
    await logActivity('note', 'Serbest not');

    const after = await totals();
    expect(after.visits - before.visits).toBe(1);
    expect(after.calls - before.calls).toBe(1);
    // Ziyaret/arama türleri "Aktivite"den düşülür; yalnız not sayılır.
    expect(after.activities - before.activities).toBe(1);
  });

  it('ziyaret formundan girilen kayıt da aynı metriğe eklenir', async () => {
    const before = await totals();
    await request(app.getHttpServer())
      .post('/api/v1/visits')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, visitDate: new Date().toISOString(), visitPurpose: 'Rapor testi' })
      .expect(201);

    const after = await totals();
    expect(after.visits - before.visits).toBe(1);
    expect(after.activities - before.activities).toBe(0);
  });
});
