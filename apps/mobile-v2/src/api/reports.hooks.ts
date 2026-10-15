import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/src/api/client';
import { reports } from '@/src/api/endpoints';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { granularityRange, monthRange, type Granularity } from '@/src/ui/reports/reportMath';
import { activitiesFor, quotesFor, reportsApi, visitsFor, type OperationalParams } from './reports.api';

export const reportKeys = {
  all: ['reports'] as const,
  pipeline: ['reports', 'pipeline'] as const,
  complaints: ['reports', 'complaints-summary'] as const,
  stock: ['reports', 'stock-summary'] as const,
  warranty: (days: number) => ['reports', 'warranty-expiring', days] as const,
  operational: (params: OperationalParams) => ['reports', 'operational', params] as const,
  yearEnd: (year: number) => ['reports', 'year-end', year] as const,
  departmentPerformance: (period: string, departmentId?: string) => ['reports', 'department-performance', period, departmentId ?? null] as const,
  activities: (granularity: Granularity, period: string) => ['reports', 'activities', granularity, period] as const,
  visits: (granularity: Granularity, period: string) => ['reports', 'visits', granularity, period] as const,
  quotes: (granularity: Granularity, period: string) => ['reports', 'quotes-by-product', granularity, period] as const,
  targets: (period: string, scope: 'all-users' | 'department') => ['reports', 'target-progress', period, scope] as const,
  activityLog: (from: string, to: string) => ['reports', 'activity-log', from, to] as const,
  users: ['reports', 'users'] as const,
  departments: ['reports', 'departments'] as const,
};

/** 403/404 tekrar denenmez: yetki yoksa kart boş kalır, ekran düşmez. */
const noRetryOnClientError = (count: number, error: Error) =>
  !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2;

export function usePipelineSummary() {
  return useQuery({ queryKey: reportKeys.pipeline, queryFn: () => reports.pipelineSummary(), staleTime: 60_000 });
}

export function useComplaintsSummary() {
  return useQuery({ queryKey: reportKeys.complaints, queryFn: () => reportsApi.complaintsSummary(), staleTime: 60_000 });
}

export function useReportStockSummary() {
  return useQuery({ queryKey: reportKeys.stock, queryFn: () => reportsApi.stockSummary(), staleTime: 60_000 });
}

export function useWarrantyExpiring(days = 60) {
  return useQuery({ queryKey: reportKeys.warranty(days), queryFn: () => reportsApi.warrantyExpiring(days), staleTime: 5 * 60_000 });
}

export function useOperationalReport(params: OperationalParams) {
  return useQuery({ queryKey: reportKeys.operational(params), queryFn: () => reportsApi.operational(params), staleTime: 60_000 });
}

/** Kıyas yalnız aylıkta: aynı süzgeçle bir önceki yıl; düşerse rapor düşmesin. */
export function usePreviousOperationalReport(params: OperationalParams) {
  const previous = { ...params, year: params.year - 1 };
  return useQuery({
    queryKey: reportKeys.operational(previous),
    queryFn: () => reportsApi.operational(previous),
    enabled: params.period === 'monthly',
    staleTime: 5 * 60_000,
    retry: noRetryOnClientError,
  });
}

export function useYearEndReport(year: number) {
  return useQuery({ queryKey: reportKeys.yearEnd(year), queryFn: () => reportsApi.yearEnd(year), staleTime: 60_000 });
}

/** Sunucu yalnız tüm kullanıcıları görebilenlere açar; diğerlerinde 403 → kart gizlenir. */
export function useDepartmentPerformance(period: string, departmentId?: string) {
  return useQuery({
    queryKey: reportKeys.departmentPerformance(period, departmentId),
    queryFn: () => reportsApi.departmentPerformance({ period, departmentId }),
    staleTime: 60_000,
    retry: noRetryOnClientError,
  });
}

export function useActivityTrend(granularity: Granularity, period: string) {
  return useQuery({
    queryKey: reportKeys.activities(granularity, period),
    queryFn: () => activitiesFor(granularity, granularityRange(granularity, period)),
    staleTime: 60_000,
  });
}

export function useVisitTrend(granularity: Granularity, period: string) {
  return useQuery({
    queryKey: reportKeys.visits(granularity, period),
    queryFn: () => visitsFor(granularity, granularityRange(granularity, period)),
    staleTime: 60_000,
  });
}

/** Aylıkta yalnız seçili ay (web "Ürün Bazlı Teklif"), diğerlerinde granülerlik aralığı. */
export function useQuotesByProduct(granularity: Granularity, period: string) {
  return useQuery({
    queryKey: reportKeys.quotes(granularity, period),
    queryFn: () => quotesFor(granularity, granularity === 'monthly' ? monthRange(period) : granularityRange(granularity, period)),
    staleTime: 60_000,
  });
}

export function useTargetProgress(period: string, scope: 'all-users' | 'department') {
  return useQuery({
    queryKey: reportKeys.targets(period, scope),
    queryFn: () => reportsApi.targetProgress({ period, scope, ...(scope === 'all-users' ? { contributors: 'true' as const } : {}) }),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: noRetryOnClientError,
  });
}

export function usePreviousTargetProgress(period: string) {
  return useQuery({
    queryKey: ['reports', 'target-progress-previous', period] as const,
    queryFn: () => reportsApi.targetProgress({ period, scope: 'all-users' }),
    staleTime: 10 * 60_000,
    retry: noRetryOnClientError,
  });
}

/** Aktivite raporu yalnız "Raporu Getir" ile çekilir (web ile aynı); aralık yoksa istek yok. */
export function useActivityLog(range: { from: string; to: string } | null) {
  const canReadCompanies = useCan('companies.read');
  return useQuery({
    queryKey: reportKeys.activityLog(range?.from ?? '', range?.to ?? ''),
    queryFn: () => reportsApi.activityLog(range!),
    enabled: Boolean(range) && canReadCompanies,
    staleTime: 60_000,
    retry: noRetryOnClientError,
  });
}

/** Temsilci süzgeci: kullanıcı listesi `users.read` ister; yoksa süzgeç gizlenir. */
export function useReportUsers() {
  const canRead = useCan('users.read');
  return useQuery({
    queryKey: reportKeys.users,
    queryFn: () => reportsApi.users(),
    enabled: canRead,
    staleTime: 10 * 60_000,
    select: (rows) =>
      rows.filter((u) => u.status !== 'inactive' && u.status !== 'disabled').sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr')),
  });
}

export function useReportDepartments() {
  const canRead = useCan('departments.read');
  return useQuery({ queryKey: reportKeys.departments, queryFn: () => reportsApi.departments(), enabled: canRead, staleTime: 10 * 60_000 });
}

export function useIsSuperAdmin(): boolean {
  const { user } = useAuth();
  return Boolean(user?.roles?.includes('super_admin'));
}
