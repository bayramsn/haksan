import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function linkedFile(list) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('./commercial-docs.hooks.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  vm.runInNewContext(source, { exports, require: name => name === '@tanstack/react-query' ? { useQuery: options => options } : name === './commercial-docs.api' ? { fileLinksApi: { list } } : {}, Error });
  return exports.useLinkedFile;
}

test('document file metadata is found on later pages and stops after the target', async () => {
  const pages = [];
  const hook = linkedFile(async ({ page }) => {
    pages.push(page);
    return { data: [{ fileId: page === 2 ? 'target-file' : 'other-file', file: { originalFilename: 'contract.pdf' } }], meta: { page, totalPages: 3 } };
  });
  assert.equal((await hook('target-file').queryFn()).file.originalFilename, 'contract.pdf');
  assert.deepEqual(pages, [1, 2]);
  assert.equal(hook('target-file', false).enabled, false);
});

test('a missing file returns null only after the last page; failed reads stay errors', async () => {
  const hook = linkedFile(async ({ page }) => ({ data: [{ fileId: 'other' }], meta: { page, totalPages: 2 } }));
  assert.equal(await hook('missing').queryFn(), null);
  const failing = linkedFile(async () => { throw new Error('offline'); });
  await assert.rejects(failing('target').queryFn(), /offline/);
});
