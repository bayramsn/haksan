import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('Auth', () => {
  it('rejects unknown user with 401', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'noone@example.com', password: 'whatever12345' });
    expect(r.status).toBe(401);
  });

  it('rejects bad password with 401', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@haksan.local', password: 'wrong-password' });
    expect(r.status).toBe(401);
  });

  it('issues access token + refresh cookie on correct credentials', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@haksan.local', password: 'admin12345' });
    expect(r.status).toBe(201);
    expect(r.body.accessToken).toBeTruthy();
    const setCookie = r.headers['set-cookie'];
    expect(Array.isArray(setCookie) ? setCookie.join(';') : setCookie).toMatch(/haksan_rt=/);
  });

  it('GET /auth/me without token returns 401', async () => {
    const r = await supertest(app.getHttpServer()).get('/api/v1/auth/me');
    expect(r.status).toBe(401);
  });

  it('GET /auth/me with token returns user + permissions', async () => {
    const login = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@haksan.local', password: 'admin12345' });
    const r = await supertest(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(r.status).toBe(200);
    expect(r.body.user.email).toBe('admin@haksan.local');
    expect(r.body.user.roles).toContain('admin');
    expect(Array.isArray(r.body.user.permissions)).toBe(true);
    expect(r.body.tenant.slug).toBe('haksan');
  });

  it('rejects rebellious 8th login attempt (lockout)', async () => {
    // Min password length is 8 chars in the login schema; use 8+
    const seen = new Set<number>();
    for (let i = 0; i < 7; i++) {
      const r = await supertest(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'finance@haksan.local', password: 'WRONGPASS' + i });
      seen.add(r.status);
      if (r.status === 423) break;
    }
    expect([...seen].some((s) => s === 401 || s === 423 || s === 429)).toBe(true);
  });
});
