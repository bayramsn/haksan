import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { logisticsApi, type Delivery } from '@/src/api/logistics.api';
import { infinite, serviceKeys } from '@/src/api/operations.hooks';

export const deliveryKeys = {
  all: ['service', 'deliveries'] as const,
};

export function useShipmentCompanyOptions(
  query: { purpose: 'sender' | 'carrier'; transportMode?: string; search?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: ['service', 'shipment-company-options', query],
    queryFn: () => logisticsApi.shipmentCompanyOptions(query),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateShipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => logisticsApi.createShipment(body),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['service', 'shipments'] }),
        qc.invalidateQueries({ queryKey: ['inventory'] }),
      ]);
    },
  });
}

export function useDeleteShipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => logisticsApi.deleteShipment(id),
    onSuccess: (_result, id) => {
      qc.removeQueries({ queryKey: serviceKeys.shipment(id) });
      void qc.invalidateQueries({ queryKey: ['service', 'shipments'] });
    },
  });
}

export function useDeliveries(enabled = true) {
  return useInfiniteQuery({
    ...infinite<Delivery>(deliveryKeys.all, (page, pageSize) => logisticsApi.deliveries({ page, pageSize })),
    enabled,
  });
}

/** Sunucuda tekil teslimat ucu yok; detay liste önbelleğinden okunur. */
export function useDeliveryFromList(id: string) {
  const query = useDeliveries();
  return { ...query, delivery: query.data?.items.find((row) => row.id === id) ?? null };
}

function settleDeliveries(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: deliveryKeys.all }),
    qc.invalidateQueries({ queryKey: ['inventory'] }),
  ]);
}

export function useCreateDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => logisticsApi.createDelivery(body),
    onSuccess: () => settleDeliveries(qc),
  });
}

export function useUpdateDelivery(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => logisticsApi.updateDelivery(id, body),
    onSuccess: () => settleDeliveries(qc),
  });
}

export function useUpdateDeliveryStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'pending' | 'completed' }) =>
      logisticsApi.updateDeliveryStatus(id, status),
    onSuccess: () => settleDeliveries(qc),
  });
}

export function useDeleteDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => logisticsApi.deleteDelivery(id),
    onSuccess: () => settleDeliveries(qc),
  });
}
