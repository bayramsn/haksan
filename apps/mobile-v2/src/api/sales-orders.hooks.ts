import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { inventoryKeys } from './inventory.hooks';
import { salesOrdersApi, type SalesOrderInput, type SalesOrderItemInput } from './sales-orders.api';

function invalidateSalesOrders(qc: QueryClient, id?: string) {
  if (id) void qc.invalidateQueries({ queryKey: inventoryKeys.salesOrder(id) });
  void qc.invalidateQueries({ queryKey: ['sales-orders'] });
  void qc.invalidateQueries({ queryKey: ['quotes'] });
  void qc.invalidateQueries({ queryKey: ['dashboard'] });
}

export function useCreateSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SalesOrderInput) => salesOrdersApi.create(body),
    onSettled: () => invalidateSalesOrders(qc),
  });
}

export function useUpdateSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<SalesOrderInput> }) => salesOrdersApi.update(id, body),
    onSettled: (_data, _error, variables) => invalidateSalesOrders(qc, variables.id),
  });
}

export function useDeleteSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => salesOrdersApi.remove(id),
    onSuccess: (_data, id) => qc.removeQueries({ queryKey: inventoryKeys.salesOrder(id) }),
    onSettled: () => invalidateSalesOrders(qc),
  });
}

export function useAddSalesOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SalesOrderItemInput }) => salesOrdersApi.addItem(id, body),
    onSettled: (_data, _error, variables) => invalidateSalesOrders(qc, variables.id),
  });
}
