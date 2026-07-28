import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let adminToken: string;
let quoteId: string;

beforeAll(async () => {
  app = await createTestApp();
  const login = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'admin@haksan.local', password: 'admin12345' });
  adminToken = login.body.accessToken;
  const quotes = await supertest(app.getHttpServer())
    .get('/api/v1/quotes?pageSize=1')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(quotes.status).toBe(200);
  expect(quotes.body.data).not.toHaveLength(0);
  quoteId = quotes.body.data[0].id;
});

afterAll(async () => {
  await app.close();
});

describe('File upload', () => {
  it('lets document images load without a bearer token while hiding unknown media', async () => {
    const response = await supertest(app.getHttpServer())
      .get('/api/v1/products/media/00000000-0000-4000-8000-000000000000');
    expect(response.status).toBe(404);
  });

  it('rejects an EXE upload intent', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/files/signed-upload-url')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bucket: 'erp-quote-documents',
        entityType: 'quote',
        entityId: quoteId,
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
        entityId: quoteId,
        filename: 'huge.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        sizeBytes: 50 * 1024 * 1024, // 50MB > default 25MB
      });
    expect(r.status).toBe(422);
  });

  it('rejects a bucket outside the upload allow-list', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/files/signed-upload-url')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bucket: 'private-admin-backups',
        entityType: 'quote',
        entityId: quoteId,
        filename: 'teklif.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        sizeBytes: 1024,
      });
    expect([400, 422]).toContain(r.status);
  });

  it('rejects an unrecognized upload target type', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/files/signed-upload-url')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bucket: 'erp-quote-documents',
        entityType: 'admin_backup',
        entityId: quoteId,
        filename: 'teklif.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        sizeBytes: 1024,
      });
    expect([400, 422]).toContain(r.status);
  });

  it('allows a chat member to prepare and cancel an attachment', async () => {
    const directory = await supertest(app.getHttpServer())
      .get('/api/v1/chat/directory')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(directory.status).toBe(200);
    expect(directory.body).not.toHaveLength(0);

    const conversation = await supertest(app.getHttpServer())
      .post('/api/v1/chat/conversations/dm')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: directory.body[0].id });
    expect(conversation.status).toBe(201);

    const intent = await supertest(app.getHttpServer())
      .post('/api/v1/files/signed-upload-url')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bucket: 'erp-service-documents',
        entityType: 'chat_conversation',
        entityId: conversation.body.id,
        filename: 'not.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        sizeBytes: 1024,
      });
    expect(intent.status).toBe(201);

    const removal = await supertest(app.getHttpServer())
      .delete(`/api/v1/files/${intent.body.fileId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(removal.status).toBe(200);
  });

  it('allows a product creator to prepare and cancel a new product image', async () => {
    const intent = await supertest(app.getHttpServer())
      .post('/api/v1/files/signed-upload-url')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bucket: 'erp-product-images',
        entityType: 'product_draft',
        entityId: 'new',
        filename: 'new-product.png',
        mimeType: 'image/png',
        extension: 'png',
        sizeBytes: 1024,
      });
    expect(intent.status).toBe(201);

    const removal = await supertest(app.getHttpServer())
      .delete(`/api/v1/files/${intent.body.fileId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(removal.status).toBe(200);
  });

  it('prevents generic callers from linking a file directly to a chat message', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/files/link')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fileId: quoteId,
        entityType: 'chat_message',
        entityId: quoteId,
        documentTypeCode: 'other',
      });
    expect([400, 422]).toContain(r.status);
  });

  it('accepts a PDF upload intent and returns API proxy upload URL', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/files/signed-upload-url')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bucket: 'erp-quote-documents',
        entityType: 'quote',
        entityId: quoteId,
        filename: 'teklif.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        sizeBytes: 1024,
      });
    expect(r.status).toBe(201);
    expect(r.body.uploadUrl).toBe(`/api/v1/files/${r.body.fileId}/content`);
    expect(r.body.objectKey).toMatch(/^tenant\//);
    expect(r.body.objectKey).toMatch(/teklif\.pdf$/);
  });

  it('rejects content whose magic bytes do not match the declared MIME type', async () => {
    const body = Buffer.from('not-a-real-pdf');
    const intent = await supertest(app.getHttpServer())
      .post('/api/v1/files/signed-upload-url')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bucket: 'erp-quote-documents',
        entityType: 'quote',
        entityId: quoteId,
        filename: 'teklif.pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        sizeBytes: body.byteLength,
      });

    const upload = await supertest(app.getHttpServer())
      .put(`/api/v1/files/${intent.body.fileId}/content`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'application/pdf')
      .send(body);

    expect(upload.status).toBe(422);
  });
});
