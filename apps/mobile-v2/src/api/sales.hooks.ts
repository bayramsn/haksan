import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { activityKeys, opportunityKeys } from '@/src/api/crm.hooks';
import {
  salesApi,
  type LeadContactEventBody,
  type OpportunityFromActivityBody,
  type OpportunityStageChangeBody,
  type SalesListQuery,
  type SalesOpportunityRow,
  type TeamActivityMetric,
  type TeamActivityPeriod,
  type TrelloImportCommitBody,
} from '@/src/api/sales.api';
import type { QualificationStage } from '@/src/api/endpoints';
import { fileLinksApi } from '@/src/api/commercial-docs.api';
import { uploadEntityAttachment, type LocalUpload } from '@/src/native/files';

const PAGE_SIZE = 50;
/** Kanban kolonu başına çekilen kart; toplam bu kümeden hesaplanır, kolon başlığı sunucu sayısını gösterir. */
export const KANBAN_COLUMN_SIZE = 200;
/** Gösterge paneli analizleri için okunan en fazla kart (4 × 200). */
const DASHBOARD_MAX_PAGES = 4;

export const salesKeys = {
  leadSummary: ['opportunities', 'lead-summary'] as const,
  list: (query: SalesListQuery) => ['opportunities', 'sales-list', query] as const,
  kanban: (query: SalesListQuery, stage: QualificationStage) => ['opportunities', 'kanban', query, stage] as const,
  analytics: ['opportunities', 'analytics'] as const,
  files: (id: string) => ['opportunities', 'files', id] as const,
  tasksSummary: ['tasks', 'summary'] as const,
  teamActivity: (period: TeamActivityPeriod, scope: 'team' | 'self') => ['reports', 'team-activity', period, scope] as const,
  teamActivityDetails: (input: { period: TeamActivityPeriod; scope: 'team' | 'self'; metric: TeamActivityMetric; userId?: string }) =>
    ['reports', 'team-activity', 'details', input] as const,
};

/** Fırsat listesi; web'in geçmiş/sonuç/kayıp nedeni filtrelerini de taşır. */
export function useSalesList(query: SalesListQuery, enabled = true) {
  return useInfiniteQuery({
    queryKey: salesKeys.list(query),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => salesApi.list({ ...query, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.meta.total ?? 0 }),
    enabled,
  });
}

export function useKanbanColumns(query: SalesListQuery, stages: readonly QualificationStage[]) {
  return useQueries({
    queries: stages.map((stage) => ({
      queryKey: salesKeys.kanban(query, stage),
      queryFn: () => salesApi.list({ ...query, qualificationStage: stage, page: 1, pageSize: KANBAN_COLUMN_SIZE }),
    })),
    combine: (results) => ({
      columns: stages.map((stage, index) => ({
        stage,
        items: results[index]?.data?.data ?? [],
        total: results[index]?.data?.meta.total ?? 0,
      })),
      isPending: results.some((r) => r.isPending),
      error: results.find((r) => r.error)?.error ?? null,
      isRefetching: results.some((r) => r.isRefetching),
      refetch: () => Promise.all(results.map((r) => r.refetch())),
    }),
  });
}

/**
 * Gösterge paneli satış analizleri için tüm (açık + kapalı) kartlar; en fazla
 * 800 kart okunur, `truncated` ile ekranda belirtilir.
 */
export function useSalesAnalytics(enabled = true) {
  return useQuery({
    queryKey: salesKeys.analytics,
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ rows: SalesOpportunityRow[]; total: number; truncated: boolean }> => {
      const first = await salesApi.list({ view: 'all', page: 1, pageSize: 200 });
      const pages = Math.min(first.meta.totalPages, DASHBOARD_MAX_PAGES);
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, pages - 1) }, (_, index) => salesApi.list({ view: 'all', page: index + 2, pageSize: 200 }))
      );
      const rows = [first, ...rest].flatMap((page) => page.data);
      return { rows, total: first.meta.total, truncated: first.meta.total > rows.length };
    },
  });
}

