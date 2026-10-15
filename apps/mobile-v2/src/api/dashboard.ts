import { useQuery } from '@tanstack/react-query';
import { companies, finance, inventory, reports } from './endpoints';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: ['dashboard', 'summary'] as const,
};

/** `null` = o uç nokta hata verdi; KPI kutusu "—" gösterir. */
export type DashboardData = {
  activeCustomers: number | null;
  totalCustomers: number | null;
  openOpportunities: number | null;
  overdueReceivables: {
    count: number;
    byCurrency: { currencyCode: string; amount: number }[];
  } | null;
  /** Tüm alacak kayıtları (departman performansı payda). */
  receivableTotal: number | null;
  openServices: number | null;
  serviceTotal: number | null;
  activeMachines: number | null;
  stages: { code: string; label: string; value: number }[];
};

/** Başarısız uç noktayı `null`a düşürür; biri patlayınca panel tamamen ölmesin. */
async function settle<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

/**
 * Sunucuda tek bir dashboard uç noktası yok; web tarafı da bunları ayrı ayrı
 * çekip birleştiriyor. Tek sorguya sarılı ki ekran kısmi yüklenmiş hâlde
 * titremesin — ama uçlar tek tek toleranslı: biri 500 verirse o KPI `null`
 * olur, diğerleri görünmeye devam eder.
 */
export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.summary,
    queryFn: async (): Promise<DashboardData> => {
      const [summary, pipeline, receivables, service, machines] = await Promise.all([
        settle(companies.summary()),
        settle(reports.pipelineSummary()),
        settle(finance.receivableSummary()),
        settle(reports.serviceSummary()),
        settle(inventory.customerDevices({ page: 1, pageSize: 1 })),
      ]);

      return {
        activeCustomers: summary?.byStatus.active ?? null,
        totalCustomers: summary?.total ?? null,
        openOpportunities: pipeline ? pipeline.reduce((acc, s) => acc + s.count, 0) : null,
        overdueReceivables: receivables
          ? {
              count: receivables.overdueCount,
              byCurrency: receivables.byCurrency
                .filter((row) => row.overdueAmount > 0)
                .map((row) => ({ currencyCode: row.currencyCode, amount: row.overdueAmount })),
            }
          : null,
        receivableTotal: receivables?.total ?? null,
        openServices: service ? service.new + service.reviewing : null,
        serviceTotal: service?.total ?? null,
        activeMachines: machines?.meta.total ?? null,
        stages: (pipeline ?? []).map((s) => ({ code: s.stageCode, label: s.stageName, value: s.count })),
      };
    },
  });
}
