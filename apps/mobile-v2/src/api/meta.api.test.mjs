import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as normalize from '../ui/meta/metaNormalize.ts';
import { collectArrayPages } from './pagination.ts';

function harness(request) {
  const exports = {};
  const mocks = {
    './pagination': { collectArrayPages },
    '@/src/api/client': { request, ApiError: class extends Error {}, OfflineError: class extends Error {} },
    '@/src/ui/meta/metaNormalize': normalize,
  };
  const source = ts.transpileModule(readFileSync(new URL('./meta.api.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  vm.runInNewContext(source, { exports, require: name => { assert(name in mocks, name); return mocks[name]; }, Date, Error, Number });
  return exports.metaApi;
}

test('insights include the entire date range after the first 100 daily/campaign rows', async () => {
  const calls = [];
  const api = harness(async (path, opts) => {
    calls.push({ path, ...opts.query });
    return Array.from({ length: opts.query.page === 1 ? 100 : 1 }, (_, i) => ({ id: `${opts.query.page}-${i}`, spend: '1', insightDate: '2026-10-27' }));
  });
  const params = { connectionId: 'connection', from: '2026-01-01', to: '2026-10-27' };
  const result = await api.insights(params);
  assert.equal(result.length, 101);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].connectionId, params.connectionId);
  assert.equal(calls[1].from, params.from);
  assert.equal(calls[1].page, 2);
});

test('Meta message history includes older pages and stays chronological', async () => {
  const api = harness(async (_, opts) => Array.from({ length: opts.query.page === 1 ? 100 : 1 }, (_, i) => ({ id: `${opts.query.page}-${i}`, text: 'message' })));
  const rows = await api.messages('thread', 'connection');
  assert.equal(rows.length, 101);
  assert.equal(rows[0].id, '2-0');
  assert.equal(rows.at(-1).id, '1-0');
});

test('partial insight history is rejected on a later-page connection failure', async () => {
  const api = harness(async (_, opts) => {
    if (opts.query.page === 2) throw new Error('offline');
    return Array.from({ length: 100 }, (_, id) => ({ id }));
  });
  await assert.rejects(api.insights({ connectionId: 'connection', from: '2026-01-01', to: '2026-10-27' }), /offline/);
});
