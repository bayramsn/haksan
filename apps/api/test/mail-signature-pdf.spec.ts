/**
 * Mail imzası, belge PDF indirme ucu ve proforma/sözleşme mail eki.
 * Webmail özelliği .env'den bağımsız açılır; test kendi kullanıcılarını üretir.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { and, eq, inArray } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { mailSendSchema } from '@haksan/shared';
import { createTestApp } from './setup';
import { getDb } from '../src/db/client';
import { userMailAccounts, users } from '../src/db/schema';
import { HtmlPdfService } from '../src/shared/pdf/html-pdf.service';
import { signedMailBody } from '../src/shared/mailer/user-mail-account.service';

vi.hoisted(() => {
  process.env.USER_MAIL_ENABLED = 'true';
  process.env.USER_MAIL_SMTP_HOST ||= 'smtp.example.invalid';
  process.env.USER_MAIL_ALLOWED_EMAIL_DOMAINS ||= 'haksan.local';
  process.env.USER_MAIL_CREDENTIAL_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString('base64');
});

describe('signedMailBody', () => {
  it('imzayı düz metne ayraçla, HTML\'e kaçışlanmış ve logolu ekler', () => {
    const { text, html } = signedMailBody('Merhaba <b>Ali</b>,\nEkte.', 'Ayşe Yılmaz\nSatış & Pazarlama', true);
    expect(text).toBe('Merhaba <b>Ali</b>,\nEkte.\n\n-- \nAyşe Yılmaz\nSatış & Pazarlama');
    expect(html).toContain('white-space:pre-wrap">Merhaba &lt;b&gt;Ali&lt;/b&gt;,\nEkte.');
    expect(html).toContain('<strong>Ayşe Yılmaz</strong><br>Satış &amp; Pazarlama');
    expect(html).toContain('src="cid:haksan-signature-logo"');
  });

  it('imza boşsa yalnız mesajı gönderir', () => {
    const { text, html } = signedMailBody('Merhaba', '', false);
    expect(text).toBe('Merhaba');
    expect(html).not.toContain('border-top');
  });
});

describe('HtmlPdfService ağ kapalı kutusu', () => {
  it.skipIf(!HtmlPdfService.executablePath())('prefetch / prerender bağlantıları sunucudan istek çıkaramaz', async () => {
    let hits = 0;
    const server = createServer((_req, res) => { hits += 1; res.end('ok'); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const svc = new HtmlPdfService();
    try {
      // Bu bağlantılar sayfa interception'ını atlıyordu (kör SSRF); proxy kilidi kapatır.
      await svc.render(`<!doctype html><html><head>
        <link rel="prefetch" href="http://127.0.0.1:${port}/prefetch">
        <link rel="prerender" href="http://127.0.0.1:${port}/prerender">
        <link rel="stylesheet" href="http://127.0.0.1:${port}/style.css">
        </head><body><img src="http://127.0.0.1:${port}/img.png">Belge</body></html>`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(hits).toBe(0);
    } finally {
      await svc.onModuleDestroy();
      server.close();
    }
  }, 60_000);
});

describe('Mail signature and document PDF API', () => {
  let app: NestFastifyApplication;
  let superToken = '';
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const userIds: string[] = [];
  const api = () => request(app.getHttpServer());
  const login = async (email: string, password: string) =>
    (await api().post('/api/v1/auth/login').send({ email, password }).expect(201)).body.accessToken as string;

  const createUser = async (role: string) => {
    const username = `imza-${role}${userIds.length}-${runId.slice(-6)}`;
    const password = 'ImzaTest!2026';
    const created = await api()
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ fullName: `İmza ${role}`, email: `${username}@haksan.local`, username, password, roleCodes: [role] })
      .expect(201);
    userIds.push(created.body.id);
    const [row] = await getDb().select({ tenantId: users.tenantId }).from(users).where(eq(users.id, created.body.id));
    return { id: created.body.id as string, tenantId: row.tenantId, token: await login(`${username}@haksan.local`, password) };
  };

  beforeAll(async () => {
    app = await createTestApp();
    superToken = await login('superadmin@haksan.local', 'superadmin12345');
  });

  afterAll(async () => {
    const db = getDb();
    if (userIds.length) await db.delete(userMailAccounts).where(inArray(userMailAccounts.userId, userIds));
    for (const id of userIds) await api().delete(`/api/v1/users/${id}`).set('Authorization', `Bearer ${superToken}`);
    await app.close();
  });

  it('imzayı kaydeder, varsayılana döndürür ve kapatabilir', async () => {
    const user = await createUser('sales');
    // Hesap bağlamak SMTP doğrulaması ister; satır doğrudan yazılır (parola kullanılmaz).
    await getDb().insert(userMailAccounts).values({
      tenantId: user.tenantId,
      userId: user.id,
      email: `imza-${runId}@haksan.local`,
      displayName: 'İmza Test',
      encryptedPassword: 'unused',
    });

    const initial = await api().get('/api/v1/mail/account').set('Authorization', `Bearer ${user.token}`).expect(200);
    expect(initial.body.signature).toBeNull();
    expect(initial.body.defaultSignature).toContain('İmza sales');
    expect(initial.body.defaultSignature).toContain(`imza-${runId}@haksan.local`);

    const saved = await api().put('/api/v1/mail/signature').set('Authorization', `Bearer ${user.token}`)
      .send({ signature: '  Ayşe Yılmaz\r\nSatış Müdürü  ' }).expect(200);
    expect(saved.body.signature).toBe('Ayşe Yılmaz\nSatış Müdürü');

    const off = await api().put('/api/v1/mail/signature').set('Authorization', `Bearer ${user.token}`)
      .send({ signature: '' }).expect(200);
    expect(off.body.signature).toBe('');

    const reset = await api().put('/api/v1/mail/signature').set('Authorization', `Bearer ${user.token}`)
      .send({ signature: null }).expect(200);
    expect(reset.body.signature).toBeNull();

    const [row] = await getDb().select({ signature: userMailAccounts.signature }).from(userMailAccounts)
      .where(and(eq(userMailAccounts.userId, user.id), eq(userMailAccounts.tenantId, user.tenantId)));
    expect(row.signature).toBeNull();
  });

  it('webmail hesabı yokken imza kaydedilmez', async () => {
    const user = await createUser('stock');
    const response = await api().put('/api/v1/mail/signature').set('Authorization', `Bearer ${user.token}`)
      .send({ signature: 'Ad Soyad' });
    expect(response.status, JSON.stringify(response.body)).toBe(422);
  });

  it('belge eki tek ek yolu olarak kabul edilir ve kayıt okuma yetkisi ister', async () => {
    const base = { to: 'musteri@example.com', subject: 'PF-1 Proforma Fatura', body: 'Ekte.' };
    const document = {
      id: '00000000-0000-4000-8000-000000000000',
      kind: 'proforma' as const,
      pdf: { html: '<main>proforma</main>', filename: 'Proforma_PF-1.pdf' },
    };
    expect(mailSendSchema.safeParse({ ...base, document }).success).toBe(true);
    expect(mailSendSchema.safeParse({ ...base, document, quoteId: document.id }).success).toBe(false);

    const stock = await createUser('stock');
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${stock.token}`).expect(200);
    expect(me.body.user.permissions ?? me.body.permissions).not.toContain('proformas.read');
    const response = await api().post('/api/v1/mail/send').set('Authorization', `Bearer ${stock.token}`)
      .send({ ...base, document });
    expect(response.status, JSON.stringify(response.body)).toBe(403);
  });

  it('PDF ucu belge okuma yetkisi olmayan role kapalıdır', async () => {
    const user = await createUser('stock');
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${user.token}`).expect(200);
    const permissions: string[] = me.body.user.permissions ?? me.body.permissions;
    expect(['quotes.read', 'proformas.read', 'contracts.read', 'reports.export'].some((p) => permissions.includes(p))).toBe(false);
    await api().post('/api/v1/pdf/render').set('Authorization', `Bearer ${user.token}`)
      .send({ html: '<p>x</p>', filename: 'x.pdf' }).expect(403);
  });

  it('PDF ucu kimlik ister ve yazdırma belgesini PDF olarak döndürür', async () => {
    const body = { html: '<!doctype html><html><body><h1>Proforma</h1></body></html>', filename: 'Proforma_PF-1.pdf' };
    await api().post('/api/v1/pdf/render').send(body).expect(401);
    const bad = await api().post('/api/v1/pdf/render').set('Authorization', `Bearer ${superToken}`)
      .send({ ...body, filename: '../etc/passwd.pdf' });
    expect(bad.status).toBe(422);

    const response = await api().post('/api/v1/pdf/render').set('Authorization', `Bearer ${superToken}`)
      .buffer(true).parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .send(body);
    if (!HtmlPdfService.executablePath()) {
      // Chromium yoksa (CI runner) sunucu yapılandırma hatası döner; istemci HTML'e düşer.
      expect(response.status).toBe(503);
      return;
    }
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toBe('attachment; filename="Proforma_PF-1.pdf"');
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  }, 120_000);
});
