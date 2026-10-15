import type { ActivityLogReport } from '@haksan/shared';
import { request } from '@/src/api/client';
import { exportService } from '@/src/api/exports';
import { downloadAndShare } from '@/src/native/files';
import type { Granularity, TargetSubjectRow } from '@/src/ui/reports/reportMath';

/* Yanıt şekilleri apps/api/src/modules/reports/reports.service.ts ile aynı. */

export type DateRange = { from?: string; to?: string };

export type ActivityBucket = { bucket: string; count: number };

export type QuoteByProduct = {
  bucket: string;
  productId: string | null;
  productName: string | null;
  brand: string | null;
  currency: string | null;
  count: number;
  /** Para alanı sunucuda `::text`. */
  totalValue: string | null;
};

export type OperationalReportRow = {
  bucket: string;
  quotes: number;
  approved: number;
  rejected: number;
  won: number;
  lost: number;
  service: number;
  revenueUsd: number;
};

export type CurrencyNormalization = {
  base: 'USD';
  rateDate: string;
  source: 'live' | 'period_average' | 'last_known' | 'fallback';
  live: boolean;
  unsupportedCurrencies: string[];
};

export type OperationalReport = { rows: OperationalReportRow[]; currencyNormalization: CurrencyNormalization };

export type OperationalParams = {
  year: number;
  period: 'monthly' | 'yearly';
  ownerUserId?: string;
  departmentId?: string;
};

export type YearEndReport = {
  year: number;
  summary: {
    total: number;
    won: number;
    lost: number;
    cancelled: number;
    open: number;
    wonValue: string;
    lostValue: string;
    openValue: string;
    winRate: number;
    lossRate: number;
    avgWonValue: string;
    avgLostValue: string;
    avgQuoteValue: string;
  };
  lostReasons: { code: string; name: string; count: number; value: string }[];
  competitors: { id: string; name: string; count: number; value: string }[];
  wonReasons: { reason: string; count: number; value: string }[];
  monthly: { month: number; won: number; lost: number; wonValue: string; lostValue: string }[];
  byUser: { userId: string; name: string; won: number; lost: number; total: number; wonValue: string }[];
  quotes: { count: number; value: string };
  quotesByStatus: { code: string; name: string; count: number; totalValue: string; avgValue: string }[];
};

export type WarrantyExpiringDevice = {
  id: string;
  companyId: string | null;
  serialNumber: string | null;
  warrantyEndDate: string | null;
};

export type DepartmentPerformanceRow = {
  departmentId: string;
  departmentName: string;
  memberCount: number;
  targets: { departmentSalesAmount: number | null; departmentQuoteTarget: number | null };
  actuals: { wonValue: number; quotesCreated: number; wonOpportunities: number; openOpportunities: number };
  attainment: { salesPct: number | null; quotePct: number | null };
};

export type StockSummaryRow = { status: string | null; statusName: string | null; count: number };

export type ComplaintsSummary = {
  total: number;
  new: number;
  reviewing: number;
  converted: number;
  rejected: number;
  warrantyClaim: number;
  bySource: { source: string; count: number }[];
  bySeverity: { severity: string; count: number }[];
};

export type TargetProgressResponse = {
  subjects: TargetSubjectRow[];
  expectedProgressPct?: number | null;
  currencyNormalization?: CurrencyNormalization | null;
};

export type ReportUser = {
  id: string;
  fullName: string;
  status: string | null;
  departmentId: string | null;
  department: { id: string; code: string; name: string } | null;
};

export type ReportDepartment = { id: string; code: string | null; name: string };

