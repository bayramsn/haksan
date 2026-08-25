import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  metaAudienceMembersSchema,
  metaCampaignCreateSchema,
  metaCampaignUpdateSchema,
  metaConnectionCreateSchema,
} from '@haksan/shared';
import type { DbClient } from '../src/db/client';
import { UnauthorizedError, ValidationError } from '../src/shared/utils/errors';
import type { MetaGraphClient } from '../src/modules/meta/meta-graph.client';
import type { MetaService } from '../src/modules/meta/meta.service';
import { MetaWebhookService } from '../src/modules/meta/meta-webhook.service';

describe('Meta integration security contracts', () => {
  it('keeps new campaigns paused and requires explicit approval for activation or budget changes', () => {
    const created = metaCampaignCreateSchema.parse({
      connectionId: '11111111-1111-4111-8111-111111111111',
      name: 'Lead kampanyası',
      objective: 'OUTCOME_LEADS',
    });
    expect(created.status).toBe('PAUSED');
    expect(metaCampaignUpdateSchema.safeParse({
      connectionId: created.connectionId,
      status: 'ACTIVE',
    }).success).toBe(false);
    expect(metaCampaignUpdateSchema.safeParse({
      connectionId: created.connectionId,
      dailyBudgetMinor: 50_000,
      confirmation: 'META_CAMPAIGN_CHANGE',
    }).success).toBe(true);
  });

  it('requires legal-basis confirmation and CRM opportunity ids for audience uploads', () => {
    expect(metaAudienceMembersSchema.safeParse({
      connectionId: '11111111-1111-4111-8111-111111111111',
      opportunityIds: ['22222222-2222-4222-8222-222222222222'],
    }).success).toBe(false);
    expect(metaAudienceMembersSchema.safeParse({
      connectionId: '11111111-1111-4111-8111-111111111111',
      opportunityIds: ['22222222-2222-4222-8222-222222222222'],
      legalBasisConfirmed: true,
      rows: [['plaintext@example.com']],
    }).success).toBe(false);
    expect(metaAudienceMembersSchema.safeParse({
      connectionId: '11111111-1111-4111-8111-111111111111',
      opportunityIds: ['22222222-2222-4222-8222-222222222222'],
      legalBasisConfirmed: true,
    }).success).toBe(true);
  });

  it('never accepts a connection without a server-encrypted access token input', () => {
    expect(metaConnectionCreateSchema.safeParse({ name: 'Haksan Meta', pageId: '123', permissions: [] }).success).toBe(false);
  });

  it('rejects unsigned webhook payloads before touching the inbox', async () => {
    const graph = {
      appSecret: () => 'test-meta-app-secret',
      webhookVerifyToken: () => 'test-webhook-token',
    } as unknown as MetaGraphClient;
    const service = new MetaWebhookService({} as DbClient, graph, {} as MetaService);
    await expect(service.ingest('{"object":"page","entry":[]}', undefined, {})).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('validates the exact signed raw body before accepting its JSON shape', async () => {
    const secret = 'test-meta-app-secret';
    const rawBody = '{"object":"page","entry":[]}';
    const graph = {
      appSecret: () => secret,
      webhookVerifyToken: () => 'test-webhook-token',
    } as unknown as MetaGraphClient;
    const service = new MetaWebhookService({} as DbClient, graph, {} as MetaService);
    const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    await expect(service.ingest(rawBody, signature, JSON.parse(rawBody))).rejects.toBeInstanceOf(ValidationError);
    expect(service.verifyChallenge('subscribe', 'test-webhook-token', 'challenge')).toBe('challenge');
    expect(() => service.verifyChallenge('subscribe', 'wrong-token', 'challenge')).toThrow(UnauthorizedError);
  });
});
