import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_TASK_FILTERS, TASK_VIEWS, buildTaskListQuery, taskSummaryLine } from './task-logic.ts';

test('görev sorgusu: boş filtreler gönderilmez, oluşturulma azalan', () => {
  assert.deepEqual(buildTaskListQuery({ view: 'mine', search: '  ', filters: EMPTY_TASK_FILTERS, sortBy: 'dueAt' }), {
    view: 'mine',
    sortBy: 'dueAt',
    sortDir: 'asc',
  });
  assert.deepEqual(
    buildTaskListQuery({
      view: 'all',
      search: ' teklif ',
      filters: { status: 'todo', priority: 'urgent', assignedToUserId: 'u1', createdBy: 'u2' },
      sortBy: 'createdAt',
    }),
    {
      view: 'all',
      search: 'teklif',
      status: 'todo',
      priority: 'urgent',
      assignedToUserId: 'u1',
      createdBy: 'u2',
      sortBy: 'createdAt',
      sortDir: 'desc',
    },
  );
});

test('ekip özeti satırı web metniyle aynı', () => {
  assert.equal(taskSummaryLine({ open: 3, overdue: 0, completed: 5 }), '3 açık · 5 tamamlanan');
  assert.equal(taskSummaryLine({ open: 3, overdue: 1, completed: 5 }), '3 açık · 1 geciken · 5 tamamlanan');
});

test('görünüm sırası web ile aynı', () => {
  assert.deepEqual(TASK_VIEWS.map((view) => view.value), ['all', 'mine', 'today', 'overdue', 'upcoming', 'history']);
});