export const reportsApi = {
  weeklyVisits: (query: DateRange) => request<ActivityBucket[]>('/reports/weekly-visits', { query }),
  monthlyVisits: (query: DateRange) => request<ActivityBucket[]>('/reports/monthly-visits', { query }),
  yearlyVisits: (query: DateRange) => request<ActivityBucket[]>('/reports/yearly-visits', { query }),
  weeklyActivities: (query: DateRange) => request<ActivityBucket[]>('/reports/weekly-activities', { query }),
  monthlyActivities: (query: DateRange) => request<ActivityBucket[]>('/reports/monthly-activities', { query }),
  yearlyActivities: (query: DateRange) => request<ActivityBucket[]>('/reports/yearly-activities', { query }),
  weeklyQuotes: (query: DateRange) => request<QuoteByProduct[]>('/reports/weekly-quotes-by-product', { query }),
  monthlyQuotes: (query: DateRange) => request<QuoteByProduct[]>('/reports/monthly-quotes-by-product', { query }),
  yearlyQuotes: (query: DateRange) => request<QuoteByProduct[]>('/reports/yearly-quotes-by-product', { query }),
  departmentPerformance: (query: { period: string; departmentId?: string }) =>
    request<{ departments: DepartmentPerformanceRow[] }>('/reports/department-performance', { query }),
  warrantyExpiring: (days = 60) => request<WarrantyExpiringDevice[]>('/reports/warranty-expiring', { query: { days } }),
  complaintsSummary: () => request<ComplaintsSummary>('/reports/service-complaints-summary'),
  stockSummary: () => request<StockSummaryRow[]>('/reports/stock-summary'),
  yearEnd: (year: number) => request<YearEndReport>('/reports/year-end', { query: { year } }),
  operational: (query: OperationalParams) => request<OperationalReport>('/reports/operational', { query }),
  targetProgress: (query: { period: string; scope?: 'all-users' | 'department'; id?: string; contributors?: 'true' }) =>
    request<TargetProgressResponse>('/reports/target-progress', { query }),
  activityLog: (query: { from: string; to: string }) => request<ActivityLogReport>('/reports/activity-log', { query }),
  users: () => request<ReportUser[]>('/users'),
  departments: () => request<ReportDepartment[]>('/departments'),
};

/** Granülerliğe göre aktivite ucu (haftalık/aylık/yıllık). */
export function activitiesFor(granularity: Granularity, range: DateRange) {
  if (granularity === 'weekly') return reportsApi.weeklyActivities(range);
  if (granularity === 'yearly') return reportsApi.yearlyActivities(range);
  return reportsApi.monthlyActivities(range);
}

/** Ziyaret uçları sunucuda aktivite sayımıyla aynı (deprecated); web gibi ayrı çağrılır. */
export function visitsFor(granularity: Granularity, range: DateRange) {
  if (granularity === 'weekly') return reportsApi.weeklyVisits(range);
  if (granularity === 'yearly') return reportsApi.yearlyVisits(range);
  return reportsApi.monthlyVisits(range);
}

export function quotesFor(granularity: Granularity, range: DateRange) {
  if (granularity === 'weekly') return reportsApi.weeklyQuotes(range);
  if (granularity === 'yearly') return reportsApi.yearlyQuotes(range);
  return reportsApi.monthlyQuotes(range);
}

/* ------------------------------------------------------- Excel çıktıları ---- */

export const reportExports = {
  operational: ({ year, period, ownerUserId, departmentId }: OperationalParams) =>
    exportService.operational(year, period, { ownerUserId, departmentId }),
  yearEnd: (year: number) => exportService.yearEnd(year),
  departmentPerformance: (period: string, departmentId?: string) => exportService.departmentPerformance(period, departmentId),
  pipelineSummary: () => exportService.pipelineSummary(),
  stockSummary: () => exportService.stockSummary(),
  deliveries: () => exportService.deliveries(),
  shipments: () => exportService.shipments(),
  serviceTickets: () => exportService.serviceTickets(),
  serviceComplaints: () => exportService.serviceComplaints(),
  targetProgress: (period: string) =>
    downloadAndShare('/reports/export/target-progress', `hedef-gerceklesme-${period}.xlsx`, { query: { period } }),
};
