/**
 * Contract conformance: the most-used endpoint responses must satisfy the shared
 * Zod schemas the frontend validates against. This catches server/client contract
 * drift (a renamed/removed field) at test time instead of in the browser.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { loginResponseSchema, meResponseSchema } from '@haksan/shared';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let accessToken: string;

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

describe('Contract conformance', () => {
  it('POST /auth/login response matches loginResponseSchema', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@haksan.local', password: 'admin12345' });
    const parsed = loginResponseSchema.safeParse(r.body);
    if (!parsed.success) console.error(parsed.error.issues);
    expect(parsed.success).toBe(true);
  });

  it('GET /auth/me response matches meResponseSchema', async () => {
    const r = await supertest(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    const parsed = meResponseSchema.safeParse(r.body);
    if (!parsed.success) console.error(parsed.error.issues);
    expect(parsed.success).toBe(true);
  });
});
