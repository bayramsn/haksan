import { useQuery } from '@tanstack/react-query';
import { finance, service, type Installation, type Receivable2, type Shipment } from '@/src/api/endpoints';
import { logisticsApi, type Delivery } from '@/src/api/logistics.api';
import { collectPaginated } from '@/src/api/pagination';
import { loadLinkedOperations } from '@/src/features/opportunities/linked-operations';
import { receivableBelongsToOpportunity } from '@/src/features/opportunities/case-scope';

const PAGE = 50;

export const opportunityCaseKeys = {
  shipments: (opportunityId: string) => ['opportunities', 'linked-operations', opportunityId, 'shipments'] as const,
  installations: (opportunityId: string) => ['opportunities', 'linked-operations', opportunityId, 'installations'] as const,
  deliveries: (opportunityId: string) => ['opportunities', 'linked-operations', opportunityId, 'deliveries'] as const,
  receivables: (opportunityId: string, companyId?: string) =>
    ['finance', 'receivables', 'opportunity', opportunityId, companyId ?? null] as const,
};

/** Client-scopes global /shipments pages by opportunityId (API has no opportunity filter). */
export function useLinkedShipments(opportunityId: string, enabled = true) {
  return useQuery({
    queryKey: opportunityCaseKeys.shipments(opportunityId),
    enabled: enabled && Boolean(opportunityId),
    refetchOnMount: 'always',
    queryFn: () =>
      loadLinkedOperations<Shipment>(opportunityId, (page) => service.shipments({ page, pageSize: PAGE })),
  });
}

export function useLinkedInstallations(opportunityId: string, enabled = true) {
  return useQuery({
    queryKey: opportunityCaseKeys.installations(opportunityId),
    enabled: enabled && Boolean(opportunityId),
    refetchOnMount: 'always',
    queryFn: () =>
      loadLinkedOperations<Installation>(opportunityId, (page) => service.installations({ page, pageSize: PAGE })),
  });
}

export function useLinkedDeliveries(opportunityId: string, enabled = true) {
  return useQuery({
    queryKey: opportunityCaseKeys.deliveries(opportunityId),
    enabled: enabled && Boolean(opportunityId),
    refetchOnMount: 'always',
    queryFn: () =>
      loadLinkedOperations<Delivery>(opportunityId, (page) => logisticsApi.deliveries({ page, pageSize: PAGE })),
  });
}

/**
 * Receivables: API supports companyId only. Scope to this case via quoteIds
 * (payment-plan installments) — same idea as web salesCaseId filter.
 */
export function useOpportunityReceivables(
  opportunityId: string,
  opts: { companyId?: string | null; quoteIds: string[]; titleHint?: string | null },
  enabled = true,
) {
  const companyId = opts.companyId ?? '';
  const quoteKey = [...opts.quoteIds].sort().join(',');
  return useQuery({
    queryKey: [...opportunityCaseKeys.receivables(opportunityId, companyId || undefined), quoteKey, opts.titleHint ?? null],
    enabled: enabled && Boolean(opportunityId) && Boolean(companyId),
    refetchOnMount: 'always',
    queryFn: async (): Promise<Receivable2[]> => {
      const pages = await collectPaginated((page) =>
        finance.receivables({ page, pageSize: PAGE, companyId }),
      );
      const quoteIds = new Set(opts.quoteIds);
      return pages.data.filter((row) =>
        receivableBelongsToOpportunity(row, quoteIds, {
          companyId,
          titleHint: opts.titleHint,
        }),
      );
    },
  });
}
