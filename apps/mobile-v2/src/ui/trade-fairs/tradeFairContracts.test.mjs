import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { tradeFairContactCreateSchema } from '@haksan/shared';
import { emptyContactForm } from './tradeFairLogic.ts';

const divisionId = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';

function harness() {
  const calls = [], exports = {};
  const source = readFileSync(new URL('../../api/trade-fairs.api.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports,
    require: (name) => {
      if (name === './pagination') return {};
      assert.equal(name, '@/src/api/client');
      return { request: async (path, options) => { calls.push({ path, options }); return { id: 'record' }; } };
    },
  });
  return { api: exports.tradeFairsApi, calls };
}

test('new contact requires a real division and retains selected CRM product ids', async () => {
  const form = { ...emptyContactForm('WIN Eurasia'), companyName: 'ABC Makina', contactName: 'Ahmet Yılmaz', notes: 'Lazer talebi' };
  assert.equal(tradeFairContactCreateSchema.safeParse(form).success, false);
  const parsed = tradeFairContactCreateSchema.parse({ ...form, divisionId, productModelIds: [productId] });
  const { api, calls } = harness();
  await api.create(parsed);
  assert.equal(calls[0].path, '/trade-fairs');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.body.divisionId, divisionId);
  assert.deepEqual(calls[0].options.body.productModelIds, [productId]);
  assert.equal('customerConverted' in calls[0].options.body, false);
});

test('called and quoted use independent server flag endpoints, including clearing flags', async () => {
  const { api, calls } = harness();
  await api.setCalled('record', true);
  await api.setQuoted('record', false);
  assert.deepEqual(calls.map(({ path, options }) => [path, options.method, JSON.stringify(options.body)]), [
    ['/trade-fairs/record/called', 'PATCH', '{"called":true}'],
    ['/trade-fairs/record/quoted', 'PATCH', '{"quoted":false}'],
  ]);
});

test('division picker and searchable product selector use dedicated tradefair read contracts', async () => {
  const { api, calls } = harness();
  await api.divisions();
  await api.products(divisionId, 'Fiber');
  assert.equal(calls[0].path, '/trade-fairs/divisions');
  assert.equal(calls[1].path, '/trade-fairs/products');
  assert.equal(calls[1].options.query.divisionId, divisionId);
  assert.equal(calls[1].options.query.q, 'Fiber');
});

test('CRM conversion posts real company/contact or opportunity creation requests', async () => {
  const { api, calls } = harness();
  const companyBody = { companyId: 'company', divisionIds: [divisionId] };
  const opportunityBody = { qualificationStage: 'b', divisionId };
  await api.toCompany('record', companyBody);
  await api.toOpportunity('record', opportunityBody);
  assert.deepEqual(calls.map(({ path, options }) => [path, options.method]), [
    ['/trade-fairs/record/company', 'POST'], ['/trade-fairs/record/opportunity', 'POST'],
  ]);
  assert.equal(calls[0].options.body, companyBody);
  assert.equal(calls[1].options.body, opportunityBody);
});
