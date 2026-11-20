import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TradeFairContactInput, TradeFairContactUpdateInput } from '@haksan/shared';
import { request, type Paginated } from './client';

export type FairContact = TradeFairContactInput & { id: string; createdAt: string; createdBy?: string | null; metByName?: string | null };
export function useFairContacts(search: string) {
  return useInfiniteQuery({
    queryKey: ['trade-fairs', { search }], initialPageParam: 1,
    queryFn: ({ pageParam }) => request<Paginated<FairContact>>('/trade-fairs', { query: { q: search || undefined, page: pageParam, pageSize: 30 } }),
    getNextPageParam: last => last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
  });
}
export function useCreateFairContact() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: TradeFairContactInput) => request<FairContact>('/trade-fairs', { method: 'POST', body }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['trade-fairs'] }); } });
}
export function useUpdateFairContact() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, body }: { id: string; body: TradeFairContactUpdateInput }) => request<FairContact>(`/trade-fairs/${id}`, { method: 'PATCH', body }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['trade-fairs'] }); } });
}
export function useDeleteFairContact() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => request<unknown>(`/trade-fairs/${id}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['trade-fairs'] }); } });
}
