import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ALLOWED_FILE_EXTENSIONS, ALLOWED_MIME_TYPES } from '@haksan/shared';
import { createTestApp } from './setup';
import { StorageService } from '../src/shared/storage/storage.service';

let app: NestFastifyApplication;
let adminToken = '';
let salesToken = '';
let salesUserId = '';
let conversationId = '';

beforeAll(async () => {
  app = await createTestApp();
  const server = app.getHttpServer();
  const [admin, sales] = await Promise.all([
    supertest(server).post('/api/v1/auth/login').send({ email: 'admin@haksan.local', password: 'admin12345' }),
    supertest(server).post('/api/v1/auth/login').send({ email: 'sales@haksan.local', password: 'sales12345' }),
  ]);
  adminToken = admin.body.accessToken;
  salesToken = sales.body.accessToken;
  salesUserId = sales.body.user.id;

  const dm = await supertest(server)
    .post('/api/v1/chat/conversations/dm')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ userId: salesUserId });
  expect(dm.status, JSON.stringify(dm.body)).toBe(201);
  conversationId = dm.body.id;
});

afterAll(async () => {
  await app.close();
});

describe('Chat message collaboration features', () => {
  it('supports GIF as a magic-byte validated upload type', async () => {
    expect(ALLOWED_FILE_EXTENSIONS).toContain('gif');
    expect(ALLOWED_MIME_TYPES).toContain('image/gif');
    const singlePixelGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
    const storage = new StorageService({} as never);
    await expect(
      storage.validateActualFile(singlePixelGif, { mimeType: 'image/gif', extension: 'gif' }),
    ).resolves.toBeUndefined();
  });

  it('shares a validated location and finds message content server-side', async () => {
    const server = app.getHttpServer();
    const marker = `MMT-1170 konum görüşmesi ${Date.now()}`;
    const sent = await supertest(server)
      .post(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        body: marker,
        location: { latitude: 40.9829, longitude: 29.1248, label: 'Müşteri konumu' },
      });

    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    expect(sent.body.location).toEqual({ latitude: 40.9829, longitude: 29.1248, label: 'Müşteri konumu' });

    const search = await supertest(server)
      .get(`/api/v1/chat/conversations/${conversationId}/messages`)
      .query({ search: 'MMT-1170', limit: 100 })
      .set('Authorization', `Bearer ${salesToken}`);
    expect(search.status, JSON.stringify(search.body)).toBe(200);
    expect(search.body.messages.some((message: { id: string }) => message.id === sent.body.id)).toBe(true);
  });

  it('deletes a sender message for every conversation participant', async () => {
    const server = app.getHttpServer();
    const sent = await supertest(server)
      .post(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: `Herkesten sil ${Date.now()}` });
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);

    const removed = await supertest(server)
      .delete(`/api/v1/chat/messages/${sent.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);

    for (const token of [adminToken, salesToken]) {
      const list = await supertest(server)
        .get(`/api/v1/chat/conversations/${conversationId}/messages`)
        .query({ limit: 100 })
        .set('Authorization', `Bearer ${token}`);
      expect(list.status, JSON.stringify(list.body)).toBe(200);
      expect(list.body.messages.some((message: { id: string }) => message.id === sent.body.id)).toBe(false);
    }
  });

  it('rejects invalid locations and undersized search terms', async () => {
    const server = app.getHttpServer();
    const badLocation = await supertest(server)
      .post(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ location: { latitude: 120, longitude: 29.1248 } });
    expect([400, 422]).toContain(badLocation.status);

    const shortSearch = await supertest(server)
      .get(`/api/v1/chat/conversations/${conversationId}/messages`)
      .query({ search: 'x' })
      .set('Authorization', `Bearer ${salesToken}`);
    expect([400, 422]).toContain(shortSearch.status);
  });

  it('returns authenticated WebRTC ICE configuration without exposing a long-lived secret', async () => {
    const response = await supertest(app.getHttpServer())
      .get('/api/v1/chat/webrtc-config')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.iceServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ urls: 'stun:stun.l.google.com:19302' }),
      ]),
    );
    expect(JSON.stringify(response.body)).not.toContain('WEBRTC_TURN_SHARED_SECRET');
  });
});
