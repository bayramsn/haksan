import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const ts = require(path.join(root, 'node_modules/typescript/lib/typescript.js'));
function dataHelpers(filename, dependencies) {
  const code = ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', code)(module, module.exports, (id) => {
    if (id in dependencies) return dependencies[id];
    throw new Error(`Unexpected dependency ${id}`);
  });
  return module.exports;
}
const companies = dataHelpers('./companyServerData.ts', {
  '@tanstack/react-query': {}, '../../lib/auth': {}, '../../lib/services': {}, './companyNormalizer': {},
  './serverPagination': { DEFAULT_SERVER_PAGE_SIZE: 12 },
});
const contacts = dataHelpers('./contactServerData.ts', { '../../lib/services': {} });
test('companies always open oldest first independently of requested page and filters', () => {
  for (const sortMode of [undefined, 'default', 'created_asc']) {
    const params = companies.buildCompanyListParams({ page: 4, city: 'Ankara', sortMode });
    assert.equal(params.sortBy, 'createdAt');
    assert.equal(params.sortDir, 'asc');
    assert.equal(params.page, 4);
    assert.equal(params.city, 'Ankara');
  }
});
test('every company data header maps to a server field in both directions', () => {
  for (const field of ['name', 'type', 'contact', 'city', 'created']) {
    for (const direction of ['asc', 'desc']) {
      const params = companies.buildCompanyListParams({ page: 1, sortMode: `${field}_${direction}` });
      assert.equal(params.sortBy, field === 'created' ? 'createdAt' : field);
      assert.equal(params.sortDir, direction);
    }
  }
});
test('every contact header carries its sort to server pagination without losing filters', () => {
  for (const sortBy of ['name', 'company', 'title', 'communication', 'createdAt']) {
    for (const sortDir of ['asc', 'desc']) {
      const params = contacts.buildContactListParams({ page: 3, search: '  Ayşe  ', companyId: 'company-1', department: 'Satış', primaryOnly: true, divisionId: 'division-1', sortBy, sortDir });
      assert.equal(params.sortBy, sortBy);
      assert.equal(params.sortDir, sortDir);
      assert.equal(params.page, 3);
      assert.equal(params.companyId, 'company-1');
      assert.equal(params.search, 'Ayşe');
      assert.equal(params.isPrimary, 'true');
    }
  }
});
