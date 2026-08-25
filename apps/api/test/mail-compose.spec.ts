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

  beforeAll(async () => {
    app = await createTestApp();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' })
      .expect(201);
    token = login.body.accessToken;
  });

  afterAll(async () => {
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
    const contacts = await request(app.getHttpServer())
      .get('/api/v1/contacts?page=1&pageSize=200')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const withEmail = contacts.body.data.find((row: { companyId?: string; workEmail?: string }) => row.companyId && row.workEmail);
    expect(withEmail, 'e-postalı kontak bulunamadı').toBeTruthy();

    const response = await request(app.getHttpServer())
      .get(`/api/v1/mail/recipients?companyId=${withEmail.companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.contacts.some((row: { email: string }) => row.email === withEmail.workEmail)).toBe(true);
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
