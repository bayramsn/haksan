import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(mutationFn = async () => ({})) {
  let account = 'alice'; const writes = [], queued = [], alerts = [];
  class OfflineError extends Error {}
  class RequestScopeChangedError extends Error {}
  const exports = {}, source = ts.transpileModule(readFileSync(new URL('./useOfflineMutation.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const mocks = {
    'react-native': { Alert: { alert: (...args) => alerts.push(args) } },
    '@tanstack/react-query': { useMutation: options => options, useQueryClient: () => ({ cancelQueries: async () => {}, getQueryData: () => ({ secret: 'alice' }), setQueryData: (...args) => writes.push(args) }) },
    'expo-haptics': {},
    '@/src/api/client': { OfflineError, RequestTimeoutError: class extends Error {}, RequestScopeChangedError, requestContextKey: () => account },
    './queue': { queueScopeSnapshot: () => ({ userId: account }), enqueue: async (...args) => queued.push(args) },
  };
  vm.runInNewContext(source, { exports, require: name => mocks[name], Error });
  const mutation = exports.useOfflineMutation({ kind: 'company.status', mutationFn, toPayload: value => value, optimistic: { keys: [['companies']], apply: () => undefined } });
  return { mutation, writes, queued, alerts, OfflineError, RequestScopeChangedError, switchAccount: () => { account = 'bob'; } };
}

test('late optimistic rollback cannot restore previous-account customer data', async () => {
  const h = harness(); const context = await h.mutation.onMutate({}); h.switchAccount();
  h.mutation.onError(new Error('late failure'), {}, context);
  assert.equal(h.writes.length, 0); assert.equal(h.alerts.length, 0);
});

test('late offline failure cannot enqueue old request under new account', async () => {
  let reject; const pending = new Promise((_resolve, fail) => { reject = fail; });
  const h = harness(() => pending); const run = h.mutation.mutationFn({ companyId: 'old' });
  h.switchAccount(); reject(new h.OfflineError());
  await assert.rejects(run, error => error instanceof h.RequestScopeChangedError);
  assert.equal(h.queued.length, 0);
});
