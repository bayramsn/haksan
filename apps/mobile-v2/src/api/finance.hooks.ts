import { collectPaginated } from './pagination';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { PaymentCreateInput } from '@haksan/shared';
import type { Paginated } from './client';
import { finance, opportunities, quotes, reports, type AccountingInvoice } from './endpoints';
import { financeApi, type AccountingInvoiceBody, type PaymentUpdateBody } from './finance.api';
import { hideUndeliveredExpected, mergeCashMovements } from '@/src/ui/finance/cash-movements';

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

const LOAD_ALL_PAGE_SIZE = 200;

async function loadAll<T>(fetchPage: (page: number) => Promise<Paginated<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page += 1) {
    const result = await fetchPage(page);
    rows.push(...result.data);
    if (page >= result.meta.totalPages) break;
  }
  return rows;
}

/**
 * Alacağın teklifi → bağlı fırsat teslim edildi mi? Web store gibi toplu çekilir:
 * tüm teklifler (opportunityId) + teslim aşamasındaki fırsatlar. Kayıt başına istek
 * atılmaz; API'nin dakika sınırına takılıp sessizce yanlış sonuç üretmesin.
 * ponytail: kullanıcının göremediği fırsata bağlı alacak "teslim edilmemiş" sayılır
 * (web bulamadığında gösterir); fark gerekirse tüm fırsatlar `view: 'all'` ile çekilir.
 */
async function stagesByQuote(rows: readonly { quoteId?: string | null }[]): Promise<Map<string, string>> {
  const needed = new Set(rows.map((row) => row.quoteId).filter((id): id is string => Boolean(id)));
  if (!needed.size) return new Map();
  const [allQuotes, delivered] = await Promise.all([
    loadAll((page) => quotes.list({ page, pageSize: LOAD_ALL_PAGE_SIZE })),
    loadAll((page) => opportunities.list({ stageCode: 'delivered', view: 'all', page, pageSize: LOAD_ALL_PAGE_SIZE })),
  ]);
  const deliveredIds = new Set(delivered.map((row) => row.id));
  const stages = new Map<string, string>();
  for (const quote of allQuotes) {
    if (!needed.has(quote.id) || !quote.opportunityId) continue;
    stages.set(quote.id, deliveredIds.has(quote.opportunityId) ? 'delivered' : 'open');
  }
  return stages;
}

/**
 * Web "Kasa Hareketleri" alacak + ödemeleri tek listede gösterir ve tüm KPI'ları
 * bu birleşik listeden hesaplar; aynı sonuç için iki kaynak da tamamen yüklenir.
 */
export function useCashMovements() {
  return useQuery({
    queryKey: [...financeKeys.receivables, 'cash-movements'],
    queryFn: async () => {
      const [receivables, payments] = await Promise.all([
        loadAll((page) => finance.receivables({ page, pageSize: LOAD_ALL_PAGE_SIZE })),
        loadAll((page) => finance.payments({ page, pageSize: LOAD_ALL_PAGE_SIZE })),
      ]);
      return mergeCashMovements(hideUndeliveredExpected(receivables, await stagesByQuote(receivables)), payments);
    },
  });
}

function useFinanceInvalidation() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['finance'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
}

export function useUpdatePayment(id: string) {
  const invalidate = useFinanceInvalidation();
  return useMutation({
    mutationFn: (body: PaymentUpdateBody) => financeApi.updatePayment(id, body),
    onSuccess: () => invalidate(),
  });
}

export function useDeletePayment() {
  const invalidate = useFinanceInvalidation();
  return useMutation({
    mutationFn: (id: string) => financeApi.deletePayment(id),
    onSuccess: () => invalidate(),
  });
}

export function useCompanyStatement(companyId: string, range: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['finance', 'statement', companyId, range],
    queryFn: () => financeApi.companyStatement(companyId, range),
    enabled: Boolean(companyId),
  });
}

export function usePaymentTermSuggestion(companyId: string, quoteId?: string) {
  return useQuery({
    queryKey: ['finance', 'payment-term-suggestion', companyId, quoteId ?? null],
    queryFn: () => financeApi.paymentTermSuggestion({ companyId, quoteId }),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });
}

/** Web: kategori sunucu filtresi, tür ve arama istemci tarafı; KPI tüm satırlardan. */
export function useAllAccountingInvoices(invoiceCategory: 'commercial' | 'administrative') {
  return useQuery({
    queryKey: ['finance', 'invoices', 'all', invoiceCategory],
    queryFn: async () => {
      const rows: AccountingInvoice[] = [];
      for (let page = 1; ; page += 1) {
        const result = await financeApi.invoicesPage({ page, pageSize: LOAD_ALL_PAGE_SIZE, invoiceCategory });
        rows.push(...result.data);
        if (page * result.pageSize >= result.total || result.data.length === 0) break;
      }
      return rows;
    },
  });
}

export function useCreateAccountingInvoice() {
  const invalidate = useFinanceInvalidation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AccountingInvoiceBody) => financeApi.createAccountingInvoice(body),
    onSuccess: async () => {
      await Promise.all([invalidate(), qc.invalidateQueries({ queryKey: ['inventory'] })]);
    },
  });
}

export function useUpdateAccountingInvoice(id: string) {
  const invalidate = useFinanceInvalidation();
  return useMutation({
    mutationFn: (body: Partial<AccountingInvoiceBody>) => financeApi.updateAccountingInvoice(id, body),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteAccountingInvoice() {
  const invalidate = useFinanceInvalidation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => financeApi.deleteAccountingInvoice(id),
    onSuccess: async () => {
      await Promise.all([invalidate(), qc.invalidateQueries({ queryKey: ['inventory'] })]);
    },
  });
}

/** Ödeme detayındaki "Fiş / Fatura" listesi: firmaya bağlı dosyalar. */
export function useCompanyFiles(companyId: string) {
  return useQuery({
    queryKey: ['finance', 'company-files', companyId],
    queryFn: () => collectPaginated((page) => financeApi.companyFiles(companyId, { page, pageSize: 50 })),
    enabled: Boolean(companyId),
    select: (page) => page.data,
  });
}
