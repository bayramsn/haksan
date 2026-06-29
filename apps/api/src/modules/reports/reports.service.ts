import { Inject, Injectable } from '@nestjs/common';
import { and, between, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { visits as visitsTbl, calls as callsTbl } from '../../db/schema/crm';
import { opportunities, cancellationReasons, competitors } from '../../db/schema/crm';
import { users, userDivisions, userTargets, departmentTargets } from '../../db/schema/users';
import { departments } from '../../db/schema/tenants';
import { quotes, quoteItems } from '../../db/schema/quotes';
import { productModels, brands } from '../../db/schema/products';
import { receivables, payments } from '../../db/schema/finance';
import { inventoryItems, customerDevices } from '../../db/schema/inventory';
import { serviceComplaintIntakes } from '../../db/schema/service';
import { pipelineStages, inventoryStatuses, paymentStatuses, warrantyStatuses, quoteStatuses } from '../../db/schema/lookup';
import { companies } from '../../db/schema/companies';
import { DB } from '../../shared/database/database.module';
import type { AuthContext } from '../../shared/security/auth.types';
import { divisionFilter, resolveActorDivisionScope } from '../../shared/utils/division-scope';

export type Granularity = 'weekly' | 'monthly' | 'yearly';

@Injectable()
export class ReportsService {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  private activeDivisionFilter(actor: AuthContext, column: any) {
    return divisionFilter(resolveActorDivisionScope(actor), column) ?? sql`true`;
  }

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
    const filters = [
      eq(visitsTbl.tenantId, actor.tenantId),
      isNull(visitsTbl.deletedAt),
      this.activeDivisionFilter(actor, visitsTbl.divisionId),
    ];
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
    const filters = [eq(quotes.tenantId, actor.tenantId), isNull(quotes.deletedAt), this.activeDivisionFilter(actor, quotes.divisionId)];
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
      .where(
        and(
          eq(receivables.tenantId, actor.tenantId),
          isNull(receivables.deletedAt),
          this.activeDivisionFilter(actor, receivables.divisionId),
          pending ? eq(receivables.statusId, pending.id) : sql`true`
        )
      );
    return rows;
  }

  async completedPayments(actor: AuthContext, range: { from?: Date; to?: Date }) {
    const filters = [eq(payments.tenantId, actor.tenantId), isNull(payments.deletedAt), this.activeDivisionFilter(actor, payments.divisionId)];
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
      .where(
        and(
          eq(inventoryItems.tenantId, actor.tenantId),
          isNull(inventoryItems.deletedAt),
          this.activeDivisionFilter(actor, inventoryItems.divisionId)
        )
      )
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
        and(
          eq(opportunities.currentStageId, pipelineStages.id),
          eq(opportunities.tenantId, actor.tenantId),
          isNull(opportunities.deletedAt),
          // Mantıksal kapanış: kapatılan (arşivlenen) fırsatlar aktif pano sayımından düşer.
          isNull(opportunities.closedAt),
          this.activeDivisionFilter(actor, opportunities.divisionId)
        )
      )
      .groupBy(pipelineStages.code, pipelineStages.name, pipelineStages.sortOrder)
      .orderBy(pipelineStages.sortOrder);
  }

  async serviceComplaintsSummary(actor: AuthContext) {
    const filters = [
      eq(serviceComplaintIntakes.tenantId, actor.tenantId),
      isNull(serviceComplaintIntakes.deletedAt),
      this.activeDivisionFilter(actor, serviceComplaintIntakes.divisionId),
    ];
    const where = and(...filters);
    const [totals] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        new: sql<number>`count(*) filter (where ${serviceComplaintIntakes.status} = 'new')::int`,
        reviewing: sql<number>`count(*) filter (where ${serviceComplaintIntakes.status} = 'reviewing')::int`,
        converted: sql<number>`count(*) filter (where ${serviceComplaintIntakes.status} = 'converted')::int`,
        rejected: sql<number>`count(*) filter (where ${serviceComplaintIntakes.status} = 'rejected')::int`,
        warrantyClaim: sql<number>`count(*) filter (where ${serviceComplaintIntakes.ticketType} = 'warranty_claim')::int`,
      })
      .from(serviceComplaintIntakes)
      .where(where);
    const bySource = await this.db
      .select({ source: serviceComplaintIntakes.source, count: sql<number>`count(*)::int` })
      .from(serviceComplaintIntakes)
      .where(where)
      .groupBy(serviceComplaintIntakes.source)
      .orderBy(serviceComplaintIntakes.source);
    const bySeverity = await this.db
      .select({ severity: serviceComplaintIntakes.severity, count: sql<number>`count(*)::int` })
      .from(serviceComplaintIntakes)
      .where(where)
      .groupBy(serviceComplaintIntakes.severity)
      .orderBy(serviceComplaintIntakes.severity);
    return {
      total: totals?.total ?? 0,
      new: totals?.new ?? 0,
      reviewing: totals?.reviewing ?? 0,
      converted: totals?.converted ?? 0,
      rejected: totals?.rejected ?? 0,
      warrantyClaim: totals?.warrantyClaim ?? 0,
      bySource,
      bySeverity,
    };
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
    const inYear = and(
      tenant,
      isNull(opportunities.deletedAt),
      gte(opportunities.createdAt, from),
      lte(opportunities.createdAt, to),
      this.activeDivisionFilter(actor, opportunities.divisionId)
    );

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
      .where(
        and(
          eq(quotes.tenantId, actor.tenantId),
          isNull(quotes.deletedAt),
          gte(quotes.quoteDate, from),
          lte(quotes.quoteDate, to),
          this.activeDivisionFilter(actor, quotes.divisionId)
        )
      );

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
      .where(
        and(
          eq(quotes.tenantId, actor.tenantId),
          isNull(quotes.deletedAt),
          gte(quotes.quoteDate, from),
          lte(quotes.quoteDate, to),
          this.activeDivisionFilter(actor, quotes.divisionId)
        )
      )
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
          this.activeDivisionFilter(actor, customerDevices.divisionId),
          lte(customerDevices.warrantyEndDate, cutoff)
        )
      )
      .orderBy(customerDevices.warrantyEndDate);
  }

  /**
   * Departman bazlı hedef vs gerçekleşen özet raporu.
   * Kullanıcı hedefleri departman içinde toplanır; satış gerçekleşmesi fırsat/teklif verisinden gelir.
   */
  async departmentPerformance(actor: AuthContext, period: string, departmentId?: string) {
    const [year, month] = period.split('-').map(Number);
    const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const deptFilters = [eq(departments.tenantId, actor.tenantId)];
    if (departmentId) deptFilters.push(eq(departments.id, departmentId));
    const depts = await this.db.query.departments.findMany({ where: and(...deptFilters) });

    const isWon = sql`${pipelineStages.code} in ('contract','commercial_invoice','customs_approved','stock_picking','shipping','installation','delivered')`;
    const val = opportunities.estimatedValue;
    const scope = resolveActorDivisionScope(actor);

    const rows = [];
    for (const dept of depts) {
      const members = await this.db.query.users.findMany({
        where: and(eq(users.tenantId, actor.tenantId), eq(users.departmentId, dept.id), isNull(users.deletedAt)),
      });
      let scopedMembers = members;
      let memberIds = scopedMembers.map((m) => m.id);
      if (scope.mode === 'list') {
        if (memberIds.length === 0 || scope.divisionIds.length === 0) {
          scopedMembers = [];
          memberIds = [];
        } else {
          const assignments = await this.db
            .select({ userId: userDivisions.userId })
            .from(userDivisions)
            .where(and(inArray(userDivisions.userId, memberIds), inArray(userDivisions.divisionId, scope.divisionIds)));
          const allowedUserIds = new Set(assignments.map((row) => row.userId));
          scopedMembers = scopedMembers.filter((member) => allowedUserIds.has(member.id));
          memberIds = scopedMembers.map((m) => m.id);
        }
      }

      const deptTarget = await this.db.query.departmentTargets.findFirst({
        where: and(
          eq(departmentTargets.tenantId, actor.tenantId),
          eq(departmentTargets.departmentId, dept.id),
          eq(departmentTargets.period, period),
          isNull(departmentTargets.deletedAt)
        ),
      });

      let userTargetSales = 0;
      let userTargetQuotes = 0;
      if (memberIds.length) {
        const utRows = await this.db.query.userTargets.findMany({
          where: and(
            eq(userTargets.tenantId, actor.tenantId),
            eq(userTargets.period, period),
            isNull(userTargets.deletedAt),
            inArray(userTargets.userId, memberIds)
          ),
        });
        for (const t of utRows) {
          userTargetSales += Number(t.salesAmount ?? 0);
          userTargetQuotes += t.quoteTarget ?? 0;
        }
      }

      let wonCount = 0;
      let wonValue = 0;
      let quoteCount = 0;
      let openOpportunities = 0;
      if (memberIds.length) {
        const [opp] = await this.db
          .select({
            won: sql<number>`count(*) filter (where ${isWon})::int`,
            wonValue: sql<string>`coalesce(sum(${val}) filter (where ${isWon}), 0)::text`,
            open: sql<number>`count(*) filter (where ${pipelineStages.code} is null or ${pipelineStages.code} not in ('contract','commercial_invoice','customs_approved','stock_picking','shipping','installation','delivered','cancelled'))::int`,
          })
          .from(opportunities)
          .leftJoin(pipelineStages, eq(opportunities.currentStageId, pipelineStages.id))
          .where(
            and(
              eq(opportunities.tenantId, actor.tenantId),
              isNull(opportunities.deletedAt),
              gte(opportunities.createdAt, from),
              lte(opportunities.createdAt, to),
              inArray(opportunities.ownerUserId, memberIds),
              this.activeDivisionFilter(actor, opportunities.divisionId)
            )
          );
        wonCount = opp?.won ?? 0;
        wonValue = Number(opp?.wonValue ?? 0);
        openOpportunities = opp?.open ?? 0;

        const [qc] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(quotes)
          .where(
            and(
              eq(quotes.tenantId, actor.tenantId),
              isNull(quotes.deletedAt),
              gte(quotes.quoteDate, from),
              lte(quotes.quoteDate, to),
              inArray(quotes.createdBy, memberIds),
              this.activeDivisionFilter(actor, quotes.divisionId)
            )
          );
        quoteCount = qc?.count ?? 0;
      }

      const deptSalesTarget = Number(deptTarget?.salesAmount ?? 0);
      const deptQuoteTarget = deptTarget?.quoteTarget ?? 0;

      rows.push({
        departmentId: dept.id,
        departmentCode: dept.code,
        departmentName: dept.name,
        memberCount: scopedMembers.length,
        targets: {
          departmentSalesAmount: deptSalesTarget,
          departmentQuoteTarget: deptQuoteTarget,
          aggregatedUserSalesAmount: userTargetSales,
          aggregatedUserQuoteTarget: userTargetQuotes,
        },
        actuals: {
          wonOpportunities: wonCount,
          wonValue,
          quotesCreated: quoteCount,
          openOpportunities,
        },
        attainment: {
          salesPct: deptSalesTarget > 0 ? Math.round((wonValue / deptSalesTarget) * 100) : null,
          quotePct: deptQuoteTarget > 0 ? Math.round((quoteCount / deptQuoteTarget) * 100) : null,
        },
      });
    }

    return { period, departments: rows };
  }
}
