import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { visibleCatalog } from '../ui/products/catalog-logic.ts';
import { collectPaginated } from './pagination.ts';

function harness() {
  const auth = { user: { id: 'user-a', tenantId: 'tenant-a' }, scope: { divisionId: 'cnc', departmentId: 'sales' } };
  const calls = [];
  const products = { cnc: [{ id: 'cnc-machine', productGroup: { code: 'CNC' } }], sac: [{ id: 'laser', productGroup: { code: 'SAC_ISLEME' } }] };
  const pageOf = (rows, page, totalPages = 1) => ({ data: rows, meta: { page, pageSize: rows.length, total: totalPages, totalPages } });
  const source = ts.transpileModule(readFileSync(new URL('./products.hooks.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const exports = {};
  const mocks = {
    '@tanstack/react-query': { useQuery: options => options },
    '@/src/auth/AuthProvider': { useAuth: () => auth },
    './pagination': { collectPaginated },
    './products.api': { productsExtraApi: {
      listAll: async ({ page }) => { calls.push(auth.scope.divisionId); return pageOf(products[auth.scope.divisionId], page); },
      priceLists: async page => pageOf([{ id: `price-${page}`, name: `Liste ${page}` }], page, 2),
      catalogFiles: async (_, page) => pageOf([{ id: `file-${page}` }], page, 2),
    } },
  };
  vm.runInNewContext(source, { exports, require: name => { assert(name in mocks, name); return mocks[name]; }, Promise });
  return { auth, calls, ...exports };
}

test('changing CNC to Sac İşleme rebinds the live product observer after cache clear', async () => {
  const h = harness(), client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const observer = new QueryObserver(client, h.useAllProducts());
  const stop = observer.subscribe(() => {});
  try {
    await observer.refetch();
    assert.equal(observer.getCurrentResult().data[0].id, 'cnc-machine');
    h.auth.scope.divisionId = 'sac'; client.clear();
    observer.setOptions(h.useAllProducts()); await observer.refetch();
    assert.deepEqual(h.calls, ['cnc', 'sac']);
    assert.equal(visibleCatalog(observer.getCurrentResult().data, { roles: ['sales'], divisionCode: 'sac_isleme' })[0].id, 'laser');
  } finally { stop(); client.clear(); }
});

test('catalog keys distinguish tenant, user, department and division; no signed-out fetch', () => {
  const h = harness(); const keys = [h.useAllProducts().queryKey];
  h.auth.scope.departmentId = 'service'; keys.push(h.useAllProducts().queryKey);
  h.auth.scope.divisionId = 'sac'; keys.push(h.useAllProducts().queryKey);
  h.auth.user.id = 'user-b'; keys.push(h.useAllProducts().queryKey);
  h.auth.user.tenantId = 'tenant-b'; keys.push(h.useAllProducts().queryKey);
  assert.equal(new Set(keys.map(key => JSON.stringify(key))).size, keys.length);
  h.auth.user = null; assert.equal(h.useAllProducts().enabled, false);
});

test('price lists and catalog files include pages beyond the first API page', async () => {
  const h = harness();
  assert.deepEqual((await h.useScopedPriceLists().queryFn()).data.map(row => row.id), ['price-1', 'price-2']);
  assert.deepEqual((await h.useCatalogFiles('tenant-a').queryFn()).data.map(row => row.id), ['file-1', 'file-2']);
});
