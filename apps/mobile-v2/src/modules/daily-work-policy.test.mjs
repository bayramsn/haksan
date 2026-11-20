import test from 'node:test';
import assert from 'node:assert/strict';
import { prioritizeTasks, outstandingService, validWorkPreference } from './daily-work-policy.ts';
test('personal task priority keeps overdue work first and ignores finished work', () => {
  const items = [
    { id: 'future', status: 'todo', overdue: false, dueAt: '2026-10-24', priority: 'urgent' },
    { id: 'done', status: 'done', overdue: true, dueAt: '2026-10-20', priority: 'urgent' },
    { id: 'late', status: 'in_progress', overdue: true, dueAt: '2026-10-21', priority: 'normal' },
    { id: 'undated', status: 'todo', overdue: false, dueAt: null, priority: 'high' },
  ];
  assert.deepEqual(prioritizeTasks(items).map((item) => item.id), ['late', 'future', 'undated']);
  assert.equal(items.length, 4);
});
test('equal deadlines rank urgent before normal; cancelled tasks never appear', () => {
  const make = (priority, status = 'todo') => ({ priority, status, dueAt: '2026-10-22', overdue: false });
  assert.deepEqual(prioritizeTasks([make('normal'), make('urgent'), make('high', 'cancelled')]).map((item) => item.priority), ['urgent', 'normal']);
});
test('service work includes new, in-progress and waiting work but excludes finished records', () => {
  const rows = ['new', 'in_progress', 'waiting_customer', 'resolved', 'closed'].map((code) => ({ status: { code } }));
  assert.deepEqual(outstandingService(rows).map((row) => row.status.code), ['new', 'in_progress', 'waiting_customer']);
});
test('a removed permission invalidates a remembered selection', () => {
  assert.equal(validWorkPreference(['tasks', 'service'], 'sales'), false);
  assert.equal(validWorkPreference(['tasks', 'service'], 'tasks'), true);
  assert.equal(validWorkPreference(['tasks'], undefined), false);
});
