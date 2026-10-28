import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness(updateStatus = async () => {}) {
  const exports = {}, stored = new Map();
  const source = ts.transpileModule(readFileSync(new URL('./queue.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const mocks = {
    '@/src/security/secure-store': { getItemAsync: async key => stored.get(key), setItemAsync: async (key, value) => { stored.set(key, value); }, deleteItemAsync: async key => { stored.delete(key); } },
    '@/src/api/client': { ApiError: class extends Error {}, OfflineError: class extends Error {} },
    '@/src/api/endpoints': { companies: { updateStatus } },
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
