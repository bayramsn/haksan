import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { collectPaginated } from './pagination.ts';
const modules = '../' + '../app/(tabs)/(home,companies,opportunities,calendar,modules)/modules/';

function initializer(file, name, bindings) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) expression = node.initializer?.getText(ast); ts.forEachChild(node, visit); }
  visit(ast); assert.ok(expression, name);
  const exports = {};
  const code = ts.transpileModule(`exports.value = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, useQuery: options => options, collectPaginated, ...bindings });
  return exports.value;
}
const page = (number, first, second) => ({ data: number === 1 ? first : second, meta: { page: number, pageSize: 50, total: first.length + second.length, totalPages: 2 } });

function allQuoteQuery(list, query = { opportunityId: 'opportunity' }) {
  const source = readFileSync(new URL('./quotes.hooks.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const exports = {}, mocks = { '@tanstack/react-query': { useQuery: options => options }, './endpoints': { quotes: { list } }, './pagination': { collectPaginated } };
  vm.runInNewContext(code, { exports, require: name => mocks[name] ?? {}, Date });
  return exports.useAllQuoteList(query);
}

test('complete opportunity quotes include later approved rows for WIN and payment defaults', async () => {
  const requests = [];
  const query = allQuoteQuery(async input => { requests.push(input); return page(input.page, [{ id: 'new', status: { code: 'draft' } }], [{ id: 'sold', status: { code: 'approved' }, grandTotal: '250' }]); });
  const result = query.select(await query.queryFn());
  assert.equal(result.items.find(row => row.status.code === 'approved').id, 'sold');
  assert.deepEqual(requests.map(row => row.page), [1, 2]);
  assert.ok(requests.every(row => row.opportunityId === 'opportunity'));
});

test('revision search remains complete even when first search page has no exact document number', async () => {
  const query = allQuoteQuery(async input => page(input.page, [{ id: 'similar', documentNo: 'ABC-100' }], [{ id: 'revision', documentNo: 'ABC-10' }]), { search: 'ABC-10' });
  const result = query.select(await query.queryFn());
  assert.deepEqual(Array.from(result.items.filter(row => row.documentNo === 'ABC-10'), row => row.id), ['revision']);
});

test('later quote failure never publishes a partial set for business decisions', async () => {
  const query = allQuoteQuery(async input => { if (input.page === 2) throw new Error('offline'); return page(1, [{ id: 'draft' }], [{ id: 'approved' }]); });
  await assert.rejects(query.queryFn(), /offline/);
});

test('product stock query traverses search pages before exact product filter', async () => {
  const requests = []; const product = { id: 'product', modelCode: 'MODEL' };
  const query = initializer(modules + 'products/[id].tsx', 'stocks', { id: product.id, data: product, inventoryApi: { list: async input => { requests.push(input); return page(input.page, [{ id: 'wrong', product: { id: 'other' } }], [{ id: 'correct', product }]); } } });
  const stocks = { data: query.select(await query.queryFn()) };
  const filtered = initializer(modules + 'products/[id].tsx', 'productStocks', { data: product, stocks });
  assert.deepEqual(Array.from(filtered, row => row.id), ['correct']);
  assert.deepEqual(requests.map(row => row.page), [1, 2]); assert.ok(requests.every(row => row.search === 'MODEL'));
});

for (const [variable, api, flat] of [['devicesQuery', 'devices', false], ['receivablesQuery', 'receivables', false], ['paymentsQuery', 'payments', false], ['invoicesQuery', 'invoices', true]]) {
  test(`company ${variable} includes later rows and retains company filter`, async () => {
    const calls = []; const fetch = async input => { calls.push(input); return flat ? { data: [{ id: `row-${input.page}` }], page: input.page, pageSize: 1, total: 2 } : page(input.page, [{ id: 'row-1' }], [{ id: 'row-2' }]); };
    const query = initializer(modules + 'companies/[id].tsx', variable, { id: 'company', tab: 'cari', devices: { list: fetch }, finance: { [api]: fetch } });
    const result = await query.queryFn();
    assert.deepEqual(Array.from(result.data, row => row.id), ['row-1', 'row-2']); assert.ok(calls.every(row => row.companyId === 'company'));
  });
}
