import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function harness() {
 const exports = {}; const pending = []; let calls = 0;
 const modules = {
  '@/src/auth/scope': { activeScope: () => ({}) },
  '@/src/lib/serverMessage': { serverMessage: () => null },
  '@/src/security/secure-store': {}, './auth-schemas': {},
  './config': { apiBaseUrl: () => 'https://example.invalid/api/v1' },
 };
 const source = ts.transpileModule(readFileSync(new URL('./client.ts', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source, {exports, require: n => modules[n], AbortController, URL, setTimeout, clearTimeout,
 fetch: async () => { calls++; return new Promise(resolve => pending.push(() => resolve(new Response('{}', {status:200})))); }});
 return {exports, pending, calls: () => calls};
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('already aborted mutation never reaches fetch', async () => {
 const h = harness(); const controller = new AbortController(); controller.abort();
 await assert.rejects(h.exports.request('/probe', {method:'POST', signal:controller.signal}), {name:'AbortError'});
 assert.equal(h.calls(), 0);
});
test('queued caller cancellation rejects promptly and does not consume or leak a request slot', async () => {
 const h = harness();
 const requests = Array.from({length:8}, () => h.exports.request('/probe'));
 await tick(); assert.equal(h.calls(),8);
 const controller = new AbortController();
 const canceled = h.exports.request('/canceled', {method:'POST', signal:controller.signal});
 await tick(); controller.abort();
 await assert.rejects(canceled,{name:'AbortError'}); assert.equal(h.calls(),8);
 const next = h.exports.request('/next'); await tick();
 h.pending.shift()(); await tick(); assert.equal(h.calls(),9);
 while(h.pending.length) h.pending.shift()();
 await Promise.all([...requests,next]);
});
