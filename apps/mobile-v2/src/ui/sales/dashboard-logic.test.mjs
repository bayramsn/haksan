import test from 'node:test';
import assert from 'node:assert/strict';
import { activityBucketLabel, briefingCounts, buildWorkSignals, CHART_RANGE_MONTHS } from './dashboard-logic.ts';

test('iş sinyalleri sıfırları atar ve önem sırasına dizer', () => {
  const signals = buildWorkSignals({
    overdueTasks: 2,
    todayTasks: 0,
    lead: { slaBreaches: 1, actionlessLeads: 4, unassignedLeads: 0 },
    overdueReceivables: null,
    openServices: 3,
    delayedCards: 5,
  });
  assert.deepEqual(
    signals.map((s) => s.id),
    ['tasks-overdue', 'lead-sla', 'cards-delayed', 'lead-actionless', 'service-open']
  );
  assert.deepEqual(signals.find((s) => s.id === 'lead-actionless')?.target, { kind: 'opportunities', focus: 'no_action' });
  assert.deepEqual(briefingCounts(signals), { total: 15, critical: 3, warning: 9 });
});

test('veri yokken sinyal üretmez', () => {
  const signals = buildWorkSignals({
    overdueTasks: null,
    todayTasks: null,
    lead: null,
    overdueReceivables: null,
    openServices: null,
    delayedCards: null,
  });
  assert.equal(signals.length, 0);
  assert.deepEqual(briefingCounts(signals), { total: 0, critical: 0, warning: 0 });
});

test('grafik aralıkları ve kova etiketleri', () => {
  assert.equal(CHART_RANGE_MONTHS['1Y'], 12);
  assert.equal(activityBucketLabel('bozuk', 'day'), 'bozuk');
  assert.match(activityBucketLabel('2026-03-04T09:00:00Z', 'hour'), /^\d{2}:00$/);
  assert.match(activityBucketLabel('2026-03-04T09:00:00Z', 'day'), /04/);
});
