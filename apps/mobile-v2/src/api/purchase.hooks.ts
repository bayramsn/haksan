import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PurchaseOrder } from '@/src/api/endpoints';
import { purchaseApi, type PurchaseOrderBody, type PurchaseOrderItemBody } from './purchase.api';

const LOAD_ALL_PAGE_SIZE = 200;

export const purchaseKeys = {
  all: ['purchase-orders', 'all'] as const,
};

/**
 * Web sayfası KPI, tedarikçi içgörüsü ve aramayı yüklü tüm siparişler üzerinden
 * hesaplar; mobil de aynı sonucu vermek için tüm sayfaları çeker.
 */
export function useAllPurchaseOrders() {
  return useQuery({
    queryKey: purchaseKeys.all,
    queryFn: async () => {
      const rows: PurchaseOrder[] = [];
      for (let page = 1; ; page += 1) {
        const result = await purchaseApi.listPage({ page, pageSize: LOAD_ALL_PAGE_SIZE });
        rows.push(...result.data);
        if (page >= result.meta.totalPages) break;
      }
      return rows;
    },
  });
}

function usePurchaseInvalidation() {
  const qc = useQueryClient();
  return (id?: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
      id ? qc.invalidateQueries({ queryKey: ['purchase-orders', 'detail', id] }) : Promise.resolve(),
    ]);
}

/** Başlık + kalemler; kalem eklenemezse web gibi açılan siparişi geri siler. */
export function useCreatePurchaseOrder() {
  const invalidate = usePurchaseInvalidation();
  return useMutation({
    mutationFn: async ({ header, items }: { header: PurchaseOrderBody; items: PurchaseOrderItemBody[] }) => {
      const created = await purchaseApi.create(header);
      try {
        for (const item of items) await purchaseApi.addItem(created.id, item);
      } catch (error) {
        await purchaseApi.remove(created.id).catch(() => undefined);
        throw error;
      }
      return created;
    },
    onSuccess: () => invalidate(),
  });
}

export function useUpdatePurchaseOrder(id: string) {
  const invalidate = usePurchaseInvalidation();
  return useMutation({
    mutationFn: (body: Partial<PurchaseOrderBody>) => purchaseApi.update(id, body),
    onSuccess: () => invalidate(id),
  });
}

export function useAddPurchaseOrderItem(id: string) {
  const invalidate = usePurchaseInvalidation();
  return useMutation({
    mutationFn: (body: PurchaseOrderItemBody) => purchaseApi.addItem(id, body),
    onSuccess: () => invalidate(id),
  });
}

export function useDeletePurchaseOrder() {
  const invalidate = usePurchaseInvalidation();
  return useMutation({
    mutationFn: (id: string) => purchaseApi.remove(id),
    onSuccess: () => invalidate(),
  });
}
