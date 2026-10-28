import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/src/auth/AuthProvider';
import { apiOrigin } from '@/src/api/config';
import { assistantSession } from './storage';
import { commitDraft, readDraft } from './api';

type Kind = 'opportunity' | 'note' | 'task' | 'service_ticket';
type Draft = Awaited<ReturnType<typeof readDraft>>;

/** Protected draft contents never travel in route params; only manual Save commits CRM data. */
export function useAssistantFormDraft(id: string, kind: Kind, prefill: (draft: Draft) => void) {
  const { user, scope } = useAuth();
  const account = user ? `${apiOrigin()}|${user.tenantId}|${user.id}|${scope.divisionId ?? ''}|${scope.departmentId ?? ''}` : null;
  const mountedAccount = useRef(account);
  const isCurrent = () => Boolean(account && mountedAccount.current === account && assistantSession()?.scope === account && assistantSession()?.enabled);
  const applied = useRef<string | null>(null);
  const applyRef = useRef(prefill);
  applyRef.current = prefill;
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['call-assistant', 'form-draft', account, id, kind],
    enabled: Boolean(id) && isCurrent(),
    queryFn: async () => {
      if (!isCurrent()) throw new Error('Hesap değişti. Formu kapatıp yeniden açın.');
      const draft = await readDraft(id);
      if (!isCurrent()) throw new Error('Hesap değişti. Formu kapatıp yeniden açın.');
      if (draft.expiresAt && (!Number.isFinite(Date.parse(draft.expiresAt)) || Date.parse(draft.expiresAt) <= Date.now())) throw new Error('Taslağın süresi dolmuş. Asistana dönüp yeniden oluşturun.');
      if (draft.kind !== kind || !draft.company?.id) throw new Error('Taslak bu form için uygun değil. Asistana dönüp yeniden seçim yapın.');
      return draft;
    },
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (!isCurrent() || !id || !query.data || applied.current === id) return;
    applyRef.current(query.data);
    applied.current = id;
  }, [account, id, query.data]);
  const commit = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!isCurrent() || !id || !query.data || query.isError || applied.current !== id) throw new Error('Asistan taslağı henüz hazır değil.');
      if (query.data.expiresAt && Date.parse(query.data.expiresAt) <= Date.now()) throw new Error('Taslağın süresi dolmuş. Asistana dönüp yeniden oluşturun.');
      return commitDraft(id, { operationId: query.data.id, kind, payload });
    },
    onSuccess: async () => { await client.invalidateQueries(); },
  });
  return {
    active: Boolean(id),
    blocked: Boolean(id) && (!isCurrent() || !query.data || query.isError || query.isFetching || applied.current !== id),
    error: id && !isCurrent() ? 'Hesap veya yardımcı ayarı değişti. Formu kapatıp yeniden açın.' : query.error instanceof Error ? query.error.message : null,
    loading: Boolean(id) && query.isPending,
    saving: commit.isPending,
    retry: query.refetch,
    save: commit.mutateAsync,
  };
}
