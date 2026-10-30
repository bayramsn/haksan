import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(fetch) {
  let scope = { divisionId: 'cnc', departmentId: 'sales' }, revision = 0;
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('./client.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const mocks = {
    '@/src/auth/scope': { activeScope: () => scope, scopeRevision: () => revision },
    '@/src/lib/serverMessage': { serverMessage: () => undefined },
    './auth-schemas': { authRefreshResponseSchema: { safeParse: data => ({ success: true, data }) } },
    './config': { apiBaseUrl: () => 'https://test.invalid/api' },
  };
  vm.runInNewContext(source, { exports, require: name => mocks[name], fetch, URL, AbortController, setTimeout, clearTimeout, Date, Error, Math });
  return { api: exports, change: () => { scope = { ...scope, divisionId: 'sac' }; revision++; } };
}
const ok = data => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('response from old division is rejected instead of entering current cache', async () => {
  const pending = deferred(); const h = harness(() => pending.promise);
  const request = h.api.request('/products'); await new Promise(setImmediate); h.change(); pending.resolve(ok({ data: ['cnc'] }));
  await assert.rejects(request, error => error instanceof h.api.RequestScopeChangedError);
});

test('a delayed 429 is not retried with another division header', async () => {
  let calls = 0; const pending = deferred(); const h = harness(() => { calls++; return pending.promise; });
  const request = h.api.request('/products'); await new Promise(setImmediate); h.change(); pending.resolve(new Response('', { status: 429 }));
  await assert.rejects(request, error => error instanceof h.api.RequestScopeChangedError); assert.equal(calls, 1);
});

test('refresh preserves same-session requests but cannot install a token after account switch', async () => {
  const pending = deferred(); const h = harness(() => pending.promise);
  await h.api.setAccessToken('first-account'); const refresh = h.api.refreshSession();
  await new Promise(setImmediate); await h.api.setAccessToken('second-account'); pending.resolve(ok({ accessToken: 'old-refresh' }));
  await assert.rejects(refresh, error => error instanceof h.api.RequestScopeChangedError);
  assert.equal(h.api.accessTokenSnapshot(), 'second-account');
});

test('successful same-session refresh retries request using refreshed token', async () => {
  const seen = []; const h = harness(async (url, opts) => {
    seen.push(opts.headers.Authorization);
    if (url.endsWith('/auth/refresh')) return ok({ accessToken: 'refreshed' });
    return seen.length === 1 ? new Response('', { status: 401 }) : ok({ ready: true });
  });
  await h.api.setAccessToken('expired');
  assert.equal((await h.api.request('/products')).ready, true);
  assert.deepEqual(seen, ['Bearer expired', 'Bearer expired', 'Bearer refreshed']);
});
