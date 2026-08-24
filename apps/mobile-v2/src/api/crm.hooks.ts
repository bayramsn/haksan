import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { ActivityCreateInput, ActivityUpdateInput, ContactCreateInput, ContactUpdateInput } from '@haksan/shared';
import {
  activities,
  contacts,
  lookups,
  opportunities,
  quotes,
  type ContactListQuery,
  type OpportunityApprovalType,
  type OpportunityListQuery,
  type OpportunityProcessCheckInput,
  type OpportunityQualificationChangeInput,
  type QualificationStage,
  type QuoteListQuery,
  type QuoteWorkflowInput,
} from './endpoints';

const PAGE_SIZE = 50; // §4.2

/* ------------------------------------------------------------ kontaklar ---- */

export const contactKeys = {
  all: ['contacts'] as const,
  list: (query: ContactListQuery): QueryKey => ['contacts', 'list', query],
  detail: (id: string): QueryKey => ['contacts', 'detail', id],
  summary: ['contacts', 'summary'] as const,
};

export function useContactList(query: ContactListQuery, enabled = true) {
  return useInfiniteQuery({
    queryKey: contactKeys.list(query),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => contacts.list({ ...query, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.meta.total ?? 0 }),
    enabled,
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: contactKeys.detail(id),
    queryFn: () => contacts.get(id),
    enabled: Boolean(id),
  });
}

export function useContactSummary() {
  return useQuery({ queryKey: contactKeys.summary, queryFn: () => contacts.summary() });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ContactCreateInput) => contacts.create(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: contactKeys.all }),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ContactUpdateInput }) => contacts.update(id, patch),
    onSuccess: (updated) => {
      qc.setQueryData(contactKeys.detail(updated.id), updated);
      void qc.invalidateQueries({ queryKey: contactKeys.all });
    },
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => contacts.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: contactKeys.all }),
  });
}

/* -------------------------------------------------------------- fırsat ---- */

export const opportunityKeys = {
  all: ['opportunities'] as const,
  list: (query: OpportunityListQuery): QueryKey => ['opportunities', 'list', query],
  detail: (id: string): QueryKey => ['opportunities', 'detail', id],
};

export function useOpportunityList(query: OpportunityListQuery, enabled = true) {
  return useInfiniteQuery({
    queryKey: opportunityKeys.list(query),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => opportunities.list({ ...query, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.meta.total ?? 0 }),
    enabled,
  });
}

export function useOpportunity(id: string) {
  return useQuery({
    queryKey: opportunityKeys.detail(id),
    queryFn: () => opportunities.get(id),
    enabled: Boolean(id),
  });
}

/** Yeni fırsat/lead kartı açar (web LeadCaptureDialog'un tam karşılığı). */
export function useCreateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Parameters<typeof opportunities.create>[0],
    ) => opportunities.create(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: opportunityKeys.all }),
  });
}

/** Kartın ticari alanlarını düzenler; sunucu PATCH ile birleştirir. */
export function useUpdateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      title?: string;
      description?: string;
      estimatedValue?: number | string;
      currencyCode?: string;
      probability?: number;
      expectedCloseDate?: string;
      requestedMachine?: string;
      nextAction?: string;
      nextActionAt?: string;
      wonReason?: string;
      ownerUserId?: string | null;
    }) => opportunities.update(id, body),
    onSuccess: (updated) => {
      qc.setQueryData(opportunityKeys.detail(updated.id), updated);
      void qc.invalidateQueries({ queryKey: opportunityKeys.all });
    },
  });
}

/**
 * "Sorumlu" adı: liste/pano ucu yalnızca `ownerUserId` (UUID) döner, adı değil.
 * Nadiren değişen küçük bir liste olduğu için lookup gibi uzun süre taze sayılır.
 */
export function useOpportunityAssignees(enabled = true) {
  return useQuery({
    queryKey: ['opportunities', 'assignees'],
    queryFn: () => opportunities.assignees(),
    staleTime: 60 * 60 * 1000,
    enabled,
  });
}

/**
 * Pano kolonu değiştirme. Sunucu geçiş kurallarını (STAGE_TRANSITIONS) kendi
 * doğruluyor; reddedilirse hata mesajı kullanıcıya gösterilir, iyimser güncelleme
 * yapılmaz — yanlış kolonda duran kart yanlış bilgi verir.
 */
export function useSetQualificationStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & OpportunityQualificationChangeInput) =>
      opportunities.setQualificationStage(id, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: opportunityKeys.all }),
  });
}

/** A+ alanındaki elle işaretlenebilir süreç adımını "yapıldı / yapılmadı" yapar. */
export function useSetProcessCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, key, body }: { id: string; key: string; body: OpportunityProcessCheckInput }) =>
      opportunities.setProcessCheck(id, key, body),
    onSuccess: (updated) => {
      qc.setQueryData(opportunityKeys.detail(updated.id), updated);
      void qc.invalidateQueries({ queryKey: opportunityKeys.all });
    },
  });
}

export function useDecideOpportunityApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      type,
      decision,
      note,
    }: { id: string; type: OpportunityApprovalType } & { decision: 'approved' | 'rejected'; note?: string }) =>
      opportunities.decideApproval(id, type, { decision, note }),
    onSuccess: (updated) => {
      qc.setQueryData(opportunityKeys.detail(updated.id), updated);
      void qc.invalidateQueries({ queryKey: opportunityKeys.all });
    },
  });
}

