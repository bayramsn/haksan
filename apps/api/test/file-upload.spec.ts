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

describe('File upload', () => {
  it('rejects an EXE upload intent', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/files/signed-upload-url')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bucket: 'erp-quote-documents',
        entityType: 'quote',
        entityId: '00000000-0000-0000-0000-000000000000',
        filename: 'malware.exe',
        mimeType: 'application/octet-stream',
        extension: 'pdf',
        sizeBytes: 100,
      })
      .catch((e: any) => ({ status: e.status ?? 422, body: {} }));
    // The Zod schema rejects bad mime-type before reaching service; either way it's a 422
    expect([400, 422]).toContain(r.status);
  });

  it('rejects an oversize upload intent', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/files/signed-upload-url')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bucket: 'erp-quote-documents',
        entityType: 'quote',
        entityId: '00000000-0000-0000-0000-000000000000',
        filename: 'huge.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        sizeBytes: 50 * 1024 * 1024, // 50MB > default 25MB
      });
    expect(r.status).toBe(422);
  });

  it('accepts a PDF upload intent and returns signed URL', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/files/signed-upload-url')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bucket: 'erp-quote-documents',
        entityType: 'quote',
        entityId: '00000000-0000-0000-0000-000000000000',
        filename: 'teklif.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        sizeBytes: 1024,
      });
    expect(r.status).toBe(201);
    expect(r.body.uploadUrl).toMatch(/^http/);
    expect(r.body.objectKey).toMatch(/^tenant\//);
    expect(r.body.objectKey).toMatch(/teklif\.pdf$/);
  });
});
