import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let adminToken: string;
let serviceToken: string;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

beforeAll(async () => {
  app = await createTestApp();
  const server = app.getHttpServer();
  const adminLogin = await supertest(server)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@haksan.local', password: 'admin12345' });
  adminToken = adminLogin.body.accessToken;

  const serviceLogin = await supertest(server)
    .post('/api/v1/auth/login')
    .send({ email: 'service@haksan.local', password: 'service12345' });
  serviceToken = serviceLogin.body.accessToken;
});

afterAll(async () => {
  await app.close();
});

describe('Excel exports', () => {
  it('admin can download companies xlsx', async () => {
    const r = await supertest(app.getHttpServer())
      .get('/api/v1/exports/companies')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain(XLSX_MIME);
    const size = Number(r.headers['content-length'] ?? 0);
    expect(size).toBeGreaterThan(100);
  });

  it('admin can download finance xlsx (multi-sheet)', async () => {
    const r = await supertest(app.getHttpServer())
      .get('/api/v1/exports/finance')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain(XLSX_MIME);
  });

  it('admin can download year-end report xlsx', async () => {
    const year = new Date().getFullYear();
    const r = await supertest(app.getHttpServer())
      .get(`/api/v1/reports/export/year-end?year=${year}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain('.xlsx');
  });

  it('admin can download product import template xlsx', async () => {
    const r = await supertest(app.getHttpServer())
      .get('/api/v1/products/import/template')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain(XLSX_MIME);
  });

  it('service user without reports.export gets 403 on companies export', async () => {
    const r = await supertest(app.getHttpServer())
      .get('/api/v1/exports/companies')
      .set('Authorization', `Bearer ${serviceToken}`);
    expect(r.status).toBe(403);
  });
});

describe('Product import preview', () => {
  it('accepts minimal csv base64 payload', async () => {
    const csv = 'Marka,Model,Ürün Adı\nTest,TM-1,Test Ürün\n';
    const fileBase64 = Buffer.from(csv, 'utf8').toString('base64');
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/products/import/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fileName: 'test.csv', fileBase64 });
    expect(r.status).toBe(201);
    expect(r.body.rows).toBeDefined();
    expect(Array.isArray(r.body.rows)).toBe(true);
  });
});