/** "Bitir" — WIN/LOST kartı arşive kapatır (web SalesCases Geçmiş görünümü). */
export function useCloseOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => opportunities.close(id, reason),
    onSuccess: () => void qc.invalidateQueries({ queryKey: opportunityKeys.all }),
  });
}

export function useReopenOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => opportunities.reopen(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: opportunityKeys.all }),
  });
}

/* ------------------------------------------------------------- teklif ---- */

export const quoteKeys = {
  all: ['quotes'] as const,
  list: (query: QuoteListQuery): QueryKey => ['quotes', 'list', query],
  summary: (query: QuoteListQuery): QueryKey => ['quotes', 'summary', query],
  detail: (id: string): QueryKey => ['quotes', 'detail', id],
};

export function useQuoteList(query: QuoteListQuery) {
  return useInfiniteQuery({
    queryKey: quoteKeys.list(query),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => quotes.list({ ...query, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.meta.total ?? 0 }),
  });
}

export function useQuoteSummary(query: QuoteListQuery) {
  return useQuery({ queryKey: quoteKeys.summary(query), queryFn: () => quotes.summary(query) });
}

export function useQuote(id: string) {
  return useQuery({ queryKey: quoteKeys.detail(id), queryFn: () => quotes.get(id) });
}

/** Teklif mutasyonları: detay önbelleğini sunucu yanıtıyla değiştirir, listeleri tazeler. */
function useInvalidateQuote() {
  const qc = useQueryClient();
  return (updated: unknown) => {
    const row = updated as { id?: string } | null;
    if (row?.id) qc.setQueryData(quoteKeys.detail(row.id), updated);
    void qc.invalidateQueries({ queryKey: quoteKeys.all });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useSendQuote() {
  const settle = useInvalidateQuote();
  return useMutation({ mutationFn: (id: string) => quotes.send(id), onSuccess: settle });
}

export function useApproveQuote() {
  const settle = useInvalidateQuote();
  return useMutation({ mutationFn: (id: string) => quotes.approve(id), onSuccess: settle });
}

export function useRejectQuote() {
  const settle = useInvalidateQuote();
  return useMutation({ mutationFn: (id: string) => quotes.reject(id), onSuccess: settle });
}

/** İş akışı durumu + hatırlatma; `cancelled` hariç followUpAt zorunlu (sunucu şeması). */
export function useQuoteWorkflowStatus() {
  const settle = useInvalidateQuote();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: QuoteWorkflowInput }) => quotes.changeWorkflowStatus(id, body),
    onSuccess: settle,
  });
}

/** İndirimli fiyat onayı — yalnız süper yönetici (sunucu `quotes.approve`/`quotes.reject` ister). */
export function useQuotePriceApproval() {
  const settle = useInvalidateQuote();
  return useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: 'approved' | 'rejected'; note?: string }) =>
      quotes.priceApproval(id, decision, note),
    onSuccess: settle,
  });
}

/* ---------------------------------------------------------- aktiviteler ---- */

export const activityKeys = {
  all: ['activities'] as const,
  list: (scope: { companyId?: string; opportunityId?: string; contactId?: string }): QueryKey => ['activities', 'list', scope],
  detail: (id: string): QueryKey => ['activities', 'detail', id],
};

export function useActivityList(
  scope: { companyId?: string; opportunityId?: string; contactId?: string } = {},
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: activityKeys.list(scope),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => activities.list({ ...scope, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.meta.total ?? 0 }),
    enabled,
  });
}

export function useActivity(id: string) {
  return useQuery({
    queryKey: activityKeys.detail(id),
    queryFn: () => activities.get(id),
    enabled: Boolean(id),
  });
}

export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ActivityCreateInput) => activities.create(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: activityKeys.all }),
  });
}

export function useUpdateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ActivityUpdateInput }) => activities.update(id, patch),
    onSuccess: (_updated, variables) => {
      void qc.invalidateQueries({ queryKey: activityKeys.all });
      void qc.invalidateQueries({ queryKey: activityKeys.detail(variables.id) });
    },
  });
}

export function useDeleteActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activities.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: activityKeys.all }),
  });
}

/* ------------------------------------------------------------- lookups ---- */

/** Filtre pilleri için. Nadiren değişir; uzun süre taze sayılır. */
export function useLookup(name: string, enabled = true) {
  return useQuery({
    queryKey: ['lookups', name],
    queryFn: () => lookups.get(name),
    staleTime: 60 * 60 * 1000,
    enabled,
  });
}

/** Panoda kolon başına gösterilen kart sayısı; sayaç yine gerçek toplamı gösterir. */
export const BOARD_COLUMN_SIZE = 20;

/**
 * Pano: her kolon kendi sorgusu. Tek listeyi istemcide gruplamak kolon
 * sayaçlarını yanıltır (sayfalama 50'de kesiyor); her kolon kendi `meta.total`ını
 * getirsin diye 7 paralel sorgu yapılıyor.
 */
export function useOpportunityBoard(base: OpportunityListQuery, stages: readonly QualificationStage[]) {
  return useQueries({
    queries: stages.map((stage) => ({
      queryKey: opportunityKeys.list({ ...base, qualificationStage: stage }),
      queryFn: () =>
        opportunities.list({ ...base, qualificationStage: stage, page: 1, pageSize: BOARD_COLUMN_SIZE }),
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
    }),
  });
}
