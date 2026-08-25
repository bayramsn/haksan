/**
 * Teklif maili: alıcı seçicisi firmanın kontaklarını ve ekibi vermeli, teklif
 * PDF'i ek olarak üretilebilmeli, CC alanı şemadan geçmeli.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { mailSendSchema } from '@haksan/shared';
import { createTestApp } from './setup';

describe('Mail compose', () => {
  let app: NestFastifyApplication;
  let token: string;
  let divisionId: string;
  let createdCompanyId: string | undefined;
  let createdContactId: string | undefined;

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
    // Kontak silinmeden firma silinemez (bağımlılık kontrolü 409 döner).
    if (createdContactId) {
      await request(app.getHttpServer())
        .delete(`/api/v1/contacts/${createdContactId}`)
        .set('Authorization', `Bearer ${token}`);
    }
    if (createdCompanyId) {
      await request(app.getHttpServer())
        .delete(`/api/v1/companies/${createdCompanyId}`)
        .set('Authorization', `Bearer ${token}`);
    }
    await app.close();
  });

  it('şema CC ve teklif ekini kabul eder', () => {
    const parsed = mailSendSchema.safeParse({
      to: 'musteri@example.com',
      cc: ['ekip@haksancnc.com.tr', 'ikinci@example.com'],
      subject: 'CNC-2026/033 Fiyat Teklifi',
      body: 'Merhaba,',
      quoteId: '00000000-0000-4000-8000-000000000000',
    });
    expect(parsed.success).toBe(true);
  });

  it('alıcı seçicisi ekip listesini döner', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/mail/recipients')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(response.body.colleagues)).toBe(true);
    expect(Array.isArray(response.body.contacts)).toBe(true);
    for (const row of response.body.colleagues) {
      expect(row.email).toEqual(expect.any(String));
      expect(row.name).toEqual(expect.any(String));
    }
  });

  it('firma verildiğinde o firmanın kontak e-postalarını döner', async () => {
    // Seed verisine güvenilmez (CI'da taze veritabanı): firma ve kontak testin
    // kendisi tarafından üretilir, sonunda temizlenir.
    const suffix = Date.now();
    const workEmail = `mail.compose.${suffix}@example.com`;
    const company = await request(app.getHttpServer())
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyType: 'company',
        legalTitle: `Mail Alıcı Testi ${suffix}`,
        relationTypeCode: 'customer',
        customerStatusCode: 'potential',
        divisionIds: [divisionId],
      })
      .expect(201);
    createdCompanyId = company.body.id;

    const contact = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId: createdCompanyId, fullName: `Mail Kontağı ${suffix}`, title: 'Satın Alma', workEmail })
      .expect(201);
    createdContactId = contact.body.id;

    const response = await request(app.getHttpServer())
      .get(`/api/v1/mail/recipients?companyId=${createdCompanyId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.contacts).toContainEqual({
      email: workEmail,
      name: contact.body.fullName,
      detail: 'Satın Alma',
      contactId: contact.body.id,
    });
  });

  it('mail şablonu not şablonu olarak kaydedilip listeleniyor', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/note-templates')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: `Teklif maili ${Date.now()}`, body: 'Merhaba,\n\nTeklifimizi ekte bulabilirsiniz.', scope: 'mail' })
      .expect(201);
    expect(created.body.scope).toBe('mail');

    const list = await request(app.getHttpServer())
      .get('/api/v1/note-templates?scope=mail')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.some((row: { id: string }) => row.id === created.body.id)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/api/v1/note-templates/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('teklif PDF eki üretilebiliyor', async () => {
    const quotes = await request(app.getHttpServer())
      .get('/api/v1/quotes?page=1&pageSize=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const quote = quotes.body.data[0];
    if (!quote) return; // seed veride teklif yoksa atla

    const pdf = await request(app.getHttpServer())
      .post(`/api/v1/quotes/${quote.id}/generate-pdf`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.body.length).toBeGreaterThan(1000);
  });
});
