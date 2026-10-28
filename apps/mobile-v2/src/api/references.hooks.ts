import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { devices, opportunities, type CustomerDevice } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { referencesApi, type ReferenceInput } from './references.api';
import { collectPaginated } from './pagination';

export const referenceKeys = {
  all: ['references'] as const,
  list: ['references', 'list'] as const,
  won: ['references', 'won-opportunities'] as const,
  devices: ['references', 'devices'] as const,
};

export function useReferences() {
  return useQuery({ queryKey: referenceKeys.list, queryFn: referencesApi.list });
}

/** Kazanılan fırsat kimlikleri (web `closedCases` + qualificationStage = win). */
export function useWonOpportunityIds() {
  const canRead = useCan('opportunities.read');
  return useQuery({
    queryKey: referenceKeys.won,
    enabled: canRead,
    staleTime: 5 * 60_000,
    queryFn: () =>
      collectPaginated((page) => opportunities.list({ qualificationStage: 'win', view: 'all', page, pageSize: 200 })),
    select: (result) => new Set(result.data.map((row) => row.id)),
  });
}

export function useReferenceDevices() {
  const canRead = useCan('customer_devices.read');
  return useQuery({
    queryKey: referenceKeys.devices,
    enabled: canRead,
    staleTime: 5 * 60_000,
    queryFn: async () => (await collectPaginated<CustomerDevice>((page) => devices.list({ page, pageSize: 200 }))).data,
  });
}

function useInvalidateReferences() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: referenceKeys.list });
}

export function useSaveReference() {
  const invalidate = useInvalidateReferences();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: ReferenceInput }) => (id ? referencesApi.update(id, body) : referencesApi.create(body)),
    onSuccess: () => void invalidate(),
  });
}

export function useDeleteReference() {
  const invalidate = useInvalidateReferences();
  return useMutation({ mutationFn: (id: string) => referencesApi.remove(id), onSuccess: () => void invalidate() });
}

export function useImportReferences() {
  const invalidate = useInvalidateReferences();
  return useMutation({
    mutationFn: (body: { fileName: string; fileBase64: string }) => referencesApi.importFile(body),
    onSuccess: (result) => {
      if (result.created) void invalidate();
    },
  });
}
