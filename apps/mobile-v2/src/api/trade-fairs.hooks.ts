import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { files } from '@/src/api/endpoints';
import type { Paginated } from '@/src/api/client';
import { useCan } from '@/src/auth/AuthProvider';
import { tradeFairsApi, type TradeFairContact, type TradeFairContactBody } from './trade-fairs.api';
import { tradeFairListParams, tradeFairPhotoKey, type TradeFairListFilters } from '@/src/ui/trade-fairs/tradeFairLogic';

export const TRADE_FAIR_PAGE_SIZE = 50;
export const TRADE_FAIR_PHOTO_PAGE_SIZE = 24;

export const tradeFairKeys = {
  all: ['trade-fairs'] as const,
  list: (params: ReturnType<typeof tradeFairListParams>): QueryKey => ['trade-fairs', 'list', params],
  photos: (fairName: string | null, q: string): QueryKey => ['trade-fairs', 'photos', fairName, q],
  summary: (fairName: string | null): QueryKey => ['trade-fairs', 'summary', fairName],
  staff: ['trade-fairs', 'staff'] as const,
  attachments: (id: string): QueryKey => ['trade-fairs', 'attachments', id],
  divisions: ['trade-fairs', 'divisions'] as const,
  products: (divisionId: string, q: string): QueryKey => ['trade-fairs', 'product-options', divisionId, q],
};

export function useTradeFairList(filters: TradeFairListFilters) {
  const params = tradeFairListParams(filters);
  return useInfiniteQuery({
    queryKey: tradeFairKeys.list(params),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => tradeFairsApi.list({ ...params, page: pageParam, pageSize: TRADE_FAIR_PAGE_SIZE }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.meta.total ?? 0 }),
  });
}

/** Galeri yalnız fuar ve aramayı süzer (web TradeFairPhotoGallery); dosya okuma izni gerekir. */
export function useTradeFairPhotos(fairName: string | null, q: string, enabled: boolean) {
  const canRead = useCan('files.read');
  return useInfiniteQuery({
    queryKey: tradeFairKeys.photos(fairName, q),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      tradeFairsApi.photos({ fairName: fairName ?? undefined, q: q || undefined, page: pageParam, pageSize: TRADE_FAIR_PHOTO_PAGE_SIZE }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    // Satır başına bir bağlantı döner; ofsetli sayfalamada yeni yükleme aynı satırı tekrar getirebilir.
    select: (data) => {
      const seen = new Set<string>();
      const items = data.pages.flatMap((p) => p.data).filter((photo) => {
        const key = tradeFairPhotoKey(photo);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { items, total: data.pages[0]?.meta.total ?? 0 };
    },
    enabled: enabled && canRead,
  });
}

/** Özet aramadan bağımsız: seçili fuarın tamamını anlatır (web ile aynı). */
export function useTradeFairSummary(fairName: string | null) {
  return useQuery({ queryKey: tradeFairKeys.summary(fairName), queryFn: () => tradeFairsApi.summary(fairName ?? undefined) });
}

export function useTradeFairStaff() {
  return useQuery({ queryKey: tradeFairKeys.staff, queryFn: tradeFairsApi.staff, staleTime: 5 * 60_000 });
}

export function useTradeFairAttachments(id: string | null) {
  const canRead = useCan('files.read');
  return useQuery({
    queryKey: tradeFairKeys.attachments(id ?? ''),
    queryFn: () => tradeFairsApi.attachments(id!),
    enabled: Boolean(id) && canRead,
    select: (page) => page.data,
  });
}

export function useTradeFairDivisions() {
  return useQuery({ queryKey: tradeFairKeys.divisions, queryFn: tradeFairsApi.divisions, staleTime: 5 * 60_000 });
}

/** Fuar seçicisi ürün iznine değil fuar okuma iznine tabidir. Bölüm ve arama sunucuya aktarılır. */
export function useTradeFairProductOptions(divisionId: string, q = '') {
  const canRead = useCan('trade_fairs.read');
  return useQuery({
    queryKey: tradeFairKeys.products(divisionId, q),
    queryFn: () => tradeFairsApi.products(divisionId, q || undefined),
    enabled: Boolean(divisionId) && canRead,
    staleTime: 5 * 60_000,
  });
}

export function useTradeFairAction() {
  const invalidate = useInvalidateTradeFairs();
  return useMutation({
    mutationFn: async (input:
      | { kind: 'called'; id: string; value: boolean }
      | { kind: 'quoted'; id: string; value: boolean }
      | { kind: 'company'; id: string; companyId?: string; divisionIds?: string[] }
      | { kind: 'opportunity'; id: string; qualificationStage: 'lead' | 'c' | 'b' | 'a' | 'a_plus'; divisionId?: string }
    ) => {
      if (input.kind === 'called') return tradeFairsApi.setCalled(input.id, input.value);
      if (input.kind === 'quoted') return tradeFairsApi.setQuoted(input.id, input.value);
      if (input.kind === 'company') return tradeFairsApi.toCompany(input.id, { companyId: input.companyId, divisionIds: input.divisionIds });
      return tradeFairsApi.toOpportunity(input.id, { qualificationStage: input.qualificationStage, divisionId: input.divisionId });
    },
    onSuccess: () => void invalidate(),
  });
}

/** Düzenleme modalı kaydı tekil uç olmadığından liste önbelleğinden bulur. */
export function useCachedTradeFair(id: string | undefined): TradeFairContact | null {
  const queryClient = useQueryClient();
  if (!id) return null;
  const lists = queryClient.getQueriesData<InfiniteData<Paginated<TradeFairContact>>>({ queryKey: ['trade-fairs', 'list'] });
  for (const [, data] of lists) {
    for (const page of data?.pages ?? []) {
      const hit = page.data.find((row) => row.id === id);
      if (hit) return hit;
    }
  }
  return null;
}

function useInvalidateTradeFairs() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: tradeFairKeys.all });
}

export function useSaveTradeFair() {
  const invalidate = useInvalidateTradeFairs();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: TradeFairContactBody }) =>
      id ? tradeFairsApi.update(id, body) : tradeFairsApi.create(body),
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateTradeFair() {
  const invalidate = useInvalidateTradeFairs();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<TradeFairContactBody> }) => tradeFairsApi.update(id, body),
    onSuccess: () => void invalidate(),
  });
}

export function useDeleteTradeFair() {
  const invalidate = useInvalidateTradeFairs();
  return useMutation({
    mutationFn: (id: string) => tradeFairsApi.remove(id),
    onSuccess: () => void invalidate(),
  });
}

/** Ek yükleme/silme sonrası kaydın ekleri ve galeri birlikte tazelenir. */
export function useInvalidateTradeFairFiles() {
  const queryClient = useQueryClient();
  return (recordId: string) => {
    void queryClient.invalidateQueries({ queryKey: tradeFairKeys.attachments(recordId) });
    void queryClient.invalidateQueries({ queryKey: ['trade-fairs', 'photos'] });
  };
}

export function useRemoveTradeFairAttachment(recordId: string) {
  const invalidateFiles = useInvalidateTradeFairFiles();
  return useMutation({
    mutationFn: (fileId: string) => files.remove(fileId),
    onSuccess: () => invalidateFiles(recordId),
  });
}
