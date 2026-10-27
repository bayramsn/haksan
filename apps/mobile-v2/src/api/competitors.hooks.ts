import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompetitorCreateInput } from '@haksan/shared';
import { request, type Paginated } from './client';
import { useCan } from '@/src/auth/AuthProvider';

/* Yanıt biçimi: opportunities/competitors.controller (competitors tablosu satırı). */
export type Competitor = { id: string; name: string };

export function useCompetitors(search: string) {
  const canRead = useCan('competitors.read');
  return useQuery({
    queryKey: ['competitors', search],
    queryFn: () =>
      request<Paginated<Competitor>>('/competitors', { query: { search: search || undefined, page: 1, pageSize: 8 } }),
    enabled: canRead,
  });
}

export function useCreateCompetitor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CompetitorCreateInput) => request<Competitor>('/competitors', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['competitors'] });
    },
  });
}
