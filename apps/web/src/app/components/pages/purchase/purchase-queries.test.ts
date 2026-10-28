import { describe, expect, it, vi } from 'vitest';
import { purchaseOrderService, productService } from '../../../../lib/services';
import { purchaseOrdersQuery, purchaseProductsQuery, purchaseTotals } from './purchase-queries';
vi.mock('../../../../lib/services', () => ({ purchaseOrderService: { list: vi.fn() }, productService: { list: vi.fn() } }));
describe('complete purchase order reads', () => {
  it('includes the 101st order and preserves explicit pages', async () => {
    vi.mocked(purchaseOrderService.list).mockImplementation(async query => ({ data: [{ id: `order-${query?.page}` }], meta: { page: Number(query?.page), pageSize: 100, total: 101, totalPages: 2 } }));
    expect((await purchaseOrdersQuery({ department: 'sales' }).queryFn()).data.map(row => row.id)).toEqual(['order-1', 'order-2']);
  });
  it('does not return a plausible partial list after page2 failure', async () => {
    vi.mocked(purchaseOrderService.list).mockImplementation(async query => {
      if (query?.page === 2) throw Error('offline');
      return { data: [{ id: 'first' }], meta: { page: 1, pageSize: 100, total: 101, totalPages: 2 } };
    });
    await expect(purchaseOrdersQuery({}).queryFn()).rejects.toThrow('offline');
  });
  it('separates query identities and purchase totals by real currency', () => {
    expect(purchaseOrdersQuery({ department: 'sales' }).queryKey).not.toEqual(purchaseOrdersQuery({ department: 'service' }).queryKey);
    expect(purchaseTotals([{ grandTotal: '100', currency: { code: 'USD' } }, { grandTotal: '50', currency: { code: 'EUR' } }, { grandTotal: 25, currency: { code: 'USD' } }])).toEqual([{ currencyCode: 'USD', amount: 125 }, { currencyCode: 'EUR', amount: 50 }]);
  });
});

it('purchase product selector includes models on the second page', async () => {
  vi.mocked(productService.list).mockImplementation(async query => ({ data: [{ id: `model-${query?.page}` }], meta: { page: Number(query?.page), pageSize: 200, total: 201, totalPages: 2 } }));
  expect((await purchaseProductsQuery({}, true).queryFn()).data.map(row => row.id)).toEqual(['model-1', 'model-2']);
  expect(purchaseProductsQuery({}, false).enabled).toBe(false);
});
