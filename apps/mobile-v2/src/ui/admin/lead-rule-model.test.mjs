import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeSalesUsers,
  changeLeadRuleDivision,
  csvList,
  emptyLeadRuleForm,
  leadRuleFormToBody,
  leadRuleSummary,
  leadRuleToForm,
  salesUsersForDivision,
} from './lead-rule-model.ts';

const users = [
  { id: 'a', status: 'active', roles: [{ code: 'sales' }], divisions: [{ id: 'd1' }] },
  { id: 'b', status: 'active', roles: [{ code: 'sales' }], divisions: [{ id: 'd2' }] },
  { id: 'c', status: 'passive', roles: [{ code: 'sales' }], divisions: [{ id: 'd1' }] },
  { id: 'e', status: 'active', roles: [{ code: 'admin' }], divisions: [{ id: 'd1' }] },
];

test('csvList trims, drops empties and dedupes', () => {
  assert.deepEqual(csvList(' Bursa, İstanbul ,, Bursa'), ['Bursa', 'İstanbul']);
});

test('form round-trip and body normalization', () => {
  const rule = {
    name: 'Kural',
    priority: 5,
    active: false,
    divisionId: null,
    criteria: { cities: ['Bursa'], productTerms: [], sourceCodes: ['website', 'fair'] },
    assigneeUserIds: ['a'],
  };
  const form = leadRuleToForm(rule);
  assert.equal(form.divisionId, 'all');
  assert.equal(form.sources, 'website, fair');
  const body = leadRuleFormToBody({ ...form, name: '  Kural ', priority: 'x' }, false);
  assert.equal(body.name, 'Kural');
  assert.equal(body.priority, 100);
  assert.equal(body.divisionId, null);
  assert.deepEqual(body.criteria.sourceCodes, ['website', 'fair']);
  assert.equal(leadRuleFormToBody({ ...emptyLeadRuleForm(), priority: '-3' }, true).priority, 0);
  assert.equal(leadRuleFormToBody({ ...emptyLeadRuleForm(), priority: '0' }, true).priority, 100);
  assert.equal(leadRuleFormToBody({ ...emptyLeadRuleForm(), priority: '20000' }, true).priority, 10000);
});

test('summary falls back to all leads', () => {
  assert.equal(leadRuleSummary({ criteria: { cities: [], productTerms: [], sourceCodes: [] } }), 'Tüm leadler');
  assert.equal(
    leadRuleSummary({ criteria: { cities: ['Bursa'], productTerms: ['CNC'], sourceCodes: [] } }),
    'Şehir: Bursa · Ürün: CNC'
  );
});

test('sales candidates filter by status, role and division', () => {
  const sales = activeSalesUsers(users);
  assert.deepEqual(sales.map((u) => u.id), ['a', 'b']);
  assert.deepEqual(salesUsersForDivision(sales, 'd1').map((u) => u.id), ['a']);
  const next = changeLeadRuleDivision({ ...emptyLeadRuleForm(), assigneeUserIds: ['a', 'b'] }, 'd2', sales);
  assert.deepEqual(next.assigneeUserIds, ['b']);
});
