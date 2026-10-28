import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { getDb } from '../src/db/client';
import { files, tradeFairContacts, users } from '../src/db/schema';

/**
 * Fuar alanı bütün departmanlara açık: servis çalışanının eklediği kaydı ve
 * fotoğrafını stok çalışanı görür, ama silemez. Demo hesapları başka spec'ler
 * kilitlediği için test kendi kullanıcılarını üretir.
 */
describe('Trade fairs module', () => {
  let app: NestFastifyApplication;
  let superToken = '';
  let serviceToken = '';
  let stockToken = '';
  let readonlyToken = '';
  let serviceUserId = '';
  const userIds: string[] = [];
  const recordIds: string[] = [];
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fairName = `WIN Eurasia Test ${runId}`;

  const api = () => request(app.getHttpServer());
  const login = async (email: string, password: string) =>
    (await api().post('/api/v1/auth/login').send({ email, password }).expect(201)).body.accessToken as string;

  const createUser = async (role: string) => {
    const username = `fuar-${role}-${runId.slice(-6)}`;
    const password = 'FuarTest!2026';
    const created = await api()
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ fullName: `Fuar ${role}`, email: `${username}@haksan.local`, username, password, roleCodes: [role] })
      .expect(201);
    userIds.push(created.body.id);
    return { id: created.body.id as string, token: await login(`${username}@haksan.local`, password) };
  };

  beforeAll(async () => {
    app = await createTestApp();
    superToken = await login('superadmin@haksan.local', 'superadmin12345');
    const service = await createUser('service');
    const stock = await createUser('stock');
    serviceToken = service.token;
    serviceUserId = service.id;
    stockToken = stock.token;
    readonlyToken = (await createUser('readonly')).token;
  });

  afterAll(async () => {
    const db = getDb();
    if (recordIds.length) await db.delete(tradeFairContacts).where(inArray(tradeFairContacts.id, recordIds));
    if (userIds.length) await db.delete(files).where(inArray(files.uploadedBy, userIds));
    for (const id of userIds) await db.delete(users).where(eq(users.id, id));
    await app?.close();
  });

  it('lets any department record a meeting with a photo that other departments can see', async () => {
    const created = await api()
      .post('/api/v1/trade-fairs')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({
        fairName,
        companyName: 'Anadolu Kalıp',
        contactName: 'Ayşe Demir',
        mobilePhone: '0532 111 22 33',
        email: 'ayse@anadolukalip.com',
        province: 'Bursa',
        district: 'Nilüfer',
        productCategory: 'Tezgah',
        productType: 'CNC Dik İşleme Merkezi',
        notes: 'Q1 yatırım planı var.',
        visitorCount: 3,
      })
      .expect(201);
    recordIds.push(created.body.id);
    // Görüşen seçilmezse kaydı açan kişi yazılır.
    expect(created.body.metByUserId).toBe(serviceUserId);

    // İçerik yükleme depolamaya (MinIO) gider ve CI'da bucket kurulmuyor; burada
    // sınanan şey fuar kaydına bağlama ve görünürlük, o yüzden dosya satırı
    // "yüklendi" durumunda doğrudan yazılır.
    const [file] = await getDb()
      .insert(files)
      .values({
        tenantId: created.body.tenantId,
        bucket: 'erp-service-documents',
        objectKey: `test/trade-fair/${runId}/kartvizit.png`,
        originalFilename: 'kartvizit.png',
        mimeType: 'image/png',
        extension: 'png',
        sizeBytes: 68,
        uploadedBy: serviceUserId,
        uploadStatus: 'uploaded',
        uploadedAt: new Date(),
      })
      .returning({ id: files.id });
    const intent = { body: { fileId: file.id } };
    await api()
      .post('/api/v1/files/link')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ fileId: intent.body.fileId, entityType: 'trade_fair_contact', entityId: created.body.id, documentTypeCode: 'other' })
      .expect(201);

    const list = await api()
      .get(`/api/v1/trade-fairs?fairName=${encodeURIComponent(fairName)}`)
      .set('Authorization', `Bearer ${stockToken}`)
      .expect(200);
    expect(list.body.data.map((row: { id: string }) => row.id)).toEqual([created.body.id]);
    expect(list.body.data[0].metByName).toBe('Fuar service');

    const links = await api()
      .get(`/api/v1/files/links?entityType=trade_fair_contact&entityId=${created.body.id}`)
      .set('Authorization', `Bearer ${stockToken}`)
      .expect(200);
    expect(links.body.data).toHaveLength(1);
  });

  it('counts who met how many people per fair', async () => {
    const second = await api()
      .post('/api/v1/trade-fairs')
      .set('Authorization', `Bearer ${stockToken}`)
      .send({ fairName, companyName: 'Ege Metal', contactName: 'Mehmet Kaya', metByUserId: serviceUserId, visitorCount: 2 })
      .expect(201);
    recordIds.push(second.body.id);

    const summary = await api()
      .get(`/api/v1/trade-fairs/summary?fairName=${encodeURIComponent(fairName)}`)
      .set('Authorization', `Bearer ${stockToken}`)
      .expect(200);
    expect(summary.body.byUser).toEqual([{ userId: serviceUserId, fullName: 'Fuar service', meetings: 2, people: 5 }]);
    expect(summary.body.fairs.map((fair: { name: string }) => fair.name)).toContain(fairName);
  });

  it('keeps untouched fields on partial update and still edits after the met-by user is deleted', async () => {
    const leaver = await createUser('sales');
    const created = await api()
      .post('/api/v1/trade-fairs')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ fairName, companyName: '100% Makina_Ltd', contactName: 'Ali Veli', country: 'Almanya', visitorCount: 4, metByUserId: leaver.id })
      .expect(201);
    recordIds.push(created.body.id);
    // Kullanıcı silme soft delete; kayıttaki görüşen kimliği yerinde kalır.
    await getDb().update(users).set({ deletedAt: new Date() }).where(eq(users.id, leaver.id));

    // Form bütün alanları, silinmiş görüşen dahil geri gönderir.
    const patched = await api()
      .patch(`/api/v1/trade-fairs/${created.body.id}`)
      .set('Authorization', `Bearer ${stockToken}`)
      .send({ metByUserId: leaver.id, notes: 'Yazım düzeltildi' })
      .expect(200);
    expect(patched.body).toMatchObject({ notes: 'Yazım düzeltildi', country: 'Almanya', visitorCount: 4, metByUserId: leaver.id });

    // `%` ve `_` joker değil, harfiyen aranır.
    const literal = await api()
      .get(`/api/v1/trade-fairs?fairName=${encodeURIComponent(fairName)}&q=${encodeURIComponent('100% Makina_')}`)
      .set('Authorization', `Bearer ${stockToken}`)
      .expect(200);
    expect(literal.body.data.map((row: { id: string }) => row.id)).toEqual([created.body.id]);
  });

  it('lets readonly users read but not write', async () => {
    await api().get('/api/v1/trade-fairs').set('Authorization', `Bearer ${readonlyToken}`).expect(200);
    await api()
      .post('/api/v1/trade-fairs')
      .set('Authorization', `Bearer ${readonlyToken}`)
      .send({ fairName, companyName: 'X', contactName: 'Y' })
      .expect(403);
  });

  it('rejects invalid input and lets only the creator delete', async () => {
    await api()
      .post('/api/v1/trade-fairs')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ fairName, companyName: 'X', contactName: 'Y', email: 'gecersiz' })
      .expect(422);

    await api().delete(`/api/v1/trade-fairs/${recordIds[0]}`).set('Authorization', `Bearer ${stockToken}`).expect(403);
    await api().delete(`/api/v1/trade-fairs/${recordIds[0]}`).set('Authorization', `Bearer ${serviceToken}`).expect(200);
  });
});
