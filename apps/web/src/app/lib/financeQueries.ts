import { financeService } from '../../lib/services';
import { loadAllPaginated } from './loadAllPaginated';

export type FinanceScope = readonly [string | undefined, string | undefined, string, string | null];
export const invoiceListQuery = (scope: FinanceScope, category: string, type: string) => ({
  queryKey: ['finance', 'accounting-invoices', ...scope, category, type],
  enabled: Boolean(scope[1]),
  retry: false,
  queryFn: async () => (await loadAllPaginated<any>(async (page, pageSize) => {
    const result = await financeService.accountingInvoices({ page, pageSize, invoiceCategory: category, ...(type !== 'all' ? { type } : {}) });
    return { data: result.data, meta: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: Math.ceil(result.total / result.pageSize) } };
  }, 200, (row) => row.id)).data,
});

export const dueDatesQuery = (scope: FinanceScope, range: { from: string; to: string }) => ({
  queryKey: ['finance', 'due-dates', ...scope, range.from, range.to],
  enabled: Boolean(scope[1]),
  retry: false,
  queryFn: () => financeService.dueDates(range),
});
