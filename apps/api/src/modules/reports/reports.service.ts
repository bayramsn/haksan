import { Inject, Injectable } from '@nestjs/common';
import { and, between, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { visits as visitsTbl, calls as callsTbl } from '../../db/schema/crm';
import { opportunities, cancellationReasons, competitors } from '../../db/schema/crm';
import { users } from '../../db/schema/users';
import { quotes, quoteItems } from '../../db/schema/quotes';
import { productModels, brands } from '../../db/schema/products';
import { receivables, payments } from '../../db/schema/finance';
import { inventoryItems, customerDevices } from '../../db/schema/inventory';
import { pipelineStages, inventoryStatuses, paymentStatuses, warrantyStatuses, quoteStatuses } from '../../db/schema/lookup';
import { companies } from '../../db/schema/companies';
import { DB } from '../../shared/database/database.module';
import type { AuthContext } from '../../shared/security/auth.types';

export type Granularity = 'weekly' | 'monthly' | 'yearly';

@Injectable()
export class ReportsService {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  private bucket(granularity: Granularity, col: any) {
    switch (granularity) {
      case 'weekly':
        return sql<string>`to_char(date_trunc('week', ${col}), 'IYYY-IW')`;
      case 'monthly':
        return sql<string>`to_char(date_trunc('month', ${col}), 'YYYY-MM')`;
      case 'yearly':
        return sql<string>`to_char(date_trunc('year', ${col}), 'YYYY')`;
    }
  }

  async visitsReport(actor: AuthContext, granularity: Granularity, range: { from?: Date; to?: Date }) {
    const bucket = this.bucket(granularity, visitsTbl.visitDate);
    const filters = [eq(visitsTbl.tenantId, actor.tenantId), isNull(visitsTbl.deletedAt)];
    if (range.from) filters.push(gte(visitsTbl.visitDate, range.from));
    if (range.to) filters.push(lte(visitsTbl.visitDate, range.to));
    return this.db
      .select({ bucket, count: sql<number>`count(*)::int` })
      .from(visitsTbl)
      .where(and(...filters))
      .groupBy(bucket)
      .orderBy(bucket);
  }

  async quotesByProduct(actor: AuthContext, granularity: Granularity, range: { from?: Date; to?: Date }) {
    const bucket = this.bucket(granularity, quotes.quoteDate);
    const filters = [eq(quotes.tenantId, actor.tenantId), isNull(quotes.deletedAt)];
    if (range.from) filters.push(gte(quotes.quoteDate, range.from));
    if (range.to) filters.push(lte(quotes.quoteDate, range.to));
    return this.db
      .select({
        bucket,
        productId: productModels.id,
        productName: productModels.fullName,
        brand: brands.name,
        count: sql<number>`count(distinct ${quotes.id})::int`,
        totalValue: sql<string>`coalesce(sum(${quoteItems.lineTotal}), 0)::text`,
      })
      .from(quotes)
      .innerJoin(quoteItems, eq(quoteItems.quoteId, quotes.id))
      .leftJoin(productModels, eq(quoteItems.productModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .where(and(...filters))
      .groupBy(bucket, productModels.id, productModels.fullName, brands.name)
      .orderBy(bucket, desc(sql<number>`count(distinct ${quotes.id})`));
  }

  async expectedReceivables(actor: AuthContext) {
    const pending = await this.db.query.paymentStatuses.findFirst({ where: eq(paymentStatuses.code, 'pending') });
    const rows = await this.db
      .select({
        receivable: receivables,
        company: { id: companies.id, legalTitle: companies.legalTitle },
      })
      .from(receivables)
      .leftJoin(companies, eq(receivables.companyId, companies.id))
      .where(and(eq(receivables.tenantId, actor.tenantId), isNull(receivables.deletedAt), pending ? eq(receivables.statusId, pending.id) : sql`true`));
    return rows;
  }

  async completedPayments(actor: AuthContext, range: { from?: Date; to?: Date }) {
    const filters = [eq(payments.tenantId, actor.tenantId), isNull(payments.deletedAt)];
    if (range.from) filters.push(gte(payments.paymentDate, range.from));
    if (range.to) filters.push(lte(payments.paymentDate, range.to));
    return this.db.select().from(payments).where(and(...filters)).orderBy(desc(payments.paymentDate));
  }

  async stockSummary(actor: AuthContext) {
    return this.db
      .select({
        status: inventoryStatuses.code,
        statusName: inventoryStatuses.name,
        count: sql<number>`count(*)::int`,
      })
      .from(inventoryItems)
      .leftJoin(inventoryStatuses, eq(inventoryItems.stockStatusId, inventoryStatuses.id))
      .where(and(eq(inventoryItems.tenantId, actor.tenantId), isNull(inventoryItems.deletedAt)))
      .groupBy(inventoryStatuses.code, inventoryStatuses.name);
  }

  async pipelineSummary(actor: AuthContext) {
    return this.db
      .select({
        stageCode: pipelineStages.code,
        stageName: pipelineStages.name,
        sortOrder: pipelineStages.sortOrder,
        count: sql<number>`count(${opportunities.id})::int`,
        totalValue: sql<string>`coalesce(sum(${opportunities.estimatedValue}), 0)::text`,
      })
      .from(pipelineStages)
      .leftJoin(
        opportunities,
        and(eq(opportunities.currentStageId, pipelineStages.id), eq(opportunities.tenantId, actor.tenantId), isNull(opportunities.deletedAt))
      )
      .groupBy(pipelineStages.code, pipelineStages.name, pipelineStages.sortOrder)
      .orderBy(pipelineStages.sortOrder);
  }

  /**
   * Yıl sonu raporu: bir yılın fırsatlarını kazanılan/kaybedilen/açık olarak
   * sınıflandırır; ret nedenleri, rakipler, kazanma nedenleri, aylık trend,
   * kullanıcı bazlı kırılım ve teklif özetini döndürür.
   */
  async yearEndReport(actor: AuthContext, year: number) {
    const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    const tenant = eq(opportunities.tenantId, actor.tenantId);
    const inYear = and(tenant, isNull(opportunities.deletedAt), gte(opportunities.createdAt, from), lte(opportunities.createdAt, to));

    // Kazanılan = sözleşme ve sonrası aşamalar; Kaybedilen = cancelled.
    const isWon = sql`${pipelineStages.code} in ('contract','commercial_invoice','customs_approved','stock_picking','shipping','installation','delivered')`;
    const isLost = sql`${pipelineStages.code} = 'cancelled'`;
    const isOpen = sql`(${pipelineStages.code} is null or ${pipelineStages.code} not in ('contract','commercial_invoice','customs_approved','stock_picking','shipping','installation','delivered','cancelled'))`;
    const val = opportunities.estimatedValue;

    const [summary] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        won: sql<number>`count(*) filter (where ${isWon})::int`,
        lost: sql<number>`count(*) filter (where ${isLost})::int`,
        open: sql<number>`count(*) filter (where ${isOpen})::int`,
        wonValue: sql<string>`coalesce(sum(${val}) filter (where ${isWon}), 0)::text`,
        lostValue: sql<string>`coalesce(sum(${val}) filter (where ${isLost}), 0)::text`,
        openValue: sql<string>`coalesce(sum(${val}) filter (where ${isOpen}), 0)::text`,
      })
      .from(opportunities)
      .leftJoin(pipelineStages, eq(opportunities.currentStageId, pipelineStages.id))
      .where(inYear);

    const lostReasons = await this.db
      .select({
        code: cancellationReasons.code,
        name: cancellationReasons.name,
        count: sql<number>`count(*)::int`,
        value: sql<string>`coalesce(sum(${val}), 0)::text`,
      })
      .from(opportunities)
      .leftJoin(pipelineStages, eq(opportunities.currentStageId, pipelineStages.id))
      .leftJoin(cancellationReasons, eq(opportunities.lostReasonId, cancellationReasons.id))
      .where(and(inYear, isLost))
      .groupBy(cancellationReasons.code, cancellationReasons.name)
      .orderBy(desc(sql`count(*)`));

    const competitorBreakdown = await this.db
      .select({
        id: competitors.id,
        name: competitors.name,
        count: sql<number>`count(*)::int`,
        value: sql<string>`coalesce(sum(${val}), 0)::text`,
      })
      .from(opportunities)
      .leftJoin(pipelineStages, eq(opportunities.currentStageId, pipelineStages.id))
      .innerJoin(competitors, eq(opportunities.lostCompetitorId, competitors.id))
      .where(and(inYear, isLost))
      .groupBy(competitors.id, competitors.name)
      .orderBy(desc(sql`count(*)`));

    const wonReasons = await this.db
      .select({
        reason: opportunities.wonReason,
        count: sql<number>`count(*)::int`,
        value: sql<string>`coalesce(sum(${val}), 0)::text`,
      })
      .from(opportunities)
      .leftJoin(pipelineStages, eq(opportunities.currentStageId, pipelineStages.id))
      .where(and(inYear, isWon, sql`${opportunities.wonReason} is not null`))
      .groupBy(opportunities.wonReason)
      .orderBy(desc(sql`count(*)`));

    const monthBucket = sql<string>`to_char(date_trunc('month', ${opportunities.createdAt}), 'YYYY-MM')`;
    const monthly = await this.db
      .select({
        month: monthBucket,
        won: sql<number>`count(*) filter (where ${isWon})::int`,
        lost: sql<number>`count(*) filter (where ${isLost})::int`,
        wonValue: sql<string>`coalesce(sum(${val}) filter (where ${isWon}), 0)::text`,
        lostValue: sql<string>`coalesce(sum(${val}) filter (where ${isLost}), 0)::text`,
      })
      .from(opportunities)
      .leftJoin(pipelineStages, eq(opportunities.currentStageId, pipelineStages.id))
      .where(inYear)
      .groupBy(monthBucket)
      .orderBy(monthBucket);

    const byUser = await this.db
      .select({
        userId: users.id,
        name: users.fullName,
        won: sql<number>`count(*) filter (where ${isWon})::int`,
        lost: sql<number>`count(*) filter (where ${isLost})::int`,
        total: sql<number>`count(*)::int`,
        wonValue: sql<string>`coalesce(sum(${val}) filter (where ${isWon}), 0)::text`,
      })
      .from(opportunities)
      .leftJoin(pipelineStages, eq(opportunities.currentStageId, pipelineStages.id))
      .leftJoin(users, eq(opportunities.ownerUserId, users.id))
      .where(inYear)
      .groupBy(users.id, users.fullName)
      .orderBy(desc(sql`count(*) filter (where ${isWon})`));

    const [quotesSummary] = await this.db
      .select({
        count: sql<number>`count(distinct ${quotes.id})::int`,
        value: sql<string>`coalesce(sum(${quoteItems.lineTotal}), 0)::text`,
      })
      .from(quotes)
      .leftJoin(quoteItems, eq(quoteItems.quoteId, quotes.id))
      .where(and(eq(quotes.tenantId, actor.tenantId), isNull(quotes.deletedAt), gte(quotes.quoteDate, from), lte(quotes.quoteDate, to)));

    // Fiyat ortalamaları: teklif durumuna (onaylanan/reddedilen/...) göre adet,
    // toplam ve ORTALAMA teklif tutarı. Karlılık için "yıl içinde reddedilen"
    // tekliflerin ortalama büyüklüğünü görmeyi sağlar.
    const quotesByStatus = await this.db
      .select({
        code: quoteStatuses.code,
        name: quoteStatuses.name,
        count: sql<number>`count(*)::int`,
        totalValue: sql<string>`coalesce(sum(${quotes.grandTotal}), 0)::text`,
        avgValue: sql<string>`coalesce(round(avg(${quotes.grandTotal}), 2), 0)::text`,
      })
      .from(quotes)
      .leftJoin(quoteStatuses, eq(quotes.statusId, quoteStatuses.id))
      .where(and(eq(quotes.tenantId, actor.tenantId), isNull(quotes.deletedAt), gte(quotes.quoteDate, from), lte(quotes.quoteDate, to)))
      .groupBy(quoteStatuses.code, quoteStatuses.name)
      .orderBy(desc(sql`count(*)`));

    const wonCount = summary?.won ?? 0;
    const lostCount = summary?.lost ?? 0;
    const decided = wonCount + lostCount;
    const winRate = decided > 0 ? Math.round((wonCount / decided) * 100) : 0;
    const lossRate = decided > 0 ? 100 - winRate : 0;

    // Ortalama anlaşma değerleri (fırsat bazlı) ve ortalama teklif değeri.
    const avg = (total: string | undefined, n: number) => (n > 0 ? (Number(total ?? '0') / n).toFixed(2) : '0');
    const quoteCount = quotesSummary?.count ?? 0;
    const priceAverages = {
      avgWonValue: avg(summary?.wonValue, wonCount),
      avgLostValue: avg(summary?.lostValue, lostCount),
      avgQuoteValue: avg(quotesSummary?.value, quoteCount),
    };

    return {
      year,
      summary: { ...summary, winRate, lossRate, ...priceAverages },
      lostReasons,
      competitors: competitorBreakdown,
      wonReasons,
      monthly,
      byUser,
      quotes: quotesSummary,
      quotesByStatus,
    };
  }

  async warrantyExpiring(actor: AuthContext, days: number) {
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return this.db
      .select()
      .from(customerDevices)
      .where(
        and(
          eq(customerDevices.tenantId, actor.tenantId),
          isNull(customerDevices.deletedAt),
          lte(customerDevices.warrantyEndDate, cutoff)
        )
      )
      .orderBy(customerDevices.warrantyEndDate);
  }
}
