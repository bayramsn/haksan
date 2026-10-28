import { purchaseOrderService, productService } from '../../../../lib/services';
import { loadAllPaginated } from '../../../lib/loadAllPaginated';
type Scope = { tenantId?: string; userId?: string; division?: string | null; department?: string | null };
export function purchaseOrdersQuery(scope: Scope) {
  return {
    queryKey: ['purchase-orders', 'complete', scope.tenantId, scope.userId, scope.division, scope.department],
    queryFn: () => loadAllPaginated((page, pageSize) => purchaseOrderService.list({ page, pageSize }), 100, row => row.id),
    retry: false as const,
  };
}
export function purchaseTotals(rows: readonly { grandTotal?: string | number | null; currency?: { code?: string } | null; currencyCode?: string | null }[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const amount = Number(row.grandTotal ?? 0);
    if (!Number.isFinite(amount)) continue;
    const currency = row.currency?.code ?? row.currencyCode ?? '—';
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  return [...totals].map(([currencyCode, amount]) => ({ currencyCode, amount }));
}

export function purchaseProductsQuery(scope: Scope, enabled: boolean) {
  return {
    queryKey: ['products', 'purchase-options', scope.tenantId, scope.userId, scope.division, scope.department],
    enabled, retry: false as const,
    queryFn: () => loadAllPaginated((page, pageSize) => productService.list({ page, pageSize }), 200, row => row.id),
  };
}
