import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { EMPTY_PRODUCT_FORM } from './product-form.ts';
function harness(stored = new Map()) {
  let context = 'alice'; const writes = []; class RequestScopeChangedError extends Error {}
  const mocks = {
    'expo-crypto': { CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_algorithm, value) => createHash('sha256').update(value).digest('hex') },
    '@/src/security/secure-store': { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'unlocked', getItemAsync: async key => stored.get(key) ?? null, setItemAsync: async (key, value, options) => { writes.push({ key, options }); stored.set(key, value); }, deleteItemAsync: async key => stored.delete(key) },
    '@/src/api/client': { requestContextKey: () => context, RequestScopeChangedError }, './product-form': { EMPTY_PRODUCT_FORM },
  };
  const exports = {}; const source = ts.transpileModule(readFileSync(new URL('./product-create-draft.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  vm.runInNewContext(source, { exports, require: name => mocks[name], Error, JSON });
  return { api: exports, writes, stored, change: () => { context = 'bob'; }, RequestScopeChangedError };
}
const draft = { scope: 'api|tenant|alice|cnc|sales', operationId: '11111111-1111-4111-8111-111111111111', form: { ...EMPTY_PRODUCT_FORM, modelCode: 'M1' }, specs: [], standardText: '', optionalText: '', originalEquipment: [], detailsDirty: false, createBody: { modelCode: 'M1' } };
test('reopening restores same operation UUID and frozen payload from secure storage', async () => {
  const first = harness(); await first.api.writePendingProductCreate(draft);
  const reopened = harness(first.stored); const recovered = await reopened.api.readPendingProductCreate(draft.scope);
  assert.equal(recovered.operationId, draft.operationId); assert.equal(recovered.form.modelCode, 'M1'); assert.equal(recovered.createBody.modelCode, 'M1');
  assert.equal(first.writes[0].options.keychainAccessible, 'unlocked'); assert.ok(!first.writes[0].key.includes('alice'));
  assert.equal(await reopened.api.readPendingProductCreate('api|tenant|bob|cnc|sales'), null);
  assert.equal(await reopened.api.readPendingProductCreate('api|tenant|alice|sac|sales'), null);
  await reopened.api.clearPendingProductCreate(draft.scope); assert.equal(await reopened.api.readPendingProductCreate(draft.scope), null);
});
test('a scope switch during async draft read rejects the old draft', async () => {
  const h = harness(); await h.api.writePendingProductCreate(draft); const read = h.api.readPendingProductCreate(draft.scope); h.change();
  await assert.rejects(read, error => error instanceof h.RequestScopeChangedError);
});
test('invalid stored payload cannot silently start a fresh operation', async () => {
  const h = harness(); await h.api.writePendingProductCreate(draft); const key = [...h.stored.keys()][0]; h.stored.set(key, '{broken');
  await assert.rejects(h.api.readPendingProductCreate(draft.scope), /okunamadı/);
});
