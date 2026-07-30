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

  beforeAll(async () => {
    app = await createTestApp();
    const login = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@haksan.local', password: 'admin12345' });
    accessToken = login.body.accessToken;
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
});
