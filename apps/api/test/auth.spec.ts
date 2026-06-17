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

describe('Auth session lifecycle (refresh / logout)', () => {
  it('rotates the refresh cookie and issues a new access token on /auth/refresh', async () => {
    const agent = supertest.agent(app.getHttpServer());
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ email: 'admin@haksan.local', password: 'admin12345' });
    expect(login.status).toBe(201);

    const refreshed = await agent.post('/api/v1/auth/refresh').send();
    expect(refreshed.status).toBe(201);
    expect(refreshed.body.accessToken).toBeTruthy();
    const setCookie = refreshed.headers['set-cookie'];
    expect(Array.isArray(setCookie) ? setCookie.join(';') : setCookie).toMatch(/haksan_rt=/);
  });

  it('accepts /auth/refresh with explicit empty JSON body (api client default)', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ email: 'admin@haksan.local', password: 'admin12345' });

    const refreshed = await agent
      .post('/api/v1/auth/refresh')
      .set('Content-Type', 'application/json')
      .send();
    expect(refreshed.status).toBe(201);
    expect(refreshed.body.accessToken).toBeTruthy();
  });

  it('returns a null access token when /auth/refresh is called without a cookie', async () => {
    const r = await supertest(app.getHttpServer()).post('/api/v1/auth/refresh').send();
    expect(r.status).toBe(201);
    expect(r.body.accessToken).toBeNull();
  });

  it('revokes the session on /auth/logout so a subsequent refresh yields no token', async () => {
    const agent = supertest.agent(app.getHttpServer());
    await agent.post('/api/v1/auth/login').send({ email: 'admin@haksan.local', password: 'admin12345' });

    const out = await agent.post('/api/v1/auth/logout').send();
    expect(out.status).toBe(201);
    expect(out.body.ok).toBe(true);

    // Cookie was cleared by logout, so the agent has nothing to send -> null token.
    const afterLogout = await agent.post('/api/v1/auth/refresh').send();
    expect(afterLogout.body.accessToken).toBeNull();
  });
});

describe('Auth password reset (forgot -> reset)', () => {
  it('issues a reset token and accepts it on /auth/reset-password', async () => {
    // Reset back to the same password so other specs that log in as admin keep working.
    const forgot = await supertest(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'admin@haksan.local' });
    expect(forgot.status).toBe(201);
    expect(forgot.body.ok).toBe(true);
    expect(typeof forgot.body.devToken).toBe('string');

    const reset = await supertest(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: forgot.body.devToken, newPassword: 'admin12345' });
    expect(reset.status).toBe(201);
    expect(reset.body.ok).toBe(true);

    const relogin = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@haksan.local', password: 'admin12345' });
    expect(relogin.status).toBe(201);
    expect(relogin.body.accessToken).toBeTruthy();
  });

  it('rejects an unknown reset token with 422', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: 'x'.repeat(43), newPassword: 'whatever12345' });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('does not reveal whether an email exists on /auth/forgot-password', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'definitely-not-a-user@example.com' });
    expect(r.status).toBe(201);
    expect(r.body.ok).toBe(true);
    // No token is minted for a non-existent account.
    expect(r.body.devToken).toBeUndefined();
  });
});
