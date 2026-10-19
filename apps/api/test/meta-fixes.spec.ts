/**
 * Meta Merkezi düzeltmeleri (2026-10): Graph'ın gerçek yanıt şekilleri ve kayıp lead / kopuk webhook
 * senaryoları. Graph ve veritabanı taklit edilir; çağrılan yol ve gövde doğrulanır.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { metaCommentUpdateSchema, metaListQuerySchema } from '@haksan/shared';
import type { DbClient } from '../src/db/client';
import type { AuditService } from '../src/shared/database/audit.service';
import type { AuthContext } from '../src/shared/security/auth.types';
import type { MetaCredentialService } from '../src/modules/meta/meta-credential.service';
import type { MetaGraphClient } from '../src/modules/meta/meta-graph.client';
import { MetaService, normalizePhoneForMeta } from '../src/modules/meta/meta.service';
import { MetaWebhookService } from '../src/modules/meta/meta-webhook.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const connectionId = '22222222-2222-4222-8222-222222222222';
const actor = { tenantId, userId: '33333333-3333-4333-8333-333333333333', permissions: new Set<string>() } as unknown as AuthContext;
const secret = 'test-meta-app-secret';

const connection = (overrides: Record<string, unknown> = {}) => ({
  id: connectionId, tenantId, status: 'active', deletedAt: null, tokenExpiresAt: null, accessTokenEncrypted: 'enc',
  pageId: 'page-1', instagramAccountId: null, whatsappBusinessAccountId: null, phoneNumberId: null, adAccountId: null, ...overrides,
});

/** `insert(...).values(v).onConflictDoNothing().returning()` zincirini taklit eder; yazılan değerleri toplar. */
function insertChain(written: unknown[], returned: unknown[] = []) {
  return vi.fn(() => ({
    values: (value: unknown) => {
      written.push(value);
      const tail = { returning: async () => returned, onConflictDoNothing: () => tail, onConflictDoUpdate: () => tail, then: (resolve: (v: unknown) => void) => resolve(undefined) };
      return tail;
    },
  }));
}
const updateChain = () => vi.fn(() => ({ set: () => ({ where: async () => undefined }) }));

