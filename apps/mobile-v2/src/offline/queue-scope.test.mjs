import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness(updateStatus = async () => {}) {
  const exports = {}, stored = new Map();
  const source = ts.transpileModule(readFileSync(new URL('./queue.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  // queue.ts artık quotes/inventory replay import eder; scope testleri yalnız company.status kullanır.
  const mocks = {
    '@/src/security/secure-store': { getItemAsync: async key => stored.get(key), setItemAsync: async (key, value) => { stored.set(key, value); }, deleteItemAsync: async key => { stored.delete(key); } },
    '@/src/api/client': { ApiError: class extends Error {}, OfflineError: class extends Error {} },
    '@/src/api/endpoints': { companies: { updateStatus }, inventoryApi: { reserve: async () => ({}) } },
    '@/src/api/quotes.api': { quotesApi: { create: async () => ({ id: 'q' }), addItem: async () => ({}), terms: async () => ({}) }, quoteOpportunityApi: { create: async () => ({ id: 'o' }), changeStage: async () => ({}) } },
    '@/src/ui/documents/quote-logic': { itemsNetTotal: () => 0 },
    './failure': { classifyFailure: () => 'retry' },
  };
  vm.runInNewContext(source, { exports, require: name => mocks[name], Date, Error, Set, Map });
  return exports;
}
const scope = { apiOrigin: 'https://test.invalid', tenantId: 'tenant', userId: 'alice', divisionId: 'cnc', departmentId: 'sales' };
const payload = index => ({ id: '11111111-1111-4111-8111-111111111111', customerStatusCode: 'active', operationId: `22222222-2222-4222-8222-22222222222${index}` });

test('flush stops before remaining old-account writes when owner switches in flight', async () => {
  let finish, started; const entered = new Promise(r => { started = r; }); const calls = [];
  const q = harness(async (...args) => { calls.push(args); started(); await new Promise(r => { finish = r; }); });
  q.setQueueScope(scope); await q.enqueue('company.status', payload(1)); await q.enqueue('company.status', payload(2));
  const flush = q.flushQueue(); await entered;
  q.setQueueScope({ ...scope, userId: 'bob' }); finish(); await flush;
  assert.equal(calls.length, 1);
  q.setQueueScope(scope); assert.equal(q.pendingCount(), 1);
});

test('enqueue rejects an earlier account or division snapshot', async () => {
  const q = harness(); q.setQueueScope(scope); const original = q.queueScopeSnapshot();
  q.setQueueScope({ ...scope, divisionId: 'sac' });
  await assert.rejects(q.enqueue('company.status', payload(1), original), /alanı değişti/);
  assert.equal(q.pendingCount(), 0);
});

test('listQueuedMutations returns scoped rows newest first', async () => {
  const q = harness();
  q.setQueueScope(scope);
  await q.enqueue('company.status', payload(1));
  await q.enqueue('company.status', payload(2));
  const listed = q.listQueuedMutations();
  assert.equal(listed.length, 2);
  assert.ok(Date.parse(listed[0].createdAt) >= Date.parse(listed[1].createdAt));
});

test('inventory.reserve enqueue validates uuid payload', async () => {
  const q = harness();
  q.setQueueScope(scope);
  await q.enqueue('inventory.reserve', {
    operationId: '33333333-3333-4333-8333-333333333333',
    id: '11111111-1111-4111-8111-111111111111',
    companyId: '44444444-4444-4444-8444-444444444444',
  });
  assert.equal(q.pendingCount(), 1);
  assert.equal(q.listQueuedMutations()[0].kind, 'inventory.reserve');
});
