import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let adminToken: string;

beforeAll(async () => {
  app = await createTestApp();
  const login = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'admin@haksan.local', password: 'admin12345' });
  adminToken = login.body.accessToken;
});

afterAll(async () => {
  await app.close();
});

describe('Departments admin API', () => {
  it('GET /departments returns list for admin', async () => {
    const r = await supertest(app.getHttpServer())
      .get('/api/v1/departments')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('POST /departments creates department with unique code', async () => {
    const code = `dept_${Date.now()}`;
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Dept', code, description: 'vitest' });
    expect(r.status).toBe(201);
    expect(r.body.code).toBe(code);
  });

  it('GET /department-targets returns array', async () => {
    const period = '2026-06';
    const r = await supertest(app.getHttpServer())
      .get(`/api/v1/department-targets?period=${period}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});
