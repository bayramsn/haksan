import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { invoiceListQuery, dueDatesQuery } from './financeQueries';
import { financeService } from '../../lib/services';

vi.mock('../../lib/services', () => ({ financeService: { accountingInvoices: vi.fn(), dueDates: vi.fn() } }));
const scope = ['tenant-1', 'user-1', 'division-1', 'department-1'] as const;
afterEach(() => vi.clearAllMocks());

it('loads invoices after200 with flat pagination metadata while retaining category/type', async () => {
  vi.mocked(financeService.accountingInvoices).mockImplementation(async (query) => ({
    data: [{ id: `invoice-${query?.page}` }], page: query?.page, pageSize: 200, total: 201,
  }));
  const result = await invoiceListQuery(scope, 'administrative', 'purchase').queryFn();
  expect(result.map((row) => row.id)).toEqual(['invoice-1', 'invoice-2']);
  expect(financeService.accountingInvoices).toHaveBeenLastCalledWith({ page: 2, pageSize: 200, invoiceCategory: 'administrative', type: 'purchase' });
});

it('a later invoice page error rejects instead of returning a partial list', async () => {
  vi.mocked(financeService.accountingInvoices).mockImplementation(async (query) => {
    if (query?.page === 2) throw new Error('network failed');
    return { data: [{ id: 'invoice-1' }], page: 1, pageSize: 200, total: 201 };
  });
  await expect(invoiceListQuery(scope, 'commercial', 'all').queryFn()).rejects.toThrow('network failed');
});

it('invoice cache keys distinguish account, division, department, category and type', () => {
  const base = invoiceListQuery(scope, 'commercial', 'sales').queryKey;
  for (const next of [
    invoiceListQuery(['tenant-2', 'user-1', 'division-1', 'department-1'], 'commercial', 'sales'),
    invoiceListQuery(['tenant-1', 'user-2', 'division-1', 'department-1'], 'commercial', 'sales'),
    invoiceListQuery(['tenant-1', 'user-1', 'division-2', 'department-1'], 'commercial', 'sales'),
    invoiceListQuery(['tenant-1', 'user-1', 'division-1', 'department-2'], 'commercial', 'sales'),
    invoiceListQuery(scope, 'administrative', 'sales'), invoiceListQuery(scope, 'commercial', 'purchase'),
  ]) expect(next.queryKey).not.toEqual(base);
});

it('a slow previous month cannot overwrite the selected month', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let resolveOld!: (rows: any[]) => void;
  let resolveNew!: (rows: any[]) => void;
  const oldRows = new Promise<any[]>((resolve) => { resolveOld = resolve; });
  const newRows = new Promise<any[]>((resolve) => { resolveNew = resolve; });
  vi.mocked(financeService.dueDates).mockImplementation((range) => range?.from === 'old' ? oldRows : newRows);
  const observer = new QueryObserver(client, dueDatesQuery(scope, { from: 'old', to: 'old-end' }));
  const stop = observer.subscribe(() => {});
  observer.setOptions(dueDatesQuery(scope, { from: 'new', to: 'new-end' }));
  resolveNew([{ id: 'new-month' }]);
  await vi.waitFor(() => expect(observer.getCurrentResult().data).toEqual([{ id: 'new-month' }]));
  resolveOld([{ id: 'old-month' }]);
  await oldRows;
  await Promise.resolve();
  expect(observer.getCurrentResult().data).toEqual([{ id: 'new-month' }]);
  stop(); client.clear();
});

it('a due-date request error remains an error result instead of a successful empty month', async () => {
  vi.mocked(financeService.dueDates).mockRejectedValue(new Error('denied'));
  const client = new QueryClient();
  await expect(client.fetchQuery(dueDatesQuery(scope, { from: 'a', to: 'b' }))).rejects.toThrow('denied');
  expect(client.getQueryState(dueDatesQuery(scope, { from: 'a', to: 'b' }).queryKey)?.status).toBe('error');
  client.clear();
});
