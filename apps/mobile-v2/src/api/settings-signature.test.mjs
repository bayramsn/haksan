import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness(response) {
  const calls = [], exports = {};
  const status = response ?? { signatureImage: 'data:image/png;base64,fixture', signatureFilename: 'signature.png', email: 'private@example.test', defaultSignature: 'Private profile' };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./settings.api.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports,
    require: name => { assert.equal(name, '@/src/api/client'); return { request: async (path, options) => { calls.push({ path, options }); return path === '/mail/account/users' ? [{ id: 'user', name: 'Person', hasMailAccount: true }] : status; } }; },
  });
  return { api: exports.settingsApi, calls, status };
}
test('admin signature listing, reading and saving use current account endpoints and project response shape', async () => {
  const { api, calls, status } = harness();
  assert.equal((await api.mailSignatureUsers())[0].id, 'user');
  const value = await api.mailUserSignature('user');
  assert.equal(value.image, status.signatureImage); assert.equal(value.filename, status.signatureFilename);
  assert.deepEqual(Object.keys(value).sort(), ['filename', 'image']);
  const body = { image: null, filename: null };
  const saved = await api.mailSaveUserSignature('user', body);
  assert.equal(saved.image, status.signatureImage);
  assert.deepEqual(calls.map(call => call.path), ['/mail/account/users', '/mail/account/users/user', '/mail/account/users/user/signature/image']);
  assert.equal(calls[2].options.method, 'PUT'); assert.equal(calls[2].options.body, body);
});
test('accounts without image signatures produce explicit empty image fields', async () => {
  const { api } = harness({ configured: false });
  const read = await api.mailUserSignature('user');
  const saved = await api.mailSaveUserSignature('user', { image: null, filename: null });
  for (const result of [read, saved]) { assert.equal(result.image, null); assert.equal(result.filename, null); }
});
