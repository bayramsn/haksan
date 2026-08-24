import { Alert } from 'react-native';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { CompanyCreateInput, CompanyUpdateInput } from '@haksan/shared';
import { companies, type CompanyListItem, type CompanyListQuery } from './endpoints';
import type { Paginated } from './client';
import { dashboardKeys } from './dashboard';
import { useOfflineMutation } from '@/src/offline/useOfflineMutation';

const PAGE_SIZE = 50; // §4.2

export const companyKeys = {
  all: ['companies'] as const,
  list: (query: CompanyListQuery): QueryKey => ['companies', 'list', query],
  detail: (id: string): QueryKey => ['companies', 'detail', id],
  map: ['companies', 'map'] as const,
};

export function useCompanyList(query: CompanyListQuery) {
  return useInfiniteQuery({
    queryKey: companyKeys.list(query),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => companies.list({ ...query, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ ...data, items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.meta.total ?? 0 }),
  });
}

/** Boş id ile çağrılabilir (detay ekranı firmayı sonradan öğrenir); o durumda istek atılmaz. */
export function useCompany(id: string) {
  return useQuery({
    queryKey: companyKeys.detail(id),
    queryFn: () => companies.get(id),
    enabled: Boolean(id),
  });
}

export function useCompanyMapPoints() {
  return useQuery({
    queryKey: companyKeys.map,
    queryFn: companies.mapPoints,
    staleTime: 60_000,
  });
}

export function useCreateCompany(onCreated?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CompanyCreateInput) => companies.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.all });
      onCreated?.();
    },
  });
}

type UpdateVars = { id: string; patch: CompanyUpdateInput };
export type CompanyStatusCode = 'potential' | 'active' | 'passive' | 'blacklist';
export type CompanyStatusVars = { id: string; customerStatusCode: CompanyStatusCode; operationId: string };

const STATUS_LABELS: Record<CompanyStatusCode, string> = {
  potential: 'Potansiyel',
  active: 'Aktif',
  passive: 'Pasif',
  blacklist: 'Kara liste',
};

/**
 * Yalnız dar durum değişikliği çevrimdışı kuyruğa girebilir. Tam firma gövdesi
 * vergi/iletişim/adres PII'si taşıdığı için şifrelenmemiş cache'e yazılmaz.
 */
export function useUpdateCompanyStatus(listQuery: CompanyListQuery) {
  const listKey = companyKeys.list(listQuery);
  return useOfflineMutation<CompanyStatusVars, unknown>({
    kind: 'company.status',
    mutationFn: ({ id, customerStatusCode, operationId }) =>
      companies.updateStatus(id, { customerStatusCode, operationId }),
    toPayload: (vars) => vars,
    optimistic: {
      keys: [listKey],
      apply: (previous, vars) => {
        const page = previous as { pages: Paginated<CompanyListItem>[] } | undefined;
        if (!page) return previous;
        return {
          ...page,
          pages: page.pages.map((part) => ({
            ...part,
            data: part.data.map((row) => row.id === vars.id
              ? {
                  ...row,
                  customerStatus: {
                    code: vars.customerStatusCode,
                    name: STATUS_LABELS[vars.customerStatusCode],
                  },
                }
              : row),
          })),
        };
      },
    },
    invalidate: [companyKeys.all, dashboardKeys.all],
    onDone: (_data, queued) => {
      if (queued) Alert.alert('Bağlantı bekleniyor', 'Durum değişikliği şifreli kuyruğa alındı ve bağlantı gelince gönderilecek.');
    },
  });
}

/**
 * §3.2: tüm obje değil yalnızca değişen alanlar (`patch`) gönderilir; sunucu
 * PATCH ile birleştirir, böylece başka kullanıcının aynı anda değiştirdiği
 * alanlar ezilmez.
 */
export function useUpdateCompany(listQuery: CompanyListQuery) {
  const qc = useQueryClient();
  const listKey = companyKeys.list(listQuery);
  return useMutation<CompanyListItem, Error, UpdateVars, { previous: unknown }>({
    mutationFn: ({ id, patch }) => companies.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: listKey });
      const previous = qc.getQueryData(listKey);
      const page = previous as { pages: Paginated<CompanyListItem>[] } | undefined;
      if (page) {
        qc.setQueryData(listKey, {
          ...page,
          pages: page.pages.map((p) => ({
            ...p,
            data: p.data.map((row) => (row.id === id ? { ...row, ...patch } : row)),
          })),
        });
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      qc.setQueryData(listKey, context?.previous);
      Alert.alert('Güncelleme yapılamadı', error.message);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: companyKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

/**
 * Düzenleme modalından kullanılan sürüm: hangi listenin güncelleneceği
 * bilinemediğinden iyimser güncelleme yerine tüm firma sorgularını tazeler.
 * PATCH yanıtı liste satırı şeklinde döndüğü için detay önbelleğine yazılmaz;
 * invalidate ile tam CompanyDetail yeniden çekilir.
 */
export function useUpdateCompanyFields(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: CompanyUpdateInput) => companies.update(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}
