import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompanyTimeline } from './timeline-logic.ts';

test('geçmiş: kaynakları birleştirir ve yeniden eskiye sıralar', () => {
  const items = buildCompanyTimeline({
    activities: [
      {
        id: 'a1',
        subject: 'Ziyaret',
        description: 'açıklama',
        result: null,
        activityDate: '2026-10-02T10:00:00Z',
        type: { name: 'Müşteri Ziyareti' },
        createdByUser: { fullName: 'Ali' },
      },
    ],
    taskEvents: [
      { id: 'e1', taskId: 't1', taskTitle: 'Teklif hazırla', summary: 'Görev tamamlandı', createdAt: '2026-10-05T10:00:00Z', actorName: null },
    ],
    quotes: [{ id: 'q1', documentNo: 'TKL-1', quoteDate: '2026-09-01', status: { name: 'Taslak' } }],
    opportunities: [
      { id: 'o1', title: 'Lazer', createdAt: '2026-10-03T00:00:00Z', requestedMachine: 'Fiber' },
      { id: 'o2', title: 'Tarihsiz', createdAt: null },
    ],
  });
  assert.deepEqual(
    items.map((item) => item.id),
    ['task-event:e1', 'opportunity:o1', 'activity:a1', 'quote:q1'],
  );
  assert.equal(items[0].type, 'Görev');
  assert.equal(items[0].route, '/(tabs)/modules/tasks/t1');
  assert.equal(items[2].description, 'açıklama');
  assert.equal(items[2].meta, 'Ali');
});

test('geçmiş: boş kaynakta boş liste', () => {
  assert.deepEqual(buildCompanyTimeline({}), []);
});
