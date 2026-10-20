import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

// Bu senaryo gerçek .env yapılandırmasından bağımsız olarak kapalı özellik
// davranışını doğrular. Hoisted blok, AppModule/loadEnv importundan önce çalışır.
vi.hoisted(() => {
  process.env.USER_MAIL_ENABLED = 'false';
});

describe('Personal webmail account API', () => {
  let app: NestFastifyApplication;
  let accessToken = '';
  let salesAccessToken = '';
  let superadminAccessToken = '';
  let adminUserId = '';
  let salesUserId = '';

  beforeAll(async () => {
    app = await createTestApp();
    const login = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@haksan.local', password: 'admin12345' });
    accessToken = login.body.accessToken;
    adminUserId = login.body.user.id;
    const salesLogin = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'sales@haksan.local', password: 'sales12345' });
    salesAccessToken = salesLogin.body.accessToken;
    salesUserId = salesLogin.body.user.id;
    const superadminLogin = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' });
    superadminAccessToken = superadminLogin.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('kimlik doğrulaması olmadan hesap durumunu göstermez', async () => {
    const response = await supertest(app.getHttpServer()).get('/api/v1/mail/account');
    expect(response.status).toBe(401);
  });

  it('parola veya şifreli kimlik bilgisi döndürmeden kullanıcı hesabı durumunu verir', async () => {
    const response = await supertest(app.getHttpServer())
      .get('/api/v1/mail/account')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ featureEnabled: false, configured: false });
    expect(JSON.stringify(response.body)).not.toMatch(/password|credential|secret/i);
  });

  it('sunucu özelliği kapalıyken kimlik bilgisi kaydetmez', async () => {
    const response = await supertest(app.getHttpServer())
      .put('/api/v1/mail/account')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'person@haksancnc.com.tr', displayName: 'Test Kullanıcısı', password: 'not-stored' });
    expect(response.status).toBe(422);
    expect(response.body.error.message).toContain('henüz etkinleştirilmemiş');
  });

  it('süperadmin olmayan kullanıcıya kendi Webmail hesabını okuma ve gönderme uçlarını açar', async () => {
    const account = await supertest(app.getHttpServer())
      .get('/api/v1/mail/account')
      .set('Authorization', `Bearer ${salesAccessToken}`);
    expect(account.status).toBe(200);

    const send = await supertest(app.getHttpServer())
      .post('/api/v1/mail/send')
      .set('Authorization', `Bearer ${salesAccessToken}`)
      .send({ to: 'musteri@example.com', subject: 'Test', body: 'Test mesajı' });
    expect(send.status).toBe(422);
    expect(send.body.error.message).toContain('henüz etkinleştirilmemiş');
  });

  describe('kullanıcı bazlı Webmail ayarı', () => {
    const as = (token: string) => (request: supertest.Test) => request.set('Authorization', `Bearer ${token}`);
    const http = () => supertest(app.getHttpServer());
    const account = { email: 'person@haksancnc.com.tr', displayName: 'Test Kullanıcısı', password: 'not-stored' };

    it("standart kullanıcı kendi hesabını kendi id'siyle okuyabilir", async () => {
      const response = await as(salesAccessToken)(http().get(`/api/v1/mail/account/users/${salesUserId}`));
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ configured: false });
    });

    it('standart kullanıcı başkasının hesabını okuyamaz, bağlayamaz, imzalayamaz, silemez', async () => {
      const path = `/api/v1/mail/account/users/${adminUserId}`;
      expect((await as(salesAccessToken)(http().get(path))).status).toBe(403);
      expect((await as(salesAccessToken)(http().put(path).send(account))).status).toBe(403);
      expect((await as(salesAccessToken)(http().put(`${path}/signature`).send({ signature: 'x' }))).status).toBe(403);
      expect((await as(salesAccessToken)(http().put(`${path}/signature/image`).send({ image: null, filename: null }))).status).toBe(403);
      expect((await as(salesAccessToken)(http().delete(path))).status).toBe(403);
      expect((await as(accessToken)(http().get(`/api/v1/mail/account/users/${salesUserId}`))).status).toBe(403);
    });

    it('kullanıcı listesini yalnız süper admin görür', async () => {
      expect((await as(salesAccessToken)(http().get('/api/v1/mail/account/users'))).status).toBe(403);
      const response = await as(superadminAccessToken)(http().get('/api/v1/mail/account/users'));
      expect(response.status).toBe(200);
      expect(response.body.map((user: { id: string }) => user.id)).toContain(salesUserId);
    });

    it('süper admin başka kullanıcının hesabını yönetebilir ve parola dönmez', async () => {
      const path = `/api/v1/mail/account/users/${salesUserId}`;
      const status = await as(superadminAccessToken)(http().get(path));
      expect(status.status).toBe(200);
      expect(JSON.stringify(status.body)).not.toMatch(/password|credential|secret/i);
      // Yetki geçti; sunucuda özellik kapalı olduğu için kayıt yine reddedilir.
      const connect = await as(superadminAccessToken)(http().put(path).send(account));
      expect(connect.status).toBe(422);
      expect(connect.body.error.message).toContain('henüz etkinleştirilmemiş');
      expect((await as(superadminAccessToken)(http().delete(path))).status).toBe(200);
    });

    it("var olmayan kullanıcı id'si için 404 döner", async () => {
      const response = await as(superadminAccessToken)(http().get('/api/v1/mail/account/users/00000000-0000-4000-8000-000000000000'));
      expect(response.status).toBe(404);
    });
  });
});
