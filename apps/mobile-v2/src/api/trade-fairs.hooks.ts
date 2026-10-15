import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { files, productsApi } from '@/src/api/endpoints';
import type { Paginated } from '@/src/api/client';
import { useCan } from '@/src/auth/AuthProvider';
import { tradeFairsApi, type TradeFairContact, type TradeFairContactBody } from './trade-fairs.api';

export const TRADE_FAIR_PAGE_SIZE = 50;

export const tradeFairKeys = {
  all: ['trade-fairs'] as const,
  list: (fairName: string | null, q: string): QueryKey => ['trade-fairs', 'list', fairName, q],
  summary: (fairName: string | null): QueryKey => ['trade-fairs', 'summary', fairName],
  staff: ['trade-fairs', 'staff'] as const,
  attachments: (id: string): QueryKey => ['trade-fairs', 'attachments', id],
  products: ['trade-fairs', 'product-options'] as const,
};

export function useTradeFairList(fairName: string | null, q: string) {
  return useInfiniteQuery({
    queryKey: tradeFairKeys.list(fairName, q),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      tradeFairsApi.list({ fairName: fairName ?? undefined, q: q || undefined, page: pageParam, pageSize: TRADE_FAIR_PAGE_SIZE }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.meta.total ?? 0 }),
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

/** Ürün kategorisi/tipi önerileri için katalog (web `useStore().products` karşılığı). */
export function useTradeFairProductOptions() {
  const canRead = useCan('products.read');
  return useQuery({
    queryKey: tradeFairKeys.products,
    queryFn: () => productsApi.list({ page: 1, pageSize: 200 }),
    enabled: canRead,
    staleTime: 10 * 60_000,
    select: (page) => page.data.map((p) => ({ category: p.category?.name ?? null, type: p.productType?.name ?? null })),
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

export function useRemoveTradeFairAttachment(recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => files.remove(fileId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: tradeFairKeys.attachments(recordId) }),
  });
}
