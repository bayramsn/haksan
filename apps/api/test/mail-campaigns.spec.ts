/**
 * Toplu mail: alıcı başına ayrı ileti, liste dışı bırakılan adres atlanır,
 * arka plan turu gönderip kampanyayı tamamlar. SMTP yerine hesap servisi taklit edilir.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { eq } from 'drizzle-orm';
import { MailCampaignsService, fillPlaceholders, unsubscribeLinks } from '../src/modules/mail/mail-campaigns.service';
import { mailCampaignRecipients } from '../src/db/schema/mail';
import { DB } from '../src/shared/database/database.module';
import { UserMailAccountService } from '../src/shared/mailer/user-mail-account.service';

describe('Toplu mail', () => {
  let app: NestFastifyApplication;
  let token: string;

  const login = async (email: string, password: string) => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body.accessToken as string;
  };

  beforeAll(async () => {
    app = await createTestApp();
    token = await login('superadmin@haksan.local', 'superadmin12345');
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('{{ad}} ve {{firma}} alıcıya göre dolar, boşsa boşluğuyla düşer', () => {
    expect(fillPlaceholders('Merhaba {{ad}}, {{firma}} için', { name: 'Ayşe', companyName: 'Norm' })).toBe('Merhaba Ayşe, Norm için');
    expect(fillPlaceholders('Merhaba {{ ad }},', { name: '' })).toBe('Merhaba,');
  });

  it('servis rolü toplu maile erişemez', async () => {
    const serviceToken = await login('service@haksan.local', 'service12345');
    await request(app.getHttpServer()).get('/api/v1/mail/campaigns').set('Authorization', `Bearer ${serviceToken}`).expect(403);
  });

  it('CSV listesinden e-posta, ad ve firmayı okur; tekrarı ve geçersizi ayıklar', async () => {
    const csv = 'Ad Soyad;Firma;E-posta\nAyşe Kaya;Norm;ayse@example.com\nTekrar;Norm;AYSE@example.com\nBozuk;X;yok-adres\n';
    const response = await request(app.getHttpServer())
      .post('/api/v1/mail/campaigns/parse-list')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'liste.csv', fileBase64: Buffer.from(csv).toString('base64') })
      .expect(201);
    expect(response.body).toEqual({ rows: [{ email: 'ayse@example.com', name: 'Ayşe Kaya', companyName: 'Norm' }], invalid: 1 });
  });

  it('kuyruğa alır, liste dışını atlar, turda gönderip tamamlar', async () => {
    const accounts = app.get(UserMailAccountService);
    vi.spyOn(accounts, 'hasActiveAccount').mockResolvedValue(true);
    const send = vi.spyOn(accounts, 'send').mockImplementation(async () => ({ messageId: 'x', sentAt: new Date(), fromEmail: 'a@b.c', fromName: 'A' }));
    const suffix = Date.now();
    const blocked = `ret.${suffix}@example.com`;

    await request(app.getHttpServer())
      .post('/api/v1/mail/campaigns/suppressions')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: blocked.toUpperCase() })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/v1/mail/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        subject: 'Yeni katalog {{firma}}',
        body: 'Merhaba {{ad}},\n\nKataloğumuz ekte.',
        recipients: [
          { email: `bir.${suffix}@example.com`, name: 'Bir', companyName: 'Firma A' },
          { email: `BIR.${suffix}@example.com`, name: 'Tekrar' },
          { email: `iki.${suffix}@example.com` },
          { email: blocked },
        ],
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.recipients).toHaveLength(3);
    expect(created.body.recipients.find((r: any) => r.email === blocked).status).toBe('skipped');

    const service = app.get(MailCampaignsService);
    await service.runOnce();
    await service.runOnce();

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/mail/campaigns/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.status).toBe('completed');
    expect(detail.body.recipients.filter((r: any) => r.status === 'sent')).toHaveLength(2);
    const first = send.mock.calls.find(([input]) => input.to === `bir.${suffix}@example.com`)![0];
    expect(first.subject).toBe('Yeni katalog Firma A');
    expect(first.text).toBe('Merhaba Bir,\n\nKataloğumuz ekte.');
    expect(send.mock.calls.some(([input]) => input.to === blocked)).toBe(false);
  });

  it('durdurulan gönderim sürdürülünce kalanlar gider', async () => {
    const accounts = app.get(UserMailAccountService);
    vi.spyOn(accounts, 'hasActiveAccount').mockResolvedValue(true);
    vi.spyOn(accounts, 'send').mockImplementation(async () => ({ messageId: 'x', sentAt: new Date(), fromEmail: 'a@b.c', fromName: 'A' }));
    const auth = { Authorization: `Bearer ${token}` };
    const created = await request(app.getHttpServer()).post('/api/v1/mail/campaigns').set(auth)
      .send({ subject: 'Duyuru', body: 'Merhaba', recipients: [{ email: `devam.${Date.now()}@example.com` }] }).expect(201);
    const cancelled = await request(app.getHttpServer()).post(`/api/v1/mail/campaigns/${created.body.id}/cancel`).set(auth).expect(201);
    expect(cancelled.body.status).toBe('cancelled');
    await app.get(MailCampaignsService).runOnce();
    const resumed = await request(app.getHttpServer()).post(`/api/v1/mail/campaigns/${created.body.id}/resume`).set(auth).expect(201);
    expect(resumed.body.recipients[0].status).toBe('pending');
    await app.get(MailCampaignsService).runOnce();
    await app.get(MailCampaignsService).runOnce();
    const detail = await request(app.getHttpServer()).get(`/api/v1/mail/campaigns/${created.body.id}`).set(auth).expect(200);
    expect([detail.body.status, detail.body.recipients[0].status]).toEqual(['completed', 'sent']);
  });

  it('abonelikten çık: bağlantı adresleri, tek tık POST ret listesine ekler ve bekleyenleri atlar', async () => {
    const sample = '11111111-2222-4333-8444-555555555555';
    expect(unsubscribeLinks(sample, { APP_PUBLIC_URL: 'https://crm.example.com', API_PREFIX: '/api/v1' } as any)).toEqual({
      pageUrl: `https://crm.example.com/public/unsubscribe/${sample}`,
      oneClickUrl: `https://crm.example.com/api/v1/public/mail-unsubscribe/${sample}`,
    });
    expect(unsubscribeLinks(sample, { API_PREFIX: '/api/v1' } as any)).toBeUndefined();

    vi.spyOn(app.get(UserMailAccountService), 'hasActiveAccount').mockResolvedValue(true);
    const auth = { Authorization: `Bearer ${token}` };
    const email = `cik.${Date.now()}@example.com`;
    const campaign = await request(app.getHttpServer()).post('/api/v1/mail/campaigns').set(auth)
      .send({ subject: 'Duyuru', body: 'Merhaba', recipients: [{ email }] }).expect(201);
    const [row] = await (app.get(DB) as any).select({ token: mailCampaignRecipients.unsubscribeToken })
      .from(mailCampaignRecipients).where(eq(mailCampaignRecipients.campaignId, campaign.body.id));

    // Gmail'in tek tık isteği: form gövdesi, oturum yok.
    const response = await request(app.getHttpServer())
      .post(`/api/v1/public/mail-unsubscribe/${row.token}`).type('form').send('List-Unsubscribe=One-Click').expect(200);
    expect(response.body.email).toMatch(/^c\*\*\*@example\.com$/);
    await request(app.getHttpServer()).post('/api/v1/public/mail-unsubscribe/00000000-0000-4000-8000-000000000000').expect(404);

    const detail = await request(app.getHttpServer()).get(`/api/v1/mail/campaigns/${campaign.body.id}`).set(auth).expect(200);
    expect(detail.body.recipients[0].status).toBe('skipped');
    expect(JSON.stringify(detail.body)).not.toContain(row.token);
    const list = await request(app.getHttpServer()).get('/api/v1/mail/campaigns/suppressions').set(auth).expect(200);
    expect(list.body.some((r: any) => r.email === email)).toBe(true);
    await app.get(MailCampaignsService).runOnce(); // kampanya tamamlansın, sonraki testleri engellemesin
  });
});
