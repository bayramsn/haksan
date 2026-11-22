import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness() {
  const keys = [], exports = {};
  const code = ts.transpileModule(readFileSync(new URL('./inventory.hooks.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => name === '@tanstack/react-query' ? {
    useMutation: options => options,
    useQueryClient: () => ({ invalidateQueries: async ({ queryKey }) => { keys.push(JSON.parse(JSON.stringify(queryKey))); } }),
  } : {}, Promise });
  return { api: exports, keys };
}
test('reserving an order refreshes inventory and stock summary', async () => {
  const h = harness(); await h.api.useOrderAction('sales', 'id').onSuccess({}, 'reserve');
  assert.ok(h.keys.some(k => k[0] === 'inventory')); assert.ok(h.keys.some(k => k.join('/') === 'reports/stock-summary'));
});
test('fulfilling a sales order refreshes generated shipments', async () => {
  const h = harness(); await h.api.useOrderAction('sales', 'id').onSuccess({}, 'fulfilled');
  assert.ok(h.keys.some(k => k.join('/') === 'service/shipments'));
});
test('order from quote refreshes stock reservations and the originating quote', async () => {
  const h = harness(); await h.api.useCreateSalesOrderFromQuote().onSuccess({});
  assert.ok(h.keys.some(k => k[0] === 'inventory')); assert.ok(h.keys.some(k => k[0] === 'quotes'));
});
