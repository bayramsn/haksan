import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { and, asc, eq, inArray, isNull, lt, lte } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import {
  metaConnections,
  metaFormMappings,
  metaMessages,
  metaWebhookEvents,
  opportunities,
  opportunityStatuses,
  pipelineStages,
} from '../../db/schema';
import { DB } from '../../shared/database/database.module';
import { AppError, UnauthorizedError, ValidationError } from '../../shared/utils/errors';
import { MetaGraphClient } from './meta-graph.client';
import { MetaService } from './meta.service';

const webhookPayloadSchema = z.object({
  object: z.string().min(1).max(64),
  entry: z.array(z.object({
    id: z.string().min(1).max(128),
    time: z.number().int().nonnegative().optional(),
    changes: z.array(z.object({ field: z.string().min(1).max(64), value: z.record(z.unknown()) }).passthrough()).max(500).optional(),
    messaging: z.array(z.record(z.unknown())).max(500).optional(),
  }).passthrough()).min(1).max(100),
}).passthrough();

type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
type ConnectionRow = typeof metaConnections.$inferSelect;

interface LeadDetails {
  id: string;
  created_time?: string;
  ad_id?: string;
  ad_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  field_data?: Array<{ name: string; values: string[] }>;
}

interface ExtractedMessage {
  channel: 'messenger' | 'instagram' | 'whatsapp';
  conversationExternalId: string;
  remoteId: string;
  senderExternalId?: string;
  recipientExternalId?: string;
  text?: string;
  status: string;
  sentAt: Date;
  metadata: Record<string, unknown>;
}

