/**
 * 1) Aynı firma ünvanı ikinci kez açılamamalı (vergi numarası olmasa da).
 * 2) Referanslar uçtan uca CRUD.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

describe('Company duplicates & references', () => {
  let app: NestFastifyApplication;
  let token: string;
  let divisionId: string;
  const createdCompanyIds: string[] = [];
  const suffix = Date.now();

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
  });

  afterAll(async () => {
    for (const id of createdCompanyIds) {
      await request(app.getHttpServer())
        .delete(`/api/v1/companies/${id}`)
        .set('Authorization', `Bearer ${token}`);
    }
    await app.close();
  });

  const createCompany = (legalTitle: string) =>
    request(app.getHttpServer())
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyType: 'company',
        legalTitle,
        relationTypeCode: 'customer',
        customerStatusCode: 'potential',
        divisionIds: [divisionId],
      });

  it('aynı ünvanı ikinci kez kabul etmez', async () => {
    const title = `Mükerrer Test Makina ${suffix}`;
    const first = await createCompany(title).expect(201);
    createdCompanyIds.push(first.body.id);

    const second = await createCompany(`  ${title.toLocaleUpperCase('tr-TR')}. `).expect(409);
    expect(second.body.error.code).toBe('CONFLICT');
    expect(second.body.error.details?.duplicateCompanyId).toBe(first.body.id);
  });

  it('çift tıklamada (eşzamanlı iki istek) tek firma oluşturur', async () => {
    const title = `Çift Tıklama Testi ${suffix}`;
    const [first, second] = await Promise.all([createCompany(title), createCompany(title)]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    const ok = first.status === 201 ? first : second;
    createdCompanyIds.push(ok.body.id);

    // Kayıtta gerçekten tek satır olmalı; 409 dönen istek hiçbir şey yazmamalı.
    // Arama terimi olarak yalnız sayısal son ek kullanılır: ünvan Türkçe kurallarıyla
    // BÜYÜK harfe çevrilerek saklandığı için ILIKE 'i'/'İ' eşleşmesini yakalamaz.
    const list = await request(app.getHttpServer())
      .get(`/api/v1/companies?search=${suffix}&pageSize=50`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const matches = list.body.data.filter(
      (row: { legalTitle: string }) => row.legalTitle.toLocaleUpperCase('tr-TR') === title.toLocaleUpperCase('tr-TR'),
    );
    expect(matches).toHaveLength(1);
  });

  it('farklı ünvanı kabul eder', async () => {
    const other = await createCompany(`Mükerrer Test Ticaret ${suffix}`).expect(201);
    createdCompanyIds.push(other.body.id);
  });

  it('referans ekler, günceller, listeler ve siler', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/references')
      .set('Authorization', `Bearer ${token}`)
      .send({ firm: `Referans Test ${suffix}`, city: 'Bursa', brand: 'Haksan', model: 'MT-415', deliveryDate: '2024-05-01' })
      .expect(201);
    expect(created.body.id).toEqual(expect.any(String));

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/references/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contact: 'Ahmet Yılmaz', city: 'İstanbul' })
      .expect(200);
    expect(updated.body.contact).toBe('Ahmet Yılmaz');
    expect(updated.body.city).toBe('İstanbul');
    expect(updated.body.brand).toBe('Haksan');

    const list = await request(app.getHttpServer())
      .get('/api/v1/references')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.some((row: { id: string }) => row.id === created.body.id)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/api/v1/references/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/api/v1/references')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.some((row: { id: string }) => row.id === created.body.id)).toBe(false);
  });
});
