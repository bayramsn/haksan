import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { getDb } from '../src/db/client';
import { brands, companies, contacts, fileLinks, files, productModels, tradeFairContacts, users } from '../src/db/schema';

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
  let brandId = '';
  const productIds: string[] = [];
  // Yeni kayıtta bölüm zorunlu; kiracının ilk bölümü kullanılır.
  let required = { divisionId: '', notes: 'Fuar notu' };
  const companyIds: string[] = [];
  const contactIds: string[] = [];
  let salesToken = '';
  let salesUserId = '';
  const recordIds: string[] = [];
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fairName = `WIN Eurasia Test ${runId}`;

  const api = () => request(app.getHttpServer());
  const login = async (email: string, password: string) =>
    (await api().post('/api/v1/auth/login').send({ email, password }).expect(201)).body.accessToken as string;

  let divisionId: string | undefined;
  const createUser = async (role: string, tag = '', divisionIds: string[] = []) => {
    const username = `fuar-${role}${tag}-${runId.slice(-6)}`;
    const password = 'FuarTest!2026';
    const created = await api()
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ fullName: `Fuar ${role}`, email: `${username}@haksan.local`, username, password, roleCodes: [role], divisionIds })
      .expect(201);
    userIds.push(created.body.id);
    return { id: created.body.id as string, token: await login(`${username}@haksan.local`, password) };
  };

  beforeAll(async () => {
    app = await createTestApp();
    superToken = await login('superadmin@haksan.local', 'superadmin12345');
    const service = await createUser('service');
    const stock = await createUser('stock');
    // Firma açmak bölüm ister; satış kullanıcısı kiracının ilk bölümüne atanır.
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${superToken}`).expect(200);
    divisionId = me.body.user.divisions?.[0]?.id;
    if (!divisionId) throw new Error('Test için kiracıda en az bir bölüm gerekli');
    required = { divisionId, notes: 'Fuar notu' };
    const sales = await createUser('sales', '', divisionId ? [divisionId] : []);
    salesToken = sales.token;
    salesUserId = sales.id;
    serviceToken = service.token;
    serviceUserId = service.id;
    stockToken = stock.token;
    readonlyToken = (await createUser('readonly')).token;
  });

  afterAll(async () => {
    const db = getDb();
    if (recordIds.length) await db.delete(tradeFairContacts).where(inArray(tradeFairContacts.id, recordIds));
    if (userIds.length) await db.delete(files).where(inArray(files.uploadedBy, userIds));
    // Firmalar kendi servisinin bıraktığı bağlı kayıtlarla gelir; testte yumuşak silmek yeterli.
    if (contactIds.length) await db.update(contacts).set({ deletedAt: new Date() }).where(inArray(contacts.id, contactIds));
    if (companyIds.length) await db.update(companies).set({ deletedAt: new Date() }).where(inArray(companies.id, companyIds));
    if (productIds.length) await db.delete(productModels).where(inArray(productModels.id, productIds));
    if (brandId) await db.delete(brands).where(eq(brands.id, brandId));
    for (const id of userIds) await db.delete(users).where(eq(users.id, id));
    await app?.close();
  });

  it('lets any department record a meeting with a photo that other departments can see', async () => {
    const created = await api()
      .post('/api/v1/trade-fairs')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({
        ...required,
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
      .send({ ...required, fairName, companyName: 'Ege Metal', contactName: 'Mehmet Kaya', metByUserId: serviceUserId, visitorCount: 2 })
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
    const leaver = await createUser('sales', 'ayrilan');
    const created = await api()
      .post('/api/v1/trade-fairs')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ ...required, fairName, companyName: '100% Makina_Ltd', contactName: 'Ali Veli', country: 'Almanya', visitorCount: 4, metByUserId: leaver.id })
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

  it('links several optional CRM products and lets them be cleared again', async () => {
    const db = getDb();
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${serviceToken}`).expect(200);
    const tenantId = me.body.user.tenantId as string;
    const [brand] = await db.insert(brands).values({ tenantId, name: `Fuar Marka ${runId}` }).returning({ id: brands.id });
    brandId = brand.id;
    const inserted = await db
      .insert(productModels)
      .values([
        { tenantId, brandId, modelCode: `FUAR-A-${runId}`, fullName: `Fuar Test İşleme Merkezi ${runId}` },
        { tenantId, brandId, modelCode: `FUAR-B-${runId}`, fullName: `Fuar Test Torna ${runId}` },
      ])
      .returning({ id: productModels.id });
    productIds.push(...inserted.map((p) => p.id));

    // Ürün seçici bölüme göre gelir; grupsuz (ortak) ürün her bölümde görünür.
    const picker = await api()
      .get(`/api/v1/trade-fairs/products?divisionId=${divisionId}&q=${encodeURIComponent(`Fuar Test Torna ${runId}`)}`)
      .set('Authorization', `Bearer ${serviceToken}`)
      .expect(200);
    expect(picker.body.map((p: { id: string }) => p.id)).toEqual([productIds[1]]);

    // Ürün seçimi zorunlu değil: ürünsüz kayıt açılır, sonra iki ürün bağlanır ve boşaltılır.
    const created = await api()
      .post('/api/v1/trade-fairs')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ ...required, fairName, companyName: 'Ürünlü Firma', contactName: 'Zeynep Ak' })
      .expect(201);
    recordIds.push(created.body.id);
    expect(created.body.products).toEqual([]);

    await api()
      .patch(`/api/v1/trade-fairs/${created.body.id}`)
      .set('Authorization', `Bearer ${stockToken}`)
      .send({ productModelIds: productIds })
      .expect(200);
    const listed = await api()
      .get(`/api/v1/trade-fairs?fairName=${encodeURIComponent(fairName)}&q=${encodeURIComponent(`Fuar Test Torna ${runId}`)}`)
      .set('Authorization', `Bearer ${stockToken}`)
      .expect(200);
    expect(listed.body.data.map((row: { id: string }) => row.id)).toEqual([created.body.id]);
    expect(listed.body.data[0].products.map((p: { name: string }) => p.name).sort()).toEqual(
      [`Fuar Test Torna ${runId}`, `Fuar Test İşleme Merkezi ${runId}`].sort()
    );

    // Kısmi güncelleme ürün listesine dokunmaz.
    const partial = await api()
      .patch(`/api/v1/trade-fairs/${created.body.id}`)
      .set('Authorization', `Bearer ${stockToken}`)
      .send({ notes: 'Ürünler kalmalı' })
      .expect(200);
    expect(partial.body.products).toHaveLength(2);

    const cleared = await api()
      .patch(`/api/v1/trade-fairs/${created.body.id}`)
      .set('Authorization', `Bearer ${stockToken}`)
      .send({ productModelIds: [] })
      .expect(200);
    expect(cleared.body.products).toEqual([]);

    // Kiracıda bulunmayan ürün bağlanamaz (başka kiracının ürünü de aynı sorguya takılır).
    await api()
      .patch(`/api/v1/trade-fairs/${created.body.id}`)
      .set('Authorization', `Bearer ${stockToken}`)
      .send({ productModelIds: ['00000000-0000-4000-8000-000000000000'] })
      .expect(422);
  });

  it('adds a fair record to Companies as a new company or under an existing one', async () => {
    const record = await api()
      .post('/api/v1/trade-fairs')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ ...required, fairName, companyName: `Fuar Yeni Firma ${runId}`, contactName: 'Deniz Yıldız', mobilePhone: `0532 ${runId.slice(6, 13)}`, email: `deniz-${runId}@ornek.com`, province: 'Bursa', district: 'Nilüfer' })
      .expect(201);
    recordIds.push(record.body.id);

    // Fuarda eklenen fotoğraf firma kartında da görünmeli.
    const [photo] = await getDb()
      .insert(files)
      .values({
        tenantId: record.body.tenantId,
        bucket: 'erp-service-documents',
        objectKey: `test/trade-fair/${runId}/stand.png`,
        originalFilename: 'stand.png',
        mimeType: 'image/png',
        extension: 'png',
        sizeBytes: 68,
        uploadedBy: salesUserId,
        uploadStatus: 'uploaded',
        uploadedAt: new Date(),
      })
      .returning({ id: files.id });
    await api()
      .post('/api/v1/files/link')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ fileId: photo.id, entityType: 'trade_fair_contact', entityId: record.body.id, documentTypeCode: 'other' })
      .expect(201);

    // Firma açma yetkisi olmayan rol (servis) ekleyemez.
    await api().post(`/api/v1/trade-fairs/${record.body.id}/company`).set('Authorization', `Bearer ${serviceToken}`).send({}).expect(403);

    const added = await api()
      .post(`/api/v1/trade-fairs/${record.body.id}/company`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ divisionIds: divisionId ? [divisionId] : undefined })
      .expect(201);
    expect(added.body.companyId).toBeTruthy();
    expect(added.body.contactId).toBeTruthy();
    expect(added.body.linkedCompanyName).toBe(`Fuar Yeni Firma ${runId}`.toLocaleUpperCase('tr-TR'));
    companyIds.push(added.body.companyId);
    contactIds.push(added.body.contactId);
    const company = await api().get(`/api/v1/companies/${added.body.companyId}`).set('Authorization', `Bearer ${salesToken}`).expect(200);
    // Firma servisi ünvanı büyük harfe çevirir (mevcut kural).
    expect(company.body.legalTitle).toBe(`Fuar Yeni Firma ${runId}`.toLocaleUpperCase('tr-TR'));
    const companyFiles = await api()
      .get(`/api/v1/files/links?entityType=company&entityId=${added.body.companyId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(200);
    expect(companyFiles.body.data.map((l: { file: { id: string } }) => l.file.id)).toEqual([photo.id]);
    const contact = await api().get(`/api/v1/contacts/${added.body.contactId}`).set('Authorization', `Bearer ${salesToken}`).expect(200);
    expect(contact.body.fullName).toBe('Deniz Yıldız'.toLocaleUpperCase('tr-TR'));

    // İkinci kez eklenemez.
    await api().post(`/api/v1/trade-fairs/${record.body.id}/company`).set('Authorization', `Bearer ${salesToken}`).send({}).expect(409);

    // Aynı ünvanla ikinci fuar kaydı yeni firma açamaz; mevcut firmaya kontak olarak bağlanır.
    const second = await api()
      .post('/api/v1/trade-fairs')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ ...required, fairName, companyName: `Fuar Yeni Firma ${runId}`, contactName: 'Ece Kara' })
      .expect(201);
    recordIds.push(second.body.id);
    await api()
      .post(`/api/v1/trade-fairs/${second.body.id}/company`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ divisionIds: divisionId ? [divisionId] : undefined })
      .expect(409);
    const linked = await api()
      .post(`/api/v1/trade-fairs/${second.body.id}/company`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ companyId: added.body.companyId })
      .expect(201);
    expect(linked.body.companyId).toBe(added.body.companyId);
    contactIds.push(linked.body.contactId);

    const listed = await api()
      .get(`/api/v1/trade-fairs?fairName=${encodeURIComponent(fairName)}&q=${encodeURIComponent('Ece Kara')}`)
      .set('Authorization', `Bearer ${stockToken}`)
      .expect(200);
    expect(listed.body.data[0].linkedCompanyName).toBe(`Fuar Yeni Firma ${runId}`.toLocaleUpperCase('tr-TR'));
  });

  it('keeps the new company link when the contact step fails and does not open a second company on retry', async () => {
    // Kara listedeki bir kontakla aynı e-posta: firma açılır, kontak adımı 409 ile düşer.
    const email = `kara-${runId}@ornek.com`;
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${superToken}`).expect(200);
    const [blocked] = await getDb()
      .insert(contacts)
      // Kontak bir firmaya bağlı olmak zorunda; önceki testte açılan firma kullanılır.
      .values({ tenantId: me.body.user.tenantId, companyId: companyIds[0], externalContactNo: `KL-${runId.slice(-10)}`, fullName: 'Kara Liste', workEmail: email, isBlacklisted: true, blacklistReason: 'test' })
      .returning({ id: contacts.id });
    contactIds.push(blocked.id);
    const title = `Fuar Yarım Firma ${runId}`;
    const record = await api()
      .post('/api/v1/trade-fairs')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ ...required, fairName, companyName: title, contactName: 'Yarım Kişi', email })
      .expect(201);
    recordIds.push(record.body.id);
    const body = { divisionIds: divisionId ? [divisionId] : undefined };

    await api().post(`/api/v1/trade-fairs/${record.body.id}/company`).set('Authorization', `Bearer ${salesToken}`).send(body).expect(409);
    const afterFirst = await api()
      .get(`/api/v1/trade-fairs?fairName=${encodeURIComponent(fairName)}&q=${encodeURIComponent('Yarım Kişi')}`)
      .set('Authorization', `Bearer ${stockToken}`)
      .expect(200);
    expect(afterFirst.body.data[0].companyId).toBeTruthy();
    expect(afterFirst.body.data[0].contactId).toBeNull();
    companyIds.push(afterFirst.body.data[0].companyId);

    // Tekrar deneme aynı firmayla kontak adımına döner; ikinci firma açılmaz (mükerrer ünvan 409'u da gelmez).
    const retry = await api().post(`/api/v1/trade-fairs/${record.body.id}/company`).set('Authorization', `Bearer ${salesToken}`).send(body);
    expect(retry.status).toBe(409);
    // Hata yine kontak adımından gelir; firma mükerrer ünvan hatası gelmez.
    expect(JSON.stringify(retry.body)).not.toContain('ünvanla');
    const sameTitle = await getDb()
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.legalTitle, title.toLocaleUpperCase('tr-TR')), isNull(companies.deletedAt)));
    expect(sameTitle).toHaveLength(1);
  });

  it('requires a division on new records', async () => {
    const missingDivision = await api()
      .post('/api/v1/trade-fairs')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ fairName, companyName: 'X', contactName: 'Y', notes: 'Not var' })
      .expect(422);
    expect(JSON.stringify(missingDivision.body)).toContain('Bölüm seçimi zorunlu');
  });

  it('lets readonly users read but not write', async () => {
    await api().get('/api/v1/trade-fairs').set('Authorization', `Bearer ${readonlyToken}`).expect(200);
    await api()
      .post('/api/v1/trade-fairs')
      .set('Authorization', `Bearer ${readonlyToken}`)
      .send({ ...required, fairName, companyName: 'X', contactName: 'Y' })
      .expect(403);
  });

  it('rejects invalid input and lets only the creator delete', async () => {
    await api()
      .post('/api/v1/trade-fairs')
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({ ...required, fairName, companyName: 'X', contactName: 'Y', email: 'gecersiz' })
      .expect(422);

    await api().delete(`/api/v1/trade-fairs/${recordIds[0]}`).set('Authorization', `Bearer ${stockToken}`).expect(403);
    await api().delete(`/api/v1/trade-fairs/${recordIds[0]}`).set('Authorization', `Bearer ${serviceToken}`).expect(200);
  });
});