@Injectable()
export class MetaWebhookService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly graph: MetaGraphClient,
    private readonly meta: MetaService
  ) {}

  verifyChallenge(mode: string | undefined, verifyToken: string | undefined, challenge: string | undefined): string {
    if (mode !== 'subscribe' || !verifyToken || !challenge || !this.constantTimeEqual(verifyToken, this.graph.webhookVerifyToken())) {
      throw new UnauthorizedError('Meta webhook doğrulaması başarısız');
    }
    return challenge;
  }

  async ingest(rawBody: string | undefined, signature: string | undefined, parsedBody: unknown) {
    if (!rawBody) throw new ValidationError('Webhook ham gövdesi alınamadı');
    this.assertSignature(rawBody, signature);
    const parsed = webhookPayloadSchema.safeParse(parsedBody);
    if (!parsed.success) throw new ValidationError('Meta webhook gövdesi geçersiz');
    const payload = parsed.data;
    const payloadSha256 = createHash('sha256').update(rawBody).digest('hex');
    let accepted = 0;

    for (const entry of payload.entry) {
      const connection = await this.meta.connectionByAssetId(entry.id);
      if (!connection) throw new UnauthorizedError('Webhook kaynağı tanınmıyor');
      const eventPayloads = [
        ...(entry.changes ?? []).map((change) => ({ eventType: change.field, payload: { object: payload.object, entryId: entry.id, entryTime: entry.time, change } })),
        ...(entry.messaging ?? []).map((messaging) => ({ eventType: 'messaging', payload: { object: payload.object, entryId: entry.id, entryTime: entry.time, messaging } })),
      ];
      for (const event of eventPayloads) {
        const externalEventKey = createHash('sha256').update(JSON.stringify(event.payload)).digest('hex');
        const inserted = await this.db.insert(metaWebhookEvents).values({
          tenantId: connection.tenantId,
          connectionId: connection.id,
          objectType: payload.object,
          objectId: entry.id,
          eventType: event.eventType,
          externalEventKey,
          payloadSha256,
          payload: event.payload,
        }).onConflictDoNothing().returning({ id: metaWebhookEvents.id });
        accepted += inserted.length;
      }
      await this.db.update(metaConnections).set({ lastWebhookAt: new Date(), updatedAt: new Date() }).where(eq(metaConnections.id, connection.id));
    }
    return { received: true, accepted };
  }

  async processPending(limit = 25, tenantId?: string): Promise<{ processed: number; failed: number }> {
    await this.db.update(metaWebhookEvents).set({ status: 'retry', nextAttemptAt: new Date(), lastError: 'STALE_PROCESSING_RECLAIMED', updatedAt: new Date() }).where(and(eq(metaWebhookEvents.status, 'processing'), lt(metaWebhookEvents.updatedAt, new Date(Date.now() - 10 * 60_000)), tenantId ? eq(metaWebhookEvents.tenantId, tenantId) : undefined));
    const candidates = await this.db.select().from(metaWebhookEvents).where(and(inArray(metaWebhookEvents.status, ['pending', 'retry']), lte(metaWebhookEvents.nextAttemptAt, new Date()), tenantId ? eq(metaWebhookEvents.tenantId, tenantId) : undefined)).orderBy(asc(metaWebhookEvents.nextAttemptAt)).limit(limit);
    let processed = 0;
    let failed = 0;
    for (const candidate of candidates) {
      const [claimed] = await this.db.update(metaWebhookEvents).set({ status: 'processing', updatedAt: new Date() }).where(and(eq(metaWebhookEvents.id, candidate.id), inArray(metaWebhookEvents.status, ['pending', 'retry']))).returning();
      if (!claimed) continue;
      try {
        await this.processEvent(claimed);
        await this.db.update(metaWebhookEvents).set({ status: 'processed', processedAt: new Date(), payload: {}, lastError: null, updatedAt: new Date() }).where(eq(metaWebhookEvents.id, claimed.id));
        processed += 1;
      } catch (error) {
        const attemptCount = claimed.attemptCount + 1;
        const dead = attemptCount >= 6;
        await this.db.update(metaWebhookEvents).set({
          status: dead ? 'dead' : 'retry',
          attemptCount,
          nextAttemptAt: new Date(Date.now() + Math.min(30_000 * 2 ** attemptCount, 3_600_000)),
          lastError: this.safeErrorCode(error),
          ...(dead ? { payload: {} } : {}),
          updatedAt: new Date(),
        }).where(eq(metaWebhookEvents.id, claimed.id));
        failed += 1;
      }
    }
    return { processed, failed };
  }

  private assertSignature(rawBody: string, signature: string | undefined) {
    if (!signature?.startsWith('sha256=')) throw new UnauthorizedError('Meta webhook imzası eksik');
    const supplied = signature.slice('sha256='.length);
    if (!/^[a-f0-9]{64}$/i.test(supplied)) throw new UnauthorizedError('Meta webhook imzası geçersiz');
    const expected = createHmac('sha256', this.graph.appSecret()).update(rawBody).digest('hex');
    if (!this.constantTimeEqual(supplied.toLowerCase(), expected)) throw new UnauthorizedError('Meta webhook imzası geçersiz');
  }

  private constantTimeEqual(left: string, right: string) {
    const a = Buffer.from(left, 'utf8');
    const b = Buffer.from(right, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async processEvent(event: typeof metaWebhookEvents.$inferSelect) {
    const connection = await this.db.query.metaConnections.findFirst({ where: and(eq(metaConnections.id, event.connectionId), eq(metaConnections.tenantId, event.tenantId), eq(metaConnections.status, 'active'), isNull(metaConnections.deletedAt)) });
    if (!connection) throw new ValidationError('Webhook bağlantısı aktif değil');
    if (event.eventType === 'leadgen') {
      await this.processLead(connection, event.payload);
      return;
    }
    const messages = this.extractMessages(event.payload);
    for (const message of messages) {
      await this.db.insert(metaMessages).values({
        tenantId: connection.tenantId,
        connectionId: connection.id,
        channel: message.channel,
        conversationExternalId: message.conversationExternalId,
        remoteId: message.remoteId,
        direction: 'inbound',
        senderExternalId: message.senderExternalId ?? null,
        recipientExternalId: message.recipientExternalId ?? null,
        text: message.text ?? null,
        status: message.status,
        sentAt: message.sentAt,
        rawMetadata: message.metadata,
      }).onConflictDoNothing();
    }
  }

  private async processLead(connection: ConnectionRow, payload: Record<string, unknown>) {
    const change = this.record(payload.change);
    const value = this.record(change.value);
    const leadgenId = this.text(value.leadgen_id);
    if (!leadgenId) throw new ValidationError('Lead webhook kimliği eksik');
    const existing = await this.db.query.opportunities.findFirst({ where: and(eq(opportunities.tenantId, connection.tenantId), eq(opportunities.externalSource, 'meta_lead_ads'), eq(opportunities.externalKey, leadgenId), isNull(opportunities.deletedAt)) });
    if (existing) return;

    const token = this.meta.decryptConnectionToken(connection);
    const lead = await this.graph.get<LeadDetails>(token, leadgenId, { fields: 'id,created_time,ad_id,ad_name,campaign_id,campaign_name,form_id,field_data' });
    const formId = lead.form_id ?? this.text(value.form_id);
    if (!formId) throw new ValidationError('Meta lead form kimliği eksik');
    const mapping = await this.db.query.metaFormMappings.findFirst({ where: and(eq(metaFormMappings.tenantId, connection.tenantId), eq(metaFormMappings.connectionId, connection.id), eq(metaFormMappings.formId, formId), eq(metaFormMappings.isActive, true), isNull(metaFormMappings.deletedAt)) });
    if (!mapping) throw new ValidationError('Meta lead form alan eşlemesi bulunamadı');
    const mapped = this.mapLeadFields(lead.field_data ?? [], mapping.fieldMappings);
    const [stage, status] = await Promise.all([
      this.db.query.pipelineStages.findFirst({ where: eq(pipelineStages.code, 'lead') }),
      this.db.query.opportunityStatuses.findFirst({ where: eq(opportunityStatuses.code, 'open') }),
    ]);
    if (!stage) throw new ValidationError('Lead pipeline aşaması bulunamadı');
    const title = mapped.companyTitle ?? mapped.contactName ?? lead.ad_name ?? lead.campaign_name ?? 'Meta Lead';
    await this.db.insert(opportunities).values({
      tenantId: connection.tenantId,
      divisionId: mapping.divisionId,
      ownerUserId: mapping.ownerUserId,
      title: title.slice(0, 255),
      leadContactName: mapped.contactName ?? null,
      leadCompanyTitle: mapped.companyTitle ?? null,
      leadContactValue: mapped.phone ?? mapped.email ?? null,
      leadPhone: mapped.phone ?? null,
      leadEmail: mapped.email ?? null,
      leadCity: mapped.city ?? null,
      leadDistrict: mapped.district ?? null,
      leadNeedSummary: mapped.needSummary ?? null,
      requestedMachine: mapped.requestedMachine ?? null,
      externalSource: 'meta_lead_ads',
      externalKey: leadgenId,
      externalMetadata: {
        connectionId: connection.id,
        formId,
        adId: lead.ad_id ?? this.text(value.ad_id) ?? null,
        campaignId: lead.campaign_id ?? null,
        campaignName: lead.campaign_name ?? null,
      },
      currentStageId: stage.id,
      statusId: status?.id ?? null,
      qualificationStage: 'lead',
      qualificationUpdatedAt: new Date(),
      leadStatusUpdatedAt: new Date(),
      createdAt: lead.created_time ? new Date(lead.created_time) : new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }

  private mapLeadFields(fieldData: Array<{ name: string; values: string[] }>, mapping: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const field of fieldData) {
      const target = mapping[field.name];
      const value = field.values?.[0]?.trim();
      if (target && value) result[target] = value.slice(0, target === 'needSummary' ? 5000 : 512);
    }
    return result;
  }

  private extractMessages(payload: Record<string, unknown>): ExtractedMessage[] {
    const objectType = this.text(payload.object);
    const messaging = this.record(payload.messaging);
    if (Object.keys(messaging).length > 0) {
      const message = this.record(messaging.message);
      const sender = this.record(messaging.sender);
      const recipient = this.record(messaging.recipient);
      const senderId = this.text(sender.id);
      const remoteId = this.text(message.mid);
      if (!senderId || !remoteId) return [];
      return [{
        channel: objectType === 'instagram' ? 'instagram' : 'messenger',
        conversationExternalId: senderId,
        remoteId,
        senderExternalId: senderId,
        recipientExternalId: this.text(recipient.id),
        text: this.text(message.text),
        status: 'received',
        sentAt: new Date(this.number(messaging.timestamp) ?? Date.now()),
        metadata: {},
      }];
    }

    const change = this.record(payload.change);
    const value = this.record(change.value);
    const messages = Array.isArray(value.messages) ? value.messages : [];
    return messages.flatMap((candidate): ExtractedMessage[] => {
      const message = this.record(candidate);
      const remoteId = this.text(message.id);
      const senderId = this.text(message.from);
      if (!remoteId || !senderId) return [];
      const textObject = this.record(message.text);
      return [{
        channel: 'whatsapp',
        conversationExternalId: senderId,
        remoteId,
        senderExternalId: senderId,
        text: this.text(textObject.body),
        status: 'received',
        sentAt: new Date(Number(this.text(message.timestamp) ?? 0) * 1000 || Date.now()),
        metadata: { type: this.text(message.type) ?? 'unknown' },
      }];
    });
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private text(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private number(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private safeErrorCode(error: unknown): string {
    if (error instanceof AppError) return error.code.slice(0, 128);
    if (error instanceof z.ZodError) return 'INVALID_WEBHOOK_PAYLOAD';
    return 'META_EVENT_PROCESSING_FAILED';
  }
}

export { webhookPayloadSchema, type WebhookPayload };
