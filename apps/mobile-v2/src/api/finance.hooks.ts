import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { PaymentCreateInput } from '@haksan/shared';
import { finance, reports } from './endpoints';

export {
  monthlyTotals,
  monthlyTotalsByCurrency,
  type CurrencyMonthlyTotals,
  type MonthlyTotal,
} from './finance-trends';

const PAGE_SIZE = 50;

export const financeKeys = {
  receivables: ['finance', 'receivables'] as const,
  receivable: (id: string): QueryKey => ['finance', 'receivables', 'detail', id],
  receivableSummary: ['finance', 'receivables', 'summary'] as const,
  payments: (direction?: 'in' | 'out'): QueryKey => ['finance', 'payments', direction ?? 'all'],
  payment: (id: string): QueryKey => ['finance', 'payments', 'detail', id],
  paymentSummary: ['finance', 'payments', 'summary'] as const,
  invoices: (type?: string): QueryKey => ['finance', 'invoices', type ?? 'all'],
  invoice: (id: string): QueryKey => ['finance', 'invoices', 'detail', id],
  balances: ['finance', 'balances'] as const,
  dueDates: (range: { from?: string; to?: string }): QueryKey => ['finance', 'due-dates', range],
  completedPayments: (range: { from?: string; to?: string }): QueryKey => ['finance', 'completed-payments', range],
};

export function useReceivables() {
  return useInfiniteQuery({
    queryKey: financeKeys.receivables,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => finance.receivables({ page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.meta.total ?? 0 }),
  });
}

export function useReceivableSummary() {
  return useQuery({ queryKey: financeKeys.receivableSummary, queryFn: () => finance.receivableSummary() });
}

export function useReceivable(id: string) {
  return useQuery({ queryKey: financeKeys.receivable(id), queryFn: () => finance.receivable(id), enabled: Boolean(id) });
}

/** Yeni alacak kaydı (web CreatePaymentPlanDialog'un tek taksit karşılığı). */
export function useCreateReceivable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Parameters<typeof finance.createReceivable>[0],
    ) => finance.createReceivable(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: financeKeys.receivables });
      void qc.invalidateQueries({ queryKey: financeKeys.receivableSummary });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function usePayments(direction?: 'in' | 'out') {
  return useInfiniteQuery({
    queryKey: financeKeys.payments(direction),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => finance.payments({ page: pageParam, pageSize: PAGE_SIZE, direction }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.meta.total ?? 0 }),
  });
}

export function usePaymentSummary() {
  return useQuery({ queryKey: financeKeys.paymentSummary, queryFn: () => finance.paymentSummary() });
}

export function usePayment(id: string) {
  return useQuery({ queryKey: financeKeys.payment(id), queryFn: () => finance.payment(id), enabled: Boolean(id) });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PaymentCreateInput) => finance.createPayment(input),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['finance', 'payments'] }),
        qc.invalidateQueries({ queryKey: financeKeys.paymentSummary }),
        qc.invalidateQueries({ queryKey: financeKeys.balances }),
      ]);
    },
  });
}

export function useAccountingInvoices(type?: 'sales' | 'purchase') {
  return useInfiniteQuery({
    queryKey: financeKeys.invoices(type),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => finance.invoices({ page: pageParam, pageSize: PAGE_SIZE, type }),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    select: (data) => ({ items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.total ?? 0 }),
  });
}

export function useAccountingInvoice(id: string) {
  return useQuery({ queryKey: financeKeys.invoice(id), queryFn: () => finance.invoice(id), enabled: Boolean(id) });
}

export function useFinanceStatusAction(kind: 'receivable' | 'payment', id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: string) => kind === 'receivable'
      ? finance.updateReceivableStatus(id, status)
      : finance.updatePaymentStatus(id, status),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: kind === 'receivable' ? financeKeys.receivable(id) : financeKeys.payment(id) }),
        qc.invalidateQueries({ queryKey: ['finance', kind === 'receivable' ? 'receivables' : 'payments'] }),
      ]);
    },
  });
}

export function useCancelAccountingInvoice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => finance.cancelInvoice(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: financeKeys.invoice(id) }),
        qc.invalidateQueries({ queryKey: ['finance', 'invoices'] }),
      ]);
    },
  });
}

/** Cari rapor: sunucu tüm firmaları tek seferde döndürüyor, sayfalama yok. */
export function useCustomerBalances() {
  return useQuery({ queryKey: financeKeys.balances, queryFn: () => finance.customerBalances() });
}

export function useDueDates(range: { from?: string; to?: string } = {}) {
  return useQuery({ queryKey: financeKeys.dueDates(range), queryFn: () => finance.dueDates(range) });
}

/**
 * `/reports/completed-payments`: tarih aralığındaki tüm kasa hareketleri (tahsilat +
 * ödeme). Aylık trend grafikleri (Tahsilatlar özeti, Raporlar) bunu kullanır.
 */
export function useCompletedPayments(range: { from?: string; to?: string }) {
  return useQuery({
    queryKey: financeKeys.completedPayments(range),
    queryFn: () => reports.completedPayments(range),
  });
}
