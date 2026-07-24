import { Inject, Injectable } from '@nestjs/common';
import { and, between, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { visits as visitsTbl, calls as callsTbl, leads } from '../../db/schema/crm';
import { opportunities, cancellationReasons, competitors } from '../../db/schema/crm';
import { users, userDepartmentAssignments, userDivisions, userRoles, roles, userTargets, departmentTargets } from '../../db/schema/users';
import { departments } from '../../db/schema/tenants';
import { quotes, quoteItems } from '../../db/schema/quotes';
import { productModels, brands } from '../../db/schema/products';
import { receivables, payments, accountingInvoices } from '../../db/schema/finance';
import { inventoryItems, customerDevices } from '../../db/schema/inventory';
import { serviceComplaintIntakes, serviceTickets, installationJobs } from '../../db/schema/service';
import { salesOrders, purchaseOrders } from '../../db/schema/orders';
import { currencies, pipelineStages, inventoryStatuses, paymentStatuses, warrantyStatuses, quoteStatuses } from '../../db/schema/lookup';
import { companies } from '../../db/schema/companies';
import { DB } from '../../shared/database/database.module';
import type { AuthContext } from '../../shared/security/auth.types';
import { resourceDivisionFilter, resolveResourceDivisionScope } from '../../shared/utils/division-scope';
import { amountToUsd, FxService, type FxRates, type FxSnapshot } from '../fx/fx.service';

export type Granularity = 'weekly' | 'monthly' | 'yearly';

export type TargetProgressScope = { kind: 'user' | 'department' | 'role' | 'all-users'; id?: string };

/** Ölçülebilir hedef metrikleri; digitalConversionTarget/digitalBudget fiilîsi hesaplanamaz (manuel takip). */
const MEASURED_METRICS = [
  'salesAmount',
  'salesNewCustomers',
  'quoteTarget',
  'visitTarget',
  'callTarget',
  'serviceCompleted',
  'serviceAmount',
  'digitalLeadTarget',
  'paymentsInAmount',
  'purchaseInvoiceAmount',
  'purchaseOrderAmount',
  'purchaseOrderCount',
  'salesOrderAmount',
  'salesOrderCount',
  'installationCompleted',
] as const;
type MeasuredMetric = (typeof MEASURED_METRICS)[number];
const MANUAL_METRICS = ['digitalConversionTarget', 'digitalBudget'] as const;
type TargetMetricKey = MeasuredMetric | (typeof MANUAL_METRICS)[number];

type MetricProgress = { target: number | null; actual: number | null; pct: number | null };
type UserActuals = Record<MeasuredMetric, number>;
type TargetItemLike = {
  targetType?: string;
  category?: string;
  activity?: string;
  description?: string;
  unit?: string;
  target?: string | number | null;
  metricKey?: string | null;
  trackingMode?: 'automatic' | 'manual' | string | null;
};

const emptyActuals = (): UserActuals => ({
  salesAmount: 0,
  salesNewCustomers: 0,
  quoteTarget: 0,
  visitTarget: 0,
  callTarget: 0,
  serviceCompleted: 0,
  serviceAmount: 0,
  digitalLeadTarget: 0,
  paymentsInAmount: 0,
  purchaseInvoiceAmount: 0,
  purchaseOrderAmount: 0,
  purchaseOrderCount: 0,
  salesOrderAmount: 0,
  salesOrderCount: 0,
  installationCompleted: 0,
});

const expectedPeriodProgressPct = (period: string, now = new Date()) => {
  const currentPeriod = now.toISOString().slice(0, 7);
  if (period < currentPeriod) return 100;
  if (period > currentPeriod) return 0;
  const [year, month] = period.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(100, Math.max(0, Math.round((now.getUTCDate() / daysInMonth) * 100)));
};

const measuredMetricSet = new Set<string>(MEASURED_METRICS);
const manualMetricSet = new Set<string>(MANUAL_METRICS);
const allMetricKeys = [...MEASURED_METRICS, ...MANUAL_METRICS] as TargetMetricKey[];

@Injectable()
export class ReportsService {
  constructor(@Inject(DB) private readonly db: DbClient, private readonly fx: FxService) {}

  private activeDivisionFilter(actor: AuthContext, column: any) {
    return resourceDivisionFilter(actor, 'reports', column) ?? sql`true`;
  }

  private addUsdAmount(
    entry: UserActuals | null,
    key: MeasuredMetric,
    rawAmount: string | number | null | undefined,
    currencyCode: string | null | undefined,
    rates: FxRates,
    unsupportedCurrencies: Set<string>,
  ) {
    if (!entry) return;
    const code = (currencyCode || 'USD').trim().toUpperCase();
    const usd = amountToUsd(Number(rawAmount ?? 0), code, rates);
    if (usd == null) {
      unsupportedCurrencies.add(code || 'BİLİNMİYOR');
      return;
    }
    entry[key] += usd;
  }

  private currencyNormalization(snapshot: FxSnapshot, unsupportedCurrencies: Set<string>) {
    return {
      base: snapshot.base,
      rateDate: snapshot.date,
      source: snapshot.source,
      live: snapshot.live,
      unsupportedCurrencies: [...unsupportedCurrencies].sort(),
    };
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
    const scopedUsers = await this.scopedActiveUsers(actor);
    const departmentMemberships = await this.departmentMembershipMap(actor, scopedUsers);

    const rows = [];
    for (const dept of depts) {
      const scopedMembers = scopedUsers.filter((member) => departmentMemberships.get(member.id)?.has(dept.id));
      const memberIds = scopedMembers.map((member) => member.id);

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

  /** Aktif kullanıcılar; bölüm kapsamı 'list' modundaysa yalnızca o bölümlere atanmış olanlar. */
  private async scopedActiveUsers(actor: AuthContext) {
    const scope = resolveResourceDivisionScope(actor, 'reports');
    let rows = await this.db.query.users.findMany({
      where: and(eq(users.tenantId, actor.tenantId), isNull(users.deletedAt), eq(users.status, 'active')),
    });
    if (scope.mode === 'list') {
      if (scope.divisionIds.length === 0) return [];
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return [];
      const assignments = await this.db
        .select({ userId: userDivisions.userId })
        .from(userDivisions)
        .where(and(inArray(userDivisions.userId, ids), inArray(userDivisions.divisionId, scope.divisionIds)));
      const allowed = new Set(assignments.map((row) => row.userId));
      rows = rows.filter((row) => allowed.has(row.id));
    }
    return rows;
  }

  /** Ana departman ile çoklu/ikincil departman atamalarını tek üyelik haritasında birleştirir. */
  private async departmentMembershipMap(
    actor: AuthContext,
    userRows: Array<{ id: string; departmentId: string | null }>,
  ) {
    const map = new Map<string, Set<string>>();
    for (const user of userRows) {
      const ids = new Set<string>();
      if (user.departmentId) ids.add(user.departmentId);
      map.set(user.id, ids);
    }
    const userIds = userRows.map((user) => user.id);
    if (!userIds.length) return map;

    const assignments = await this.db
      .select({ userId: userDepartmentAssignments.userId, departmentId: userDepartmentAssignments.departmentId })
      .from(userDepartmentAssignments)
      .innerJoin(departments, eq(userDepartmentAssignments.departmentId, departments.id))
      .where(and(eq(departments.tenantId, actor.tenantId), inArray(userDepartmentAssignments.userId, userIds)));
    for (const assignment of assignments) {
      const ids = map.get(assignment.userId) ?? new Set<string>();
      ids.add(assignment.departmentId);
      map.set(assignment.userId, ids);
    }
    return map;
  }

  /** Kullanıcı başına dönem fiilîleri — tek seferde gruplu sorgularla. */
  private async userActuals(
    actor: AuthContext,
    userIds: string[],
    from: Date,
    to: Date,
    rates: FxRates,
    unsupportedCurrencies: Set<string>,
  ) {
    const map = new Map<string, UserActuals>();
    if (userIds.length === 0) return map;
    const get = (id: string | null) => {
      if (!id) return null;
      let entry = map.get(id);
      if (!entry) {
        entry = emptyActuals();
        map.set(id, entry);
      }
      return entry;
    };

    // Ciro: kesilen satış faturaları. Proje/fırsat sorumlusu varsa ona,
    // bağlantı yoksa faturayı oluşturan kullanıcıya yazılır.
    const invoiceResponsibleUserId = sql<string | null>`coalesce(${quotes.projectOwnerUserId}, ${opportunities.ownerUserId}, ${accountingInvoices.createdBy})`;
    const invoiceRows = await this.db
      .select({
        userId: invoiceResponsibleUserId,
        currencyCode: currencies.code,
        total: sql<string>`coalesce(sum(${accountingInvoices.grandTotal}), 0)::text`,
      })
      .from(accountingInvoices)
      .leftJoin(salesOrders, eq(accountingInvoices.salesOrderId, salesOrders.id))
      .leftJoin(quotes, eq(accountingInvoices.quoteId, quotes.id))
      .leftJoin(opportunities, sql`${opportunities.id} = coalesce(${salesOrders.opportunityId}, ${quotes.opportunityId})`)
      .leftJoin(currencies, eq(accountingInvoices.currencyId, currencies.id))
      .where(
        and(
          eq(accountingInvoices.tenantId, actor.tenantId),
          isNull(accountingInvoices.deletedAt),
          eq(accountingInvoices.type, 'sales'),
          gte(accountingInvoices.invoiceDate, from),
          lte(accountingInvoices.invoiceDate, to),
          inArray(invoiceResponsibleUserId, userIds),
          this.activeDivisionFilter(actor, accountingInvoices.divisionId)
        )
      )
      .groupBy(invoiceResponsibleUserId, currencies.code);
    for (const r of invoiceRows) {
      this.addUsdAmount(get(r.userId), 'salesAmount', r.total, r.currencyCode, rates, unsupportedCurrencies);
    }

    // Tahsilat: müşteriden gelen ödemeler
    const paymentRows = await this.db
      .select({
        userId: payments.createdBy,
        currencyCode: currencies.code,
        total: sql<string>`coalesce(sum(${payments.amount}), 0)::text`,
      })
      .from(payments)
      .leftJoin(currencies, eq(payments.currencyId, currencies.id))
      .where(
        and(
          eq(payments.tenantId, actor.tenantId),
          isNull(payments.deletedAt),
          eq(payments.direction, 'in'),
          gte(payments.paymentDate, from),
          lte(payments.paymentDate, to),
          inArray(payments.createdBy, userIds),
          this.activeDivisionFilter(actor, payments.divisionId)
        )
      )
      .groupBy(payments.createdBy, currencies.code);
    for (const r of paymentRows) {
      this.addUsdAmount(get(r.userId), 'paymentsInAmount', r.total, r.currencyCode, rates, unsupportedCurrencies);
    }

    // Alış faturası tutarı: finans/satınalma hedefleri için
    const purchaseInvoiceRows = await this.db
      .select({
        userId: accountingInvoices.createdBy,
        currencyCode: currencies.code,
        total: sql<string>`coalesce(sum(${accountingInvoices.grandTotal}), 0)::text`,
      })
      .from(accountingInvoices)
      .leftJoin(currencies, eq(accountingInvoices.currencyId, currencies.id))
      .where(
        and(
          eq(accountingInvoices.tenantId, actor.tenantId),
          isNull(accountingInvoices.deletedAt),
          eq(accountingInvoices.type, 'purchase'),
          gte(accountingInvoices.invoiceDate, from),
          lte(accountingInvoices.invoiceDate, to),
          inArray(accountingInvoices.createdBy, userIds),
          this.activeDivisionFilter(actor, accountingInvoices.divisionId)
        )
      )
      .groupBy(accountingInvoices.createdBy, currencies.code);
    for (const r of purchaseInvoiceRows) {
      this.addUsdAmount(get(r.userId), 'purchaseInvoiceAmount', r.total, r.currencyCode, rates, unsupportedCurrencies);
    }

    // Yeni müşteri: kullanıcının oluşturduğu firmalar
    const companyRows = await this.db
      .select({ userId: companies.createdBy, count: sql<number>`count(*)::int` })
      .from(companies)
      .where(
        and(
          eq(companies.tenantId, actor.tenantId),
          isNull(companies.deletedAt),
          gte(companies.createdAt, from),
          lte(companies.createdAt, to),
          inArray(companies.createdBy, userIds)
        )
      )
      .groupBy(companies.createdBy);
    for (const r of companyRows) {
      const entry = get(r.userId);
      if (entry) entry.salesNewCustomers = r.count;
    }

    // Teklif sayısı (departman performans raporuyla aynı semantik)
    const quoteResponsibleUserId = sql<string | null>`coalesce(${quotes.projectOwnerUserId}, ${opportunities.ownerUserId}, ${quotes.createdBy})`;
    const quoteRows = await this.db
      .select({ userId: quoteResponsibleUserId, count: sql<number>`count(*)::int` })
      .from(quotes)
      .leftJoin(opportunities, eq(quotes.opportunityId, opportunities.id))
      .where(
        and(
          eq(quotes.tenantId, actor.tenantId),
          isNull(quotes.deletedAt),
          gte(quotes.quoteDate, from),
          lte(quotes.quoteDate, to),
          inArray(quoteResponsibleUserId, userIds),
          this.activeDivisionFilter(actor, quotes.divisionId)
        )
      )
      .groupBy(quoteResponsibleUserId);
    for (const r of quoteRows) {
      const entry = get(r.userId);
      if (entry) entry.quoteTarget = r.count;
    }

    // Satış siparişleri: operasyon/satış siparişleşme hedefleri
    const salesOrderResponsibleUserId = sql<string | null>`coalesce(${opportunities.ownerUserId}, ${salesOrders.createdBy})`;
    const salesOrderRows = await this.db
      .select({
        userId: salesOrderResponsibleUserId,
        currencyCode: currencies.code,
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${salesOrders.grandTotal}), 0)::text`,
      })
      .from(salesOrders)
      .leftJoin(opportunities, eq(salesOrders.opportunityId, opportunities.id))
      .leftJoin(currencies, eq(salesOrders.currencyId, currencies.id))
      .where(
        and(
          eq(salesOrders.tenantId, actor.tenantId),
          isNull(salesOrders.deletedAt),
          gte(salesOrders.orderDate, from),
          lte(salesOrders.orderDate, to),
          inArray(salesOrderResponsibleUserId, userIds),
          this.activeDivisionFilter(actor, salesOrders.divisionId)
        )
      )
      .groupBy(salesOrderResponsibleUserId, currencies.code);
    for (const r of salesOrderRows) {
      const entry = get(r.userId);
      if (entry) {
        entry.salesOrderCount += r.count;
        this.addUsdAmount(entry, 'salesOrderAmount', r.total, r.currencyCode, rates, unsupportedCurrencies);
      }
    }

    // Satınalma siparişleri
    const purchaseOrderRows = await this.db
      .select({
        userId: purchaseOrders.createdBy,
        currencyCode: currencies.code,
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${purchaseOrders.grandTotal}), 0)::text`,
      })
      .from(purchaseOrders)
      .leftJoin(currencies, eq(purchaseOrders.currencyId, currencies.id))
      .where(
        and(
          eq(purchaseOrders.tenantId, actor.tenantId),
          isNull(purchaseOrders.deletedAt),
          gte(purchaseOrders.orderDate, from),
          lte(purchaseOrders.orderDate, to),
          inArray(purchaseOrders.createdBy, userIds),
          this.activeDivisionFilter(actor, purchaseOrders.divisionId)
        )
      )
      .groupBy(purchaseOrders.createdBy, currencies.code);
    for (const r of purchaseOrderRows) {
      const entry = get(r.userId);
      if (entry) {
        entry.purchaseOrderCount += r.count;
        this.addUsdAmount(entry, 'purchaseOrderAmount', r.total, r.currencyCode, rates, unsupportedCurrencies);
      }
    }

    // Ziyaret
    const visitRows = await this.db
      .select({ userId: visitsTbl.createdBy, count: sql<number>`count(*)::int` })
      .from(visitsTbl)
      .where(
        and(
          eq(visitsTbl.tenantId, actor.tenantId),
          isNull(visitsTbl.deletedAt),
          gte(visitsTbl.visitDate, from),
          lte(visitsTbl.visitDate, to),
          inArray(visitsTbl.createdBy, userIds),
          this.activeDivisionFilter(actor, visitsTbl.divisionId)
        )
      )
      .groupBy(visitsTbl.createdBy);
    for (const r of visitRows) {
      const entry = get(r.userId);
      if (entry) entry.visitTarget = r.count;
    }

    // Arama
    const callRows = await this.db
      .select({ userId: callsTbl.createdBy, count: sql<number>`count(*)::int` })
      .from(callsTbl)
      .where(
        and(
          eq(callsTbl.tenantId, actor.tenantId),
          isNull(callsTbl.deletedAt),
          gte(callsTbl.callDate, from),
          lte(callsTbl.callDate, to),
          inArray(callsTbl.createdBy, userIds),
          this.activeDivisionFilter(actor, callsTbl.divisionId)
        )
      )
      .groupBy(callsTbl.createdBy);
    for (const r of callRows) {
      const entry = get(r.userId);
      if (entry) entry.callTarget = r.count;
    }

    // Tamamlanan servis: çözülen servis kayıtları (atanan teknisyene sayılır)
    const ticketRows = await this.db
      .select({ userId: serviceTickets.assignedToUserId, count: sql<number>`count(*)::int` })
      .from(serviceTickets)
      .where(
        and(
          eq(serviceTickets.tenantId, actor.tenantId),
          isNull(serviceTickets.deletedAt),
          gte(serviceTickets.resolvedAt, from),
          lte(serviceTickets.resolvedAt, to),
          inArray(serviceTickets.assignedToUserId, userIds),
          this.activeDivisionFilter(actor, serviceTickets.divisionId)
        )
      )
      .groupBy(serviceTickets.assignedToUserId);
    for (const r of ticketRows) {
      const entry = get(r.userId);
      if (entry) entry.serviceCompleted = r.count;
    }

    // Servis cirosu ve kurulum sayısı: tamamlanan kurulum işleri
    const installRows = await this.db
      .select({
        userId: installationJobs.assignedToUserId,
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${installationJobs.feeAmount}), 0)::text`,
      })
      .from(installationJobs)
      .where(
        and(
          eq(installationJobs.tenantId, actor.tenantId),
          isNull(installationJobs.deletedAt),
          gte(installationJobs.completedAt, from),
          lte(installationJobs.completedAt, to),
          inArray(installationJobs.assignedToUserId, userIds),
          this.activeDivisionFilter(actor, installationJobs.divisionId)
        )
      )
      .groupBy(installationJobs.assignedToUserId);
    for (const r of installRows) {
      const entry = get(r.userId);
      if (entry) {
        entry.serviceAmount = Number(r.total ?? 0);
        entry.installationCompleted = r.count;
      }
    }

    // Dijital lead
    const leadRows = await this.db
      .select({ userId: leads.ownerUserId, count: sql<number>`count(*)::int` })
      .from(leads)
      .where(
        and(
          eq(leads.tenantId, actor.tenantId),
          isNull(leads.deletedAt),
          gte(leads.createdAt, from),
          lte(leads.createdAt, to),
          inArray(leads.ownerUserId, userIds),
          this.activeDivisionFilter(actor, leads.divisionId)
        )
      )
      .groupBy(leads.ownerUserId);
    for (const r of leadRows) {
      const entry = get(r.userId);
      if (entry) entry.digitalLeadTarget = r.count;
    }

    return map;
  }

  private targetNumbers(row: typeof userTargets.$inferSelect | typeof departmentTargets.$inferSelect | null | undefined) {
    if (!row) return null;
    const values = Object.fromEntries(allMetricKeys.map((key) => [key, null])) as Record<TargetMetricKey, number | null>;
    return {
      ...values,
      salesAmount: row.salesAmount == null ? null : Number(row.salesAmount),
      salesNewCustomers: row.salesNewCustomers ?? null,
      quoteTarget: row.quoteTarget ?? null,
      visitTarget: row.visitTarget ?? null,
      callTarget: row.callTarget ?? null,
      serviceCompleted: row.serviceCompleted ?? null,
      serviceAmount: row.serviceAmount == null ? null : Number(row.serviceAmount),
      digitalLeadTarget: row.digitalLeadTarget ?? null,
      digitalConversionTarget: row.digitalConversionTarget ?? null,
      digitalBudget: row.digitalBudget == null ? null : Number(row.digitalBudget),
    } as Record<TargetMetricKey, number | null>;
  }

  private buildMetrics(targets: Record<TargetMetricKey, number | null> | null, actuals: UserActuals | null) {
    const metrics: Record<string, MetricProgress> = {};
    for (const key of MEASURED_METRICS) {
      const target = targets?.[key] ?? null;
      const actual = actuals ? actuals[key] : null;
      metrics[key] = {
        target,
        actual,
        pct: target != null && target > 0 && actual != null ? Math.round((actual / target) * 100) : null,
      };
    }
    for (const key of MANUAL_METRICS) {
      metrics[key] = { target: targets?.[key] ?? null, actual: null, pct: null };
    }
    return metrics;
  }

  private sumActuals(items: (UserActuals | undefined)[]) {
    const total = emptyActuals();
    for (const item of items) {
      if (!item) continue;
      for (const key of MEASURED_METRICS) total[key] += item[key];
    }
    return total;
  }

  private parseTargetItemNumber(value: unknown) {
    if (value === null || value === undefined) return null;
    const compact = String(value).trim().replace(/\s/g, '');
    if (!compact) return null;
    const turkishThousands = /^\d{1,3}(\.\d{3})+(,\d+)?$/;
    const plainNumber = /^\d+([.,]\d+)?$/;
    if (!turkishThousands.test(compact) && !plainNumber.test(compact)) return null;
    const normalized = turkishThousands.test(compact) ? compact.replace(/\./g, '').replace(',', '.') : compact.replace(',', '.');
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private targetItemMetricKey(item: TargetItemLike): TargetMetricKey | null {
    if (item.trackingMode === 'manual') return null;
    if (item.metricKey && (measuredMetricSet.has(item.metricKey) || manualMetricSet.has(item.metricKey))) {
      return item.metricKey as TargetMetricKey;
    }

    const text = `${item.targetType ?? ''} ${item.category ?? ''} ${item.activity ?? ''}`.toLocaleUpperCase('tr-TR');
    if (text.includes('TAHSİLAT')) return 'paymentsInAmount';
    if (text.includes('SATIŞ SİPARİŞ') || text.includes('SİPARİŞLEŞ')) return 'salesOrderCount';
    if (text.includes('SATIŞ HEDEF')) return 'salesOrderCount';
    if (text.includes('SATIŞ') && item.unit === 'amount') return 'salesAmount';
    if (text.includes('ALIŞ FATURA')) return 'purchaseInvoiceAmount';
    if (text.includes('SATINALMA') || text.includes('SATIN ALMA') || text.includes('TEDARİK')) {
      return item.unit === 'amount' ? 'purchaseOrderAmount' : 'purchaseOrderCount';
    }
    if (text.includes('KURULUM')) return 'installationCompleted';
    if (text.includes('SERVİS') || text.includes('BAKIM')) return item.unit === 'amount' ? 'serviceAmount' : 'serviceCompleted';
    if (text.includes('TEKLİF')) return 'quoteTarget';
    if (text.includes('ZİYARET')) return 'visitTarget';
    if (text.includes('ARAMA')) return 'callTarget';
    if (text.includes('YENİ MÜŞTERİ')) return 'salesNewCustomers';
    if (text.includes('DİJİTAL') || text.includes('LEAD')) return 'digitalLeadTarget';
    return null;
  }

  private buildTargetItems(items: unknown, actuals: UserActuals | null) {
    const rows = Array.isArray(items) ? (items as TargetItemLike[]) : [];
    return rows.map((item) => {
      const metricKey = this.targetItemMetricKey(item);
      const measured = metricKey && measuredMetricSet.has(metricKey);
      const target = this.parseTargetItemNumber(item.target);
      const actual = measured && actuals ? actuals[metricKey as MeasuredMetric] : null;
      return {
        ...item,
        metricKey,
        trackingMode: item.trackingMode === 'manual' || !metricKey || manualMetricSet.has(metricKey) ? 'manual' : 'automatic',
        actual,
        pct: target != null && target > 0 && actual != null ? Math.round((actual / target) * 100) : null,
      };
    });
  }

  private sumTargetItems(rows: (typeof userTargets.$inferSelect | typeof departmentTargets.$inferSelect)[], actuals: UserActuals | null) {
    const grouped = new Map<
      string,
      TargetItemLike & { numericTarget: number | null; fallbackTarget: string }
    >();
    for (const row of rows) {
      const items = Array.isArray(row.targetItems) ? (row.targetItems as TargetItemLike[]) : [];
      for (const item of items) {
        if (!item?.targetType || !item.category || !item.activity) continue;
        const metricKey = this.targetItemMetricKey(item);
        const key = `${item.targetType}:${item.category}:${item.activity}:${metricKey ?? ''}`;
        const existing =
          grouped.get(key) ??
          ({
            ...item,
            metricKey,
            numericTarget: null,
            fallbackTarget: item.target === null || item.target === undefined ? '' : String(item.target),
          } as TargetItemLike & { numericTarget: number | null; fallbackTarget: string });
        const numeric = this.parseTargetItemNumber(item.target);
        if (numeric !== null) existing.numericTarget = (existing.numericTarget ?? 0) + numeric;
        grouped.set(key, existing);
      }
    }
    const items = [...grouped.values()].map(({ numericTarget, fallbackTarget, ...item }) => ({
      ...item,
      target: numericTarget === null ? fallbackTarget : String(numericTarget),
    }));
    return this.buildTargetItems(items, actuals);
  }

  /**
   * Hedef-fiilî ilerlemesi. Ciro = kesilen satış faturaları; servis = çözülen kayıtlar +
   * tamamlanan kurulum ücretleri. Rol hedefleri fan-out ile user_targets'a yazıldığından
   * rol kapsamı üyelerin kişisel hedef/fiilî toplamıdır.
   */
  async targetProgress(actor: AuthContext, period: string, scope: TargetProgressScope) {
    const [year, month] = period.split('-').map(Number);
    const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const expectedProgressPct = expectedPeriodProgressPct(period);

    const unsupportedCurrencies = new Set<string>();
    const [allUsers, fxSnapshot] = await Promise.all([
      this.scopedActiveUsers(actor),
      this.fx.ratesForPeriod(period),
    ]);
    const departmentMemberships = await this.departmentMembershipMap(actor, allUsers);
    const userById = new Map(allUsers.map((u) => [u.id, u]));

    if (scope.kind === 'user' || scope.kind === 'all-users') {
      const subjectsUsers =
        scope.kind === 'user' ? allUsers.filter((u) => u.id === scope.id) : allUsers;
      const ids = subjectsUsers.map((u) => u.id);
      const [actualsMap, targetRows] = await Promise.all([
        this.userActuals(actor, ids, from, to, fxSnapshot.rates, unsupportedCurrencies),
        ids.length
          ? this.db.query.userTargets.findMany({
              where: and(
                eq(userTargets.tenantId, actor.tenantId),
                eq(userTargets.period, period),
                isNull(userTargets.deletedAt),
                inArray(userTargets.userId, ids)
              ),
            })
          : Promise.resolve([]),
      ]);
      const targetByUser = new Map(targetRows.map((t) => [t.userId, t]));
      const departmentIds = [
        ...new Set(subjectsUsers.flatMap((user) => [...(departmentMemberships.get(user.id) ?? [])])),
      ];
      const departmentRows = departmentIds.length
        ? await this.db.query.departments.findMany({
            where: and(eq(departments.tenantId, actor.tenantId), inArray(departments.id, departmentIds)),
          })
        : [];
      const departmentById = new Map(departmentRows.map((department) => [department.id, department]));
      const subjects = subjectsUsers.map((u) => {
        const targetRow = targetByUser.get(u.id) ?? null;
        const department = u.departmentId ? departmentById.get(u.departmentId) : null;
        const assignedDepartments = [...(departmentMemberships.get(u.id) ?? [])]
          .map((id) => departmentById.get(id))
          .filter((row): row is typeof departments.$inferSelect => Boolean(row));
        return {
          subject: {
            kind: 'user' as const,
            id: u.id,
            name: u.fullName,
            departmentId: department?.id ?? null,
            departmentName: department?.name ?? null,
            departmentIds: assignedDepartments.map((row) => row.id),
            departmentNames: assignedDepartments.map((row) => row.name),
          },
          hasTarget: Boolean(targetRow),
          note: targetRow?.note ?? null,
          targetItems: this.buildTargetItems(targetRow?.targetItems ?? [], actualsMap.get(u.id) ?? emptyActuals()),
          metrics: this.buildMetrics(this.targetNumbers(targetRow), actualsMap.get(u.id) ?? emptyActuals()),
        };
      });
      return {
        period,
        scope: scope.kind,
        expectedProgressPct,
        currencyNormalization: this.currencyNormalization(fxSnapshot, unsupportedCurrencies),
        subjects,
      };
    }

    if (scope.kind === 'department') {
      const deptFilters = [eq(departments.tenantId, actor.tenantId)];
      if (scope.id) deptFilters.push(eq(departments.id, scope.id));
      const depts = await this.db.query.departments.findMany({ where: and(...deptFilters) });
      const allMemberIds = allUsers.filter((u) => (departmentMemberships.get(u.id)?.size ?? 0) > 0).map((u) => u.id);
      const actualsMap = await this.userActuals(
        actor,
        allMemberIds,
        from,
        to,
        fxSnapshot.rates,
        unsupportedCurrencies,
      );
      const subjects = [];
      for (const dept of depts) {
        const members = allUsers.filter((u) => departmentMemberships.get(u.id)?.has(dept.id));
        const targetRow = await this.db.query.departmentTargets.findFirst({
          where: and(
            eq(departmentTargets.tenantId, actor.tenantId),
            eq(departmentTargets.departmentId, dept.id),
            eq(departmentTargets.period, period),
            isNull(departmentTargets.deletedAt)
          ),
        });
        const summed = this.sumActuals(members.map((m) => actualsMap.get(m.id)));
        subjects.push({
          subject: { kind: 'department' as const, id: dept.id, name: dept.name, memberCount: members.length },
          hasTarget: Boolean(targetRow),
          note: targetRow?.note ?? null,
          targetItems: this.buildTargetItems(targetRow?.targetItems ?? [], summed),
          metrics: this.buildMetrics(this.targetNumbers(targetRow), summed),
        });
      }
      return {
        period,
        scope: scope.kind,
        expectedProgressPct,
        currencyNormalization: this.currencyNormalization(fxSnapshot, unsupportedCurrencies),
        subjects,
      };
    }

    // scope.kind === 'role'
    const roleFilters = [eq(roles.tenantId, actor.tenantId)];
    if (scope.id) roleFilters.push(eq(roles.id, scope.id));
    const roleRows = await this.db.query.roles.findMany({ where: and(...roleFilters) });
    const roleIds = roleRows.map((r) => r.id);
    const memberships = roleIds.length
      ? await this.db
          .select({ roleId: userRoles.roleId, userId: userRoles.userId })
          .from(userRoles)
          .where(inArray(userRoles.roleId, roleIds))
      : [];
    const memberIdsByRole = new Map<string, string[]>();
    for (const m of memberships) {
      if (!userById.has(m.userId)) continue; // pasif/silinmiş veya kapsam dışı
      const list = memberIdsByRole.get(m.roleId) ?? [];
      list.push(m.userId);
      memberIdsByRole.set(m.roleId, list);
    }
    const allRoleMemberIds = [...new Set(memberships.map((m) => m.userId).filter((id) => userById.has(id)))];
    const [actualsMap, targetRows] = await Promise.all([
      this.userActuals(actor, allRoleMemberIds, from, to, fxSnapshot.rates, unsupportedCurrencies),
      allRoleMemberIds.length
        ? this.db.query.userTargets.findMany({
            where: and(
              eq(userTargets.tenantId, actor.tenantId),
              eq(userTargets.period, period),
              isNull(userTargets.deletedAt),
              inArray(userTargets.userId, allRoleMemberIds)
            ),
          })
        : Promise.resolve([]),
    ]);
    const targetByUser = new Map(targetRows.map((t) => [t.userId, t]));
    const subjects = roleRows.map((role) => {
      const memberIds = memberIdsByRole.get(role.id) ?? [];
      // Rol hedefi = üyelerin kişisel hedef toplamı (fan-out sonrası)
      const memberTargets = memberIds
        .map((id) => this.targetNumbers(targetByUser.get(id)))
        .filter((t): t is Record<TargetMetricKey, number | null> => t != null);
      const summedTargets = {} as Record<TargetMetricKey, number | null>;
      for (const key of [...MEASURED_METRICS, ...MANUAL_METRICS] as TargetMetricKey[]) {
        const vals = memberTargets.map((t) => t[key]).filter((v): v is number => v != null);
        summedTargets[key] = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
      }
      const summedActuals = this.sumActuals(memberIds.map((id) => actualsMap.get(id)));
      return {
        subject: { kind: 'role' as const, id: role.id, name: role.name, code: role.code, memberCount: memberIds.length },
        hasTarget: memberTargets.length > 0,
        note: null,
        targetItems: this.sumTargetItems(memberIds.map((id) => targetByUser.get(id)).filter((row): row is typeof userTargets.$inferSelect => Boolean(row)), summedActuals),
        metrics: this.buildMetrics(memberTargets.length ? summedTargets : null, summedActuals),
      };
    });
    return {
      period,
      scope: scope.kind,
      expectedProgressPct,
      currencyNormalization: this.currencyNormalization(fxSnapshot, unsupportedCurrencies),
      subjects,
    };
  }
}