/** Filtre sayaçları: yalnız `meta.total` okunur (sayfa boyutu 1). */
export function useSalesCounts(queries: SalesListQuery[], enabled = true) {
  return useQueries({
    queries: queries.map((query) => ({
      queryKey: [...salesKeys.list(query), 'count'] as const,
      queryFn: () => salesApi.list({ ...query, page: 1, pageSize: 1 }),
      enabled,
      staleTime: 60 * 1000,
    })),
    combine: (results) => results.map((result) => result.data?.meta.total ?? null),
  });
}

export function useLeadSummary(enabled = true) {
  return useQuery({ queryKey: salesKeys.leadSummary, queryFn: () => salesApi.leadSummary(), enabled, staleTime: 2 * 60 * 1000 });
}

function useInvalidateOpportunities() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: opportunityKeys.all });
    void qc.invalidateQueries({ queryKey: activityKeys.all });
    void qc.invalidateQueries({ queryKey: ['tasks'] });
  };
}

export function useCreateOpportunityFromActivity() {
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: ({ activityId, body }: { activityId: string; body: OpportunityFromActivityBody }) =>
      salesApi.createFromActivity(activityId, body),
    onSuccess: invalidate,
  });
}

export function useLinkOpportunityCompany() {
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: ({ id, companyId, createContact }: { id: string; companyId: string; createContact: boolean }) =>
      salesApi.linkCompany(id, { companyId, createContact }),
    onSuccess: invalidate,
  });
}

export function useRecordLeadContact() {
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: LeadContactEventBody }) => salesApi.recordContact(id, body),
    onSuccess: invalidate,
  });
}

export function useConvertLead() {
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: ({ id, note, overrideReason }: { id: string; note?: string; overrideReason?: string }) =>
      salesApi.convert(id, { note, overrideReason }),
    onSuccess: invalidate,
  });
}

export function useChangeOpportunityStage() {
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: OpportunityStageChangeBody }) => salesApi.changeStage(id, body),
    onSuccess: invalidate,
  });
}

export function usePreviewTrelloImport() {
  return useMutation({
    mutationFn: (body: { fileName: string; fileBase64: string }) => salesApi.previewTrelloImport(body),
  });
}

export function useCommitTrelloImport() {
  const invalidate = useInvalidateOpportunities();
  return useMutation({
    mutationFn: (body: TrelloImportCommitBody) => salesApi.commitTrelloImport(body),
    onSuccess: invalidate,
  });
}

export function useTasksSummary(enabled: boolean) {
  return useQuery({ queryKey: salesKeys.tasksSummary, queryFn: () => salesApi.tasksSummary(), enabled, staleTime: 60 * 1000 });
}

export function useTeamActivity(period: TeamActivityPeriod, scope: 'team' | 'self', enabled: boolean) {
  return useQuery({
    queryKey: salesKeys.teamActivity(period, scope),
    queryFn: () => salesApi.teamActivity({ period, scope }),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useTeamActivityDetails(
  input: { period: TeamActivityPeriod; scope: 'team' | 'self'; metric: TeamActivityMetric; userId?: string },
  enabled: boolean
) {
  return useQuery({
    queryKey: salesKeys.teamActivityDetails(input),
    queryFn: () => salesApi.teamActivityDetails(input),
    enabled,
  });
}

/* -------------------------------------------------------- fırsat belgeleri ---- */

export function useOpportunityFiles(id: string, enabled = true) {
  return useQuery({
    queryKey: salesKeys.files(id),
    queryFn: () => fileLinksApi.list({ entityType: 'opportunity', entityId: id, page: 1, pageSize: 100 }),
    select: (page) => ({ items: page.data, total: page.meta.total }),
    enabled: enabled && Boolean(id),
  });
}

/** Web DocumentUploadDialog "Diğer" belge akışı: quote kovası + `other` belge türü. */
export function useUploadOpportunityFile(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ local, description }: { local: LocalUpload; description?: string }) =>
      uploadEntityAttachment({
        bucket: 'erp-quote-documents',
        entityType: 'opportunity',
        entityId: id,
        documentTypeCode: 'other',
        description,
        local,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: salesKeys.files(id) }),
  });
}

export function useDeleteOpportunityFile(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => fileLinksApi.remove(fileId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: salesKeys.files(id) }),
  });
}
