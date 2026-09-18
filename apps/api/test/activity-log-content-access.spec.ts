/**
 * Haftalık aktivite dökümü, `reports.read + companies.read` ile açılıyor.
 * Düzeltmeden önce bu iki izin ÜÇ modülün verisini birden sızdırıyordu:
 * aktivite konusu/notu/sonucu, kişi adı-unvan-telefonu ve teklif kalemleri.
 *
 * Aynı kayıt iki rolle okunur: süper admin içeriği görür; `activities.read`
 * olmayan rol yalnız tür adını görür — kişi bilgisi de aktiviteyi görme iznine
 * bağlıdır, `contacts.read` tek başına yetmez.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { getDb } from '../src/db/client';
import { activityTypes, companies, contacts, salesActivities, users } from '../src/db/schema';

describe('activity log content access', () => {
  let app: NestFastifyApplication;
  let financeToken = '';
  let superAdminToken = '';
  let companyId = '';
  let contactId = '';
  let activityId = '';
  let reporterId = '';
  // Kendi kullanıcısını üretir: paylaşılan demo hesapları başka test dosyaları
  // kilitliyor (auth.spec kasıtlı kilitleme senaryosu çalıştırıyor).
  const reporterName = `rapor-izin-${Date.now()}`;
  const reporterPassword = 'RaporIzin!2026';

  const SUBJECT = 'GİZLİ KONU — mutabakat görüşmesi';
  const NOTE = 'GİZLİ NOT — fiyat pazarlığı ayrıntısı';
  const RESULT = 'GİZLİ SONUÇ — ikinci teklif istendi';
  const CONTACT_PHONE = '+90 555 000 11 22';

  const day = (date: Date) => date.toISOString().slice(0, 10);
  const today = new Date();

  const activityLog = (token: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/reports/activity-log?from=${day(today)}&to=${day(today)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

  const findEntry = (body: any) => {
    for (const user of body.users ?? []) {
      for (const group of user.groups ?? []) {
        const hit = group.entries?.find((entry: any) => entry.id === activityId);
        if (hit) return hit;
      }
    }
    return null;
  };

  const login = async (email: string, password: string) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    return response.body.accessToken as string;
  };

  beforeAll(async () => {
    app = await createTestApp();
    superAdminToken = await login('superadmin@haksan.local', 'superadmin12345');

    // `finance` rolü: reports.read + companies.read + contacts.read var,
    // activities.read YOK — raporun kaynak izni kapısını tam bu ayrım ölçer.
    const created = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        fullName: 'Rapor İzin Testi',
        email: `${reporterName}@haksan.local`,
        username: reporterName,
        password: reporterPassword,
        roleCodes: ['finance'],
      })
      .expect(201);
    reporterId = created.body.id;
    financeToken = await login(`${reporterName}@haksan.local`, reporterPassword);

    const db = getDb();
    const finance = await db.query.users.findFirst({ where: eq(users.id, reporterId) });
    if (!finance) throw new Error('Rapor test kullanıcısı bulunamadı');
    const type = await db.query.activityTypes.findFirst();
    if (!type) throw new Error('Aktivite türü bulunamadı');

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const [company] = await db
      .insert(companies)
      .values({ tenantId: finance.tenantId, legalTitle: `AKTIVITE TEST ${suffix}`, createdBy: finance.id })
      .returning({ id: companies.id });
    companyId = company.id;
    const [contact] = await db
      .insert(contacts)
      .values({
        tenantId: finance.tenantId,
        companyId,
        fullName: 'GİZLİ KİŞİ Ahmet Yılmaz',
        title: 'Satınalma Müdürü',
        mobilePhone: CONTACT_PHONE,
        createdBy: finance.id,
      })
      .returning({ id: contacts.id });
    contactId = contact.id;
    const [activity] = await db
      .insert(salesActivities)
      .values({
        tenantId: finance.tenantId,
        activityTypeId: type.id,
        companyId,
        contactId,
        subject: SUBJECT,
        description: NOTE,
        result: RESULT,
        activityDate: new Date(),
        createdBy: finance.id,
      })
      .returning({ id: salesActivities.id });
    activityId = activity.id;
  });

  afterAll(async () => {
    const db = getDb();
    if (activityId) await db.delete(salesActivities).where(eq(salesActivities.id, activityId));
    if (contactId) await db.delete(contacts).where(eq(contacts.id, contactId));
    if (companyId) await db.delete(companies).where(eq(companies.id, companyId));
    if (reporterId) await db.delete(users).where(eq(users.id, reporterId));
    await app?.close();
  });

  it('süper admin aktivite içeriğini ve kişi bilgisini görür', async () => {
    const entry = findEntry((await activityLog(superAdminToken)).body);
    expect(entry).toBeTruthy();
    expect(entry.subject).toBe(SUBJECT);
    expect(entry.note).toBe(NOTE);
    expect(entry.result).toBe(RESULT);
    expect(entry.contactPhone).toBe(CONTACT_PHONE);
  });

  // Düzeltmeden önce bu iddiaların hepsi kırmızıydı.
  it('activities.read olmayan rol içeriği ve kişi bilgisini görmez', async () => {
    const body = (await activityLog(financeToken)).body;
    const entry = findEntry(body);
    expect(entry).toBeTruthy();
    expect(entry.subject).not.toBe(SUBJECT);
    expect(entry.note).toBeNull();
    expect(entry.result).toBeNull();
    expect(entry.contactName).toBeNull();
    expect(entry.contactTitle).toBeNull();
    expect(entry.contactPhone).toBeNull();
    // Sayaç değişmez: kayıt listede kalır, yalnız içeriği kapanır.
    expect(JSON.stringify(body)).not.toContain('GİZLİ');
  });
});
