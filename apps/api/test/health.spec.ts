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

describe('Health endpoints', () => {
  it('GET /health returns 200', async () => {
    const r = await supertest(app.getHttpServer()).get('/health');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('GET /health/ready returns 200 when DB and migrations are current', async () => {
    const r = await supertest(app.getHttpServer()).get('/health/ready');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.migrations).toBeTruthy();
  });

  it('GET /health/version returns service metadata', async () => {
    const r = await supertest(app.getHttpServer()).get('/health/version');
    expect(r.status).toBe(200);
    expect(r.body.service).toBe('haksan-api');
    expect(r.body.apiPrefix).toBeTruthy();
  });
});
