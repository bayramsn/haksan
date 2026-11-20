import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ALLOWED_FILE_EXTENSIONS, ALLOWED_MIME_TYPES } from '@haksan/shared';
import { createTestApp } from './setup';
import { DB } from '../src/shared/database/database.module';
import type { DbClient } from '../src/db/client';
import { files, fileLinks } from '../src/db/schema/files';
import { eq } from 'drizzle-orm';
import { users } from '../src/db/schema/users';
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

  it('opens an exact older message for a conversation member', async () => {
    const server = app.getHttpServer();
    const path = `/api/v1/chat/conversations/${conversationId}/messages`;
    const sent = await supertest(server).post(path)
      .set('Authorization', `Bearer ${adminToken}`).send({ body: 'Eski bildirim hedefi' });
    expect(sent.status).toBe(201);
    const newer = await supertest(server).post(path)
      .set('Authorization', `Bearer ${adminToken}`).send({ body: 'Daha yeni mesaj' });
    expect(newer.status).toBe(201);

    const result = await supertest(server).get(path)
      .query({ around: sent.body.id, limit: 1 }).set('Authorization', `Bearer ${salesToken}`);
    expect(result.status).toBe(200);
    expect(result.body.messages.map((message: { id: string }) => message.id)).toEqual([sent.body.id]);

    const missing = await supertest(server).get(path)
      .query({ around: '00000000-0000-4000-8000-000000000000' }).set('Authorization', `Bearer ${salesToken}`);
    expect(missing.status).toBe(404);
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


describe('Chat mentions, pins and forwarding', () => {
  it('pins a DM message and forwards text and location as a new message', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${adminToken}` };
    const sent = await supertest(server).post(`/api/v1/chat/conversations/${conversationId}/messages`).set(auth)
      .send({ body: 'Fiyat 12500 EUR', location: { latitude: 41, longitude: 29 } });
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    const pinned = await supertest(server).patch(`/api/v1/chat/messages/${sent.body.id}/pin`).set(auth).send({ pinned: true });
    expect(pinned.status, JSON.stringify(pinned.body)).toBe(200);
    expect(pinned.body.pinnedAt).toBeTruthy();
    const pins = await supertest(server).get(`/api/v1/chat/conversations/${conversationId}/pinned`).set(auth);
    expect(pins.body.some((m: { id: string }) => m.id === sent.body.id)).toBe(true);
    const forwarded = await supertest(server).post(`/api/v1/chat/messages/${sent.body.id}/forward`).set(auth).send({ conversationId });
    expect(forwarded.status, JSON.stringify(forwarded.body)).toBe(201);
    expect(forwarded.body.id).not.toBe(sent.body.id);
    expect(forwarded.body.forwardedFromId).toBe(sent.body.id);
    expect(forwarded.body.location.latitude).toBe(41);
    expect(forwarded.body.pinnedAt).toBeNull();
    const unpinned = await supertest(server).patch(`/api/v1/chat/messages/${sent.body.id}/pin`).set(auth).send({ pinned: false });
    expect(unpinned.body.pinnedAt).toBeNull();
  });

  it('persists favorite and mute per member and accepts partial updates', async () => {
    const server = app.getHttpServer();
    const path = `/api/v1/chat/conversations/${conversationId}/preferences`;
    const salesAuth = { Authorization: `Bearer ${salesToken}` };
    const invalid = await supertest(server).patch(path).set(salesAuth).send({});
    expect([400, 422]).toContain(invalid.status);

    try {
      const favorite = await supertest(server).patch(path).set(salesAuth).send({ isFavorite: true });
      expect(favorite.status).toBe(200);
      expect(favorite.body).toMatchObject({ isFavorite: true, isMuted: false });
      const mute = await supertest(server).patch(path).set(salesAuth).send({ isMuted: true });
      expect(mute.status).toBe(200);
      expect(mute.body).toMatchObject({ isFavorite: true, isMuted: true });

      const list = await supertest(server).get('/api/v1/chat/conversations').set(salesAuth);
      expect(list.status).toBe(200);
      expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({
        id: conversationId, isFavorite: true, isMuted: true,
      })]));
      const peer = await supertest(server).get(`/api/v1/chat/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(peer.body).toMatchObject({ isFavorite: false, isMuted: false });
    } finally {
      await supertest(server).patch(path).set(salesAuth).send({ isFavorite: false, isMuted: false });
    }
  });

  it('counts unread mentions and persists their notifications in muted groups', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${adminToken}` };
    const directory = await supertest(server).get('/api/v1/chat/directory').set(auth);
    const sales = directory.body.find((u: { id: string }) => u.id === salesUserId);
    const group = await supertest(server).post('/api/v1/chat/conversations/group').set(auth)
      .send({ title: 'Bahsetme testi', memberUserIds: [salesUserId], onlyAdminsCanPost: false });
    expect(group.status, JSON.stringify(group.body)).toBe(201);
    const salesAuth = { Authorization: `Bearer ${salesToken}` };
    const mute = await supertest(server).patch(`/api/v1/chat/conversations/${group.body.id}/preferences`)
      .set(salesAuth).send({ isMuted: true });
    expect(mute.status).toBe(200);
    const sent = await supertest(server).post(`/api/v1/chat/conversations/${group.body.id}/messages`).set(auth)
      .send({ body: `@${sales.fullName} fiyatı kontrol eder misiniz?`, mentionUserIds: [salesUserId] });
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    expect(sent.body.mentionUserIds).toEqual([salesUserId]);
    const invalid = await supertest(server).post(`/api/v1/chat/conversations/${group.body.id}/messages`).set(auth)
      .send({ body: '@Başka kullanıcı', mentionUserIds: ['00000000-0000-4000-8000-000000000001'] });
    expect([400, 422]).toContain(invalid.status);
    const notifications = await supertest(server).get('/api/v1/notifications').set('Authorization', `Bearer ${salesToken}`);
    const rows = notifications.body.items ?? notifications.body.data ?? notifications.body;
    expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({
      type: 'chat_mention', entityId: group.body.id,
      target: { kind: 'navigate', nav: 'chat', query: `${group.body.id}:${sent.body.id}` },
    })]));
    const forbiddenPin = await supertest(server).patch(`/api/v1/chat/messages/${sent.body.id}/pin`)
      .set('Authorization', `Bearer ${salesToken}`).send({ pinned: true });
    expect(forbiddenPin.status).toBe(403);
    const unread = await supertest(server).get('/api/v1/chat/conversations').set(salesAuth);
    expect(unread.body).toEqual(expect.arrayContaining([expect.objectContaining({
      id: group.body.id, isMuted: true, mentionCount: 1,
    })]));
    const read = await supertest(server).post(`/api/v1/chat/conversations/${group.body.id}/read`).set(salesAuth);
    expect(read.status).toBe(201);
    const marked = await supertest(server).get('/api/v1/chat/conversations').set(salesAuth);
    expect(marked.body).toEqual(expect.arrayContaining([expect.objectContaining({
      id: group.body.id, mentionCount: 0,
    })]));
  });
});


describe('Forwarded attachment authorization', () => {
  it('grants download through the target chat while preserving the original private link', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${adminToken}` };
    const db = app.get<DbClient>(DB);
    const [sales] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, salesUserId));
    const group = await supertest(server).post('/api/v1/chat/conversations/group').set(auth)
      .send({ title: 'Özel kaynak', memberUserIds: [], onlyAdminsCanPost: false });
    expect(group.status, JSON.stringify(group.body)).toBe(201);
    const source = await supertest(server).post(`/api/v1/chat/conversations/${group.body.id}/messages`).set(auth).send({ body: 'Özel dosya' });
    expect(source.status, JSON.stringify(source.body)).toBe(201);
    const [file] = await db.insert(files).values({ tenantId: sales.tenantId, bucket: 'service-docs',
      objectKey: `chat-forward-test/${source.body.id}.pdf`, originalFilename: 'fiyat.pdf', mimeType: 'application/pdf',
      extension: 'pdf', sizeBytes: 128, uploadStatus: 'linked', visibility: 'private' }).returning({ id: files.id });
    await db.insert(fileLinks).values({ tenantId: sales.tenantId, fileId: file.id, entityType: 'chat_message', entityId: source.body.id });
    const signing = vi.spyOn(app.get(StorageService), 'getSignedDownloadUrl').mockResolvedValue('https://example.test/signed');
    try {
      const before = await supertest(server).post('/api/v1/files/signed-download-url')
        .set('Authorization', `Bearer ${salesToken}`).send({ fileId: file.id });
      expect(before.status, JSON.stringify(before.body)).toBe(403);
      const deniedShared = await supertest(server).get(`/api/v1/chat/conversations/${group.body.id}/shared-files`)
        .set('Authorization', `Bearer ${salesToken}`);
      expect(deniedShared.status).toBe(403);
      const deniedPreferences = await supertest(server).patch(`/api/v1/chat/conversations/${group.body.id}/preferences`)
        .set('Authorization', `Bearer ${salesToken}`).send({ isFavorite: true });
      expect(deniedPreferences.status).toBe(403);
      const forwarded = await supertest(server).post(`/api/v1/chat/messages/${source.body.id}/forward`).set(auth).send({ conversationId });
      expect(forwarded.status, JSON.stringify(forwarded.body)).toBe(201);
      expect(forwarded.body.attachments).toEqual(expect.arrayContaining([expect.objectContaining({ fileId: file.id })]));
      const after = await supertest(server).post('/api/v1/files/signed-download-url')
        .set('Authorization', `Bearer ${salesToken}`).send({ fileId: file.id });
      expect(after.status, JSON.stringify(after.body)).toBe(201);
      const links = await db.select().from(fileLinks).where(eq(fileLinks.fileId, file.id));
      expect(links.map((l) => l.entityId)).toEqual(expect.arrayContaining([source.body.id, forwarded.body.id]));
      const shared = await supertest(server).get(`/api/v1/chat/conversations/${conversationId}/shared-files`)
        .set('Authorization', `Bearer ${salesToken}`);
      expect(shared.status, JSON.stringify(shared.body)).toBe(200);
      expect(shared.body).toEqual(expect.arrayContaining([expect.objectContaining({
        fileId: file.id, url: 'https://example.test/signed', filename: 'fiyat.pdf', isImage: false,
      })]));
    } finally { signing.mockRestore(); }
  });
});
