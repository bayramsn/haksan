import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./phone-index.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, Date });
function harness() {
  let clock = 1000, session = { scope: 'a', enabled: true }, role = true, failure = false, release = null, requests = 0;
  const installed = [];
  const refresh = exports.createPhoneIndexRefresh({ session: () => session, now: () => clock, hasRole: async () => role,
    fetch: async () => { requests++; if (release) await release; if (failure) throw Error('offline'); return { entries: [] }; },
    install: async value => installed.push(value) });
  return { refresh, installed, requests: () => requests, advance: value => clock += value, session: value => session = value, role: value => role = value, fail: value => failure = value, pause: value => release = value };
}
test('refreshes before native expiry, throttles foregrounds and forces re-enable', async () => {
  const h = harness(); await h.refresh('a'); await h.refresh('a'); assert.equal(h.requests(), 1);
  assert.equal(h.installed[0].expiresAt, 1000 + 24 * 60 * 60_000);
  h.advance(12 * 60 * 60_000); await h.refresh('a'); assert.equal(h.requests(), 2);
  await h.refresh('a', true); assert.equal(h.requests(), 3);
});
test('no role or disabled scope never fetches, offline refresh retries', async () => {
  const h = harness(); h.role(false); await h.refresh('a'); assert.equal(h.requests(), 0);
  h.role(true); h.session({ scope: 'a', enabled: false }); await h.refresh('a'); assert.equal(h.requests(), 0);
  h.session({ scope: 'a', enabled: true }); h.fail(true); await assert.rejects(h.refresh('a'), /offline/);
  h.fail(false); await h.refresh('a'); assert.equal(h.installed.length, 1);
});
test('concurrent foregrounds fetch once and account change discards old results', async () => {
  const h = harness(); let resume; h.pause(new Promise(resolve => resume = resolve));
  const first = h.refresh('a'), second = h.refresh('a'); await Promise.resolve(); await Promise.resolve();
  h.session({ scope: 'b', enabled: true }); resume(); await Promise.all([first, second]);
  assert.equal(h.installed.length, 0);
  h.pause(null); await h.refresh('b'); assert.equal(h.installed[0].scope, 'b');
  const other = harness(); await Promise.all([other.refresh('a'), other.refresh('a')]); assert.equal(other.requests(), 1);
});
