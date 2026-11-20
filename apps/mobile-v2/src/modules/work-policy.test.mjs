import test from 'node:test';
import assert from 'node:assert/strict';
import { selectWorkKind, roleWorkDefault, workPreferenceKey } from './work-policy.ts';

test('work preference respects revoked permission and assignment priority', () => {
  assert.equal(selectWorkKind(['sales', 'service'], 'finance', { service: 3 }), 'service');
  assert.equal(selectWorkKind(['sales', 'service'], 'sales', { service: 3 }), 'sales');
  assert.equal(selectWorkKind(['service', 'sales'], undefined, { service: 2, sales: 2 }), 'sales');
  assert.equal(selectWorkKind([]), null);
});
test('work preference is isolated by user, tenant and working scope', () => {
  const base = workPreferenceKey('u', 't', null, null);
  for (const args of [['v', 't', null, null], ['u', 's', null, null], ['u', 't', 'd', null], ['u', 't', null, 'p']]) {
    assert.notEqual(workPreferenceKey(...args), base);
  }
});

test('personal tasks and approval queues participate without bypassing read access', () => {
  assert.equal(selectWorkKind(['tasks', 'approvals', 'service'], undefined, { tasks: 2, approvals: 3, service: 1 }), 'approvals');
  assert.equal(selectWorkKind(['tasks', 'service'], 'approvals', { approvals: 99, tasks: 2 }), 'tasks');
  assert.equal(selectWorkKind(['tasks', 'sales'], undefined, { tasks: 1, sales: 1 }), 'sales');
});

test('empty queues use the user role without overriding permission or real assignments', () => {
  assert.equal(roleWorkDefault(['service']), 'service');
  assert.equal(roleWorkDefault(['stock']), 'operations');
  assert.equal(roleWorkDefault(['finance']), 'finance');
  assert.equal(selectWorkKind(['tasks', 'service'], undefined, {}, roleWorkDefault(['service'])), 'service');
  assert.equal(selectWorkKind(['tasks'], undefined, {}, 'service'), 'tasks');
  assert.equal(selectWorkKind(['tasks', 'service'], undefined, { tasks: 1 }, 'service'), 'tasks');
});
