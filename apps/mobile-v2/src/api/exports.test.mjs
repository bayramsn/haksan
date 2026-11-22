import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('./exports.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
test('firma Excel ve PDF çıktıları aynı tam filtreyi gönderir; PDF biçimi zorlanır', async () => {
  const calls=[], exports={};
  vm.runInNewContext(source, { exports, require: name => { assert.equal(name,'@/src/native/files'); return { downloadAndShare: async (...args) => calls.push(args) }; } });
  const query={search:'Makina',city:'İstanbul',district:'Esenyurt',divisionId:'d1',sector:'Metal',sortBy:'name',sortDir:'asc'};
  await exports.exportService.companies(query); await exports.exportService.companiesPdf(query);
  assert.equal(calls[0][0],'/exports/companies');assert.equal(calls[1][0],'/exports/companies');
  assert.equal(calls[1][1],'firmalar.pdf');assert.equal(calls[1][2].mimeType,'application/pdf');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1][2].query)),{...query,format:'pdf'});
  assert.deepEqual(query,calls[0][2].query);
  await exports.exportService.companiesPdf({format:'xlsx'});assert.equal(calls[2][2].query.format,'pdf');
});
