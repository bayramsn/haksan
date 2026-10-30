import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { and, asc, eq, inArray, isNotNull, isNull, lt, lte } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { metaConnections, metaConversionEvents } from '../../db/schema';
import { DB } from '../../shared/database/database.module';
import { logger } from '../../shared/utils/logger';
import { MetaGraphClient } from './meta-graph.client';
import { INSIGHTS_SYNC_FAILED, MetaService } from './meta.service';
import { MetaWebhookService } from './meta-webhook.service';

const INSIGHT_WINDOW_DAYS = 7;

@Injectable()
export class MetaJobsService {
  private running = false;

  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly graph: MetaGraphClient,
    private readonly meta: MetaService,
    private readonly webhooks: MetaWebhookService
  ) {}

  @Interval(30_000)
  async scheduledRun() {
    if (process.env.NODE_ENV === 'test' || this.running) return;
    this.running = true;
    try {
      await this.processNow();
    } catch (error) {
      logger.error({ err: error }, 'Meta background processing failed');
    } finally {
      this.running = false;
    }
  }

  /**
   * Reklam verisi (harcama, gösterim, tıklama, lead) Meta'dan çekilmezse panolar hep 0 gösterir.
   * Son 7 gün her 6 saatte yeniden yazılır: Meta geçmiş günlerin sayılarını birkaç gün düzeltir.
   */
  @Interval(6 * 60 * 60_000)
  async scheduledInsights() {
    if (process.env.NODE_ENV === 'test') return;
    await this.syncAllInsights().catch((error) => logger.error({ err: error }, 'Meta insights sync failed'));
  }

  async syncAllInsights(now = new Date()) {
    const rows = await this.db.select().from(metaConnections).where(and(eq(metaConnections.status, 'active'), isNull(metaConnections.deletedAt), isNotNull(metaConnections.adAccountId)));
    const from = new Date(now.getTime() - INSIGHT_WINDOW_DAYS * 24 * 60 * 60_000);
    let synced = 0;
    for (const row of rows) {
      if (row.tokenExpiresAt && row.tokenExpiresAt <= now) continue;
      try {
        await this.meta.syncConnectionInsights(row, this.meta.decryptConnectionToken(row), from, now);
        synced += 1;
      } catch (error) {
        logger.warn({ err: error, connectionId: row.id }, 'Meta insights sync failed for connection');
        await this.db.update(metaConnections).set({ lastError: INSIGHTS_SYNC_FAILED, updatedAt: new Date() }).where(eq(metaConnections.id, row.id));
      }
    }
    return { synced, total: rows.length };
  }

  async processNow(tenantId?: string) {
    const [webhooks, conversions] = await Promise.all([
      this.webhooks.processPending(25, tenantId),
      this.processConversions(25, tenantId),
    ]);
    return { webhooks, conversions };
  }

  private async processConversions(limit: number, tenantId?: string) {
    await this.db.update(metaConversionEvents).set({ status: 'retry', nextAttemptAt: new Date(), lastError: 'STALE_PROCESSING_RECLAIMED', updatedAt: new Date() }).where(and(eq(metaConversionEvents.status, 'processing'), lt(metaConversionEvents.updatedAt, new Date(Date.now() - 10 * 60_000)), tenantId ? eq(metaConversionEvents.tenantId, tenantId) : undefined));
    const candidates = await this.db.select().from(metaConversionEvents).where(and(inArray(metaConversionEvents.status, ['pending', 'retry']), lte(metaConversionEvents.nextAttemptAt, new Date()), tenantId ? eq(metaConversionEvents.tenantId, tenantId) : undefined)).orderBy(asc(metaConversionEvents.nextAttemptAt)).limit(limit);
    let processed = 0;
    let failed = 0;
    for (const candidate of candidates) {
      const [claimed] = await this.db.update(metaConversionEvents).set({ status: 'processing', updatedAt: new Date() }).where(and(eq(metaConversionEvents.id, candidate.id), inArray(metaConversionEvents.status, ['pending', 'retry']))).returning();
      if (!claimed) continue;
      try {
        const connection = await this.db.query.metaConnections.findFirst({ where: and(eq(metaConnections.id, claimed.connectionId), eq(metaConnections.tenantId, claimed.tenantId), eq(metaConnections.status, 'active'), isNull(metaConnections.deletedAt)) });
        if (!connection?.datasetId) throw new Error('META_CONNECTION_DATASET_UNAVAILABLE');
        const token = this.meta.decryptConnectionToken(connection);
        await this.graph.post<Record<string, unknown>>(token, `${connection.datasetId}/events`, { data: [claimed.payload] });
        await this.db.update(metaConversionEvents).set({ status: 'sent', sentAt: new Date(), payload: {}, lastError: null, updatedAt: new Date() }).where(eq(metaConversionEvents.id, claimed.id));
        processed += 1;
      } catch {
        const attemptCount = claimed.attemptCount + 1;
        const dead = attemptCount >= 6;
        await this.db.update(metaConversionEvents).set({
          status: dead ? 'dead' : 'retry',
          attemptCount,
          nextAttemptAt: new Date(Date.now() + Math.min(30_000 * 2 ** attemptCount, 3_600_000)),
          lastError: 'META_CONVERSION_DELIVERY_FAILED',
          ...(dead ? { payload: {} } : {}),
          updatedAt: new Date(),
        }).where(eq(metaConversionEvents.id, claimed.id));
        failed += 1;
      }
    }
    return { processed, failed };
  }
}
