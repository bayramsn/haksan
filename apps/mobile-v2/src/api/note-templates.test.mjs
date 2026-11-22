import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function queryWith(permissions, scope) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./note-templates.hooks.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require: name => ({
      '@tanstack/react-query': { useQuery: options => options },
      '@/src/auth/AuthProvider': { useCan: permission => permissions.includes(permission) },
      './client': { request: async (path, options) => ({ path, options }) },
    })[name] ?? {},
  });
  return exports.useNoteTemplates(scope);
}
test('service-only readers can load shared quote and service notes, never restricted document scopes', async () => {
  for (const scope of ['quote', 'service_quote']) {
    const query = queryWith(['service_tickets.read'], scope);
    assert.equal(query.enabled, true);
    const call = await query.queryFn();
    assert.equal(call.path, '/note-templates'); assert.equal(call.options.query.scope, scope);
  }
  for (const scope of ['quote_terms', 'proforma_terms', 'contract_terms', 'other']) assert.equal(queryWith(['service_tickets.read'], scope).enabled, false);
});
test('quote readers retain all template scopes; users without read permission perform no template query', () => {
  for (const scope of ['quote', 'service_quote', 'contract_terms']) {
    assert.equal(queryWith(['quotes.read'], scope).enabled, true);
    assert.equal(queryWith([], scope).enabled, false);
  }
});
test('template writes preserve service scope and invalidate shared queries after successful CRUD', async () => {
  const exports = {}, calls = [], invalidations = [];
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./note-templates.hooks.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require: name => ({
      '@tanstack/react-query': { useMutation: options => options, useQueryClient: () => ({ invalidateQueries: async options => invalidations.push(options.queryKey) }) },
      '@/src/auth/AuthProvider': { useCan: () => true },
      './client': { request: async (path, options) => { calls.push({ path, options }); return { id: 'saved-template' }; } },
    })[name] ?? {},
  });
  const save = exports.useSaveNoteTemplate();
  const body = { title: 'Servis şartları', body: 'Yerinde servis', scope: 'service_quote' };
  await save.mutationFn({ body }); await save.onSuccess();
  await save.mutationFn({ id: 'saved-template', body: { ...body, title: 'Yeni başlık' } }); await save.onSuccess();
  const remove = exports.useDeleteNoteTemplate();
  await remove.mutationFn('saved-template'); await remove.onSuccess();
  assert.deepEqual(calls.map(call => [call.path, call.options.method]), [['/note-templates', 'POST'], ['/note-templates/saved-template', 'PATCH'], ['/note-templates/saved-template', 'DELETE']]);
  assert.equal(calls[0].options.body.scope, 'service_quote');
  assert.equal(calls[1].options.body.title, 'Yeni başlık');
  assert.equal(invalidations.length, 3);
  assert.ok(invalidations.every(key => key[0] === 'note-templates'));
});