function metaService(graph: Partial<MetaGraphClient>, row = connection(), written: unknown[] = []) {
  const db = {
    query: { metaConnections: { findFirst: vi.fn().mockResolvedValue(row) } },
    insert: insertChain(written, [{ id: connectionId, name: 'Haksan' }]),
    update: updateChain(),
  } as unknown as DbClient;
  const credentials = { decryptAccessToken: () => 'page-token', encryptAccessToken: () => 'enc' } as unknown as MetaCredentialService;
  const audit = { write: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return new MetaService(db, credentials, { appSecret: () => secret, ...graph } as MetaGraphClient, audit);
}

describe('Meta düzeltmeleri', () => {
  it('telefonu Meta eşleştirmesi için ülke koduyla normalleştirir', () => {
    expect(normalizePhoneForMeta('0532 123 45 67')).toBe('905321234567');
    expect(normalizePhoneForMeta('532-123-4567')).toBe('905321234567');
    expect(normalizePhoneForMeta('+90 532 123 45 67')).toBe('905321234567');
    expect(normalizePhoneForMeta('0049 30 1234567')).toBe('49301234567');
  });

  it('Messenger yanıtındaki message_id ile mesajı kaydeder, hata fırlatmaz', async () => {
    const written: unknown[] = [];
    const post = vi.fn().mockResolvedValue({ recipient_id: 'psid-1', message_id: 'm_abc' });
    const service = metaService({ post }, connection(), written);
    await service.sendMessage(actor, 'psid-1', { connectionId, channel: 'messenger', text: 'Merhaba' });
    expect(post).toHaveBeenCalledWith('page-token', 'page-1/messages', expect.objectContaining({ recipient: { id: 'psid-1' } }));
    expect(written[0]).toMatchObject({ remoteId: 'm_abc', direction: 'outbound', text: 'Merhaba' });
  });

  it('yorum yanıtı ve gizleme platforma göre doğru uca gider', async () => {
    const post = vi.fn().mockResolvedValue({ id: 'c_2' });
    const service = metaService({ post }, connection({ instagramAccountId: 'ig-1' }));
    await service.replyComment(actor, 'c_1', { connectionId, message: 'Teşekkürler', platform: 'facebook' });
    await service.replyComment(actor, 'c_1', { connectionId, message: 'Teşekkürler', platform: 'instagram' });
    await service.updateComment(actor, 'c_1', { connectionId, hidden: true, platform: 'facebook' });
    await service.updateComment(actor, 'c_1', { connectionId, hidden: true });
    expect(post.mock.calls.map(([, path, body]) => [path, body])).toEqual([
      ['c_1/comments', { message: 'Teşekkürler' }],
      ['c_1/replies', { message: 'Teşekkürler' }],
      ['c_1', { is_hidden: true }],
      ['c_1', { hide: true }], // platform yoksa Instagram hesabı olan bağlantı → Instagram
    ]);
  });

  it('yorumları Instagram ve Facebook için ayrı alan listesiyle çeker, biri düşerse diğerini döner', async () => {
    const get = vi.fn(async (_token: string, path: string) => {
      if (path === 'ig-1/media') throw new Error('izin yok');
      return { data: [{ id: 'post-1', message: 'Yeni tezgah', comments: { data: [] } }] };
    });
    const service = metaService({ get }, connection({ instagramAccountId: 'ig-1' }));
    const result = await service.listComments(actor, connectionId);
    expect(result.data).toEqual([{ id: 'post-1', message: 'Yeni tezgah', comments: { data: [] }, platform: 'facebook' }]);
    const feedCall = get.mock.calls.find(([, path]) => path === 'page-1/feed') as unknown as [string, string, { fields: string }];
    expect(feedCall[2].fields).toContain('is_hidden');
    expect(feedCall[2].fields).not.toContain('timestamp');
  });

  it('OAuth kısa ömürlü token\'ı uzun ömürlüye çevirir ve sayfayı webhook\'a abone eder', async () => {
    const get = vi.fn(async (token: string, path: string) => {
      if (path === 'me/accounts') return { data: [{ id: 'page-1', name: 'Haksan', access_token: 'page-token' }] };
      if (path === 'me') return { id: 'page-1' };
      return { data: [] };
    });
    const post = vi.fn().mockResolvedValue({ success: true });
    const service = metaService({
      get, post,
      authorizationUrl: (state: string) => state,
      exchangeAuthorizationCode: vi.fn().mockResolvedValue('short-token'),
      exchangeLongLivedToken: vi.fn().mockResolvedValue('long-token'),
    });
    const { authorizationUrl: state } = service.startOauth(actor);
    const created = await service.completeOauth('code', state);
    expect(get.mock.calls.find(([, path]) => path === 'me/accounts')?.[0]).toBe('long-token');
    expect(post).toHaveBeenCalledWith('page-token', 'page-1/subscribed_apps', { subscribed_fields: 'leadgen,messages,messaging_postbacks' });
    expect(created.lastError).toBeNull();
  });

  it('abonelik reddedilirse bağlantı yine kurulur, neden lastError\'da görünür', async () => {
    const service = metaService({ get: vi.fn().mockResolvedValue({ id: 'me' }), post: vi.fn().mockRejectedValue(new Error('#200')) });
    const created = await service.createConnection(actor, { name: 'Haksan', accessToken: 'token', pageId: 'page-1', permissions: [] });
    expect(created.lastError).toBe('META_WEBHOOK_SUBSCRIBE_FAILED: sayfa');
  });

  it('tanınmayan varlığın webhook girdisini 401 yerine atlar, aynı paketteki diğerlerini kaydeder', async () => {
    const written: unknown[] = [];
    const db = { insert: insertChain(written, [{ id: 'event-1' }]), update: updateChain() } as unknown as DbClient;
    const meta = { connectionByAssetId: vi.fn(async (id: string) => (id === 'page-1' ? connection() : undefined)) } as unknown as MetaService;
    const service = new MetaWebhookService(db, { appSecret: () => secret } as unknown as MetaGraphClient, meta);
    const body = { object: 'page', entry: [
      { id: 'eski-sayfa', changes: [{ field: 'leadgen', value: { leadgen_id: 'l-0' } }] },
      { id: 'page-1', changes: [{ field: 'leadgen', value: { leadgen_id: 'l-1' } }] },
    ] };
    const raw = JSON.stringify(body);
    const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    await expect(service.ingest(raw, signature, body)).resolves.toEqual({ received: true, accepted: 1, ignored: 1 });
    expect(written).toHaveLength(1);
  });

  describe('lead webhook', () => {
    const leadDetails = { id: 'l-1', form_id: 'form-1', ad_name: 'Lazer kampanyası', field_data: [
      { name: 'full_name', values: ['Ayşe Yılmaz'] }, { name: 'email', values: ['ayse@example.com'] }, { name: 'phone_number', values: ['05321234567'] },
    ] };
    const run = async (mapping: unknown) => {
      const written: unknown[] = [];
      const db = {
        query: {
          opportunities: { findFirst: vi.fn().mockResolvedValue(undefined) },
          metaFormMappings: { findFirst: vi.fn().mockResolvedValue(mapping) },
          pipelineStages: { findFirst: vi.fn().mockResolvedValue({ id: 'stage-lead' }) },
          opportunityStatuses: { findFirst: vi.fn().mockResolvedValue({ id: 'status-open' }) },
        },
        insert: insertChain(written),
      } as unknown as DbClient;
      const meta = { decryptConnectionToken: () => 'page-token' } as unknown as MetaService;
      const graph = { get: vi.fn().mockResolvedValue(leadDetails) } as unknown as MetaGraphClient;
      const service = new MetaWebhookService(db, graph, meta);
      await (service as unknown as { processLead: (c: unknown, p: unknown) => Promise<void> })
        .processLead(connection(), { change: { field: 'leadgen', value: { leadgen_id: 'l-1' } } });
      return written;
    };

    it('eşlemesi olmayan formun lead\'i kaybolmaz, standart alanlarla oluşur', async () => {
      const [lead] = await run(undefined);
      expect(lead).toMatchObject({
        leadContactName: 'Ayşe Yılmaz', leadEmail: 'ayse@example.com', leadPhone: '05321234567',
        divisionId: null, ownerUserId: null, externalKey: 'l-1',
        externalMetadata: expect.objectContaining({ formId: 'form-1', adName: 'Lazer kampanyası' }),
      });
    });

    it('kapatılmış eşlemenin formundan lead alınmaz', async () => {
      expect(await run({ isActive: false, fieldMappings: {} })).toHaveLength(0);
    });
  });

  it('lead listesi arama/durum/platform süzgeçlerini, yorum güncellemesi platformu taşır', () => {
    expect(metaListQuerySchema.parse({ search: 'ayşe', status: 'qualified', platform: 'instagram' })).toMatchObject({ search: 'ayşe', status: 'qualified', platform: 'instagram' });
    expect(metaListQuerySchema.safeParse({ status: 'bilinmiyor' }).success).toBe(false);
    expect(metaCommentUpdateSchema.safeParse({ connectionId, hidden: true, platform: 'facebook' }).success).toBe(true);
  });
});

describe('Meta uçları (veritabanı)', () => {
  it('lead süzgeçleri ve işlenemeyen olay uçları çalışır', async () => {
    const { createTestApp } = await import('./setup');
    const request = (await import('supertest')).default;
    const app = await createTestApp();
    try {
      const login = await request(app.getHttpServer()).post('/api/v1/auth/login')
        .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' }).expect(201);
      const auth = { Authorization: `Bearer ${login.body.accessToken}` };
      const leads = await request(app.getHttpServer()).get('/api/v1/meta/leads?status=qualified&search=a%_b&platform=facebook').set(auth);
      expect(leads.status, JSON.stringify(leads.body)).toBe(200);
      expect(leads.body.meta.total).toEqual(expect.any(Number));
      const failed = await request(app.getHttpServer()).get('/api/v1/meta/webhook-events/failed').set(auth).expect(200);
      expect(Array.isArray(failed.body)).toBe(true);
      await request(app.getHttpServer()).post('/api/v1/meta/webhook-events/00000000-0000-4000-8000-000000000001/requeue').set(auth).expect(404);
    } finally {
      await app.close();
    }
  });
});
