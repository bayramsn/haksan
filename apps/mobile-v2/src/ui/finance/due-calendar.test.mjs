import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agendaItems,
  dayKey,
  groupByDay,
  isFinanceAdmin,
  isOverdue,
  monthGrid,
  nextSevenDays,
  shiftMonth,
  sumByCurrency,
  visibleDueItems,
} from './due-calendar.ts';

const item = (id, dueDate, amount, type = 'borc', currencyCode = 'USD') => ({ id, dueDate, amount, currencyCode, type });

test('admin olmayan kullanıcıdan tedarikçi ödemeleri (alacak) gizlenir', () => {
  const rows = [item('a', '2026-10-01T00:00:00', 10), item('b', '2026-10-02T00:00:00', 20, 'alacak')];
  assert.deepEqual(visibleDueItems(rows, false).map((row) => row.id), ['a']);
  assert.deepEqual(visibleDueItems(rows, true).map((row) => row.id), ['a', 'b']);
});

test('finans admini yalnız admin veya super_admin rolüdür', () => {
  assert.equal(isFinanceAdmin(['admin']), true);
  assert.equal(isFinanceAdmin(['super_admin']), true);
  assert.equal(isFinanceAdmin(['finance']), false);
  assert.equal(isFinanceAdmin(undefined), false);
});

test('ay ızgarası pazartesiden başlar ve 7 hücrelik haftalara bölünür', () => {
  const weeks = monthGrid({ year: 2026, month: 9 });
  assert.ok(weeks.every((week) => week.length === 7));
  // 1 Ekim 2026 perşembe → 3 boş hücre
  assert.deepEqual(weeks[0].slice(0, 4), [null, null, null, { day: 1, key: '2026-10-01' }]);
  const days = weeks.flat().filter(Boolean);
  assert.equal(days.length, 31);
});

test('ay gezintisi yıl sınırını geçer', () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
});

test('günlere gruplama yalnız aktif ayı alır; ajanda tarih sonra tutara göre sıralı', () => {
  const rows = [
    item('a', '2026-10-05T09:00:00', 10),
    item('b', '2026-10-05T09:00:00', 50),
    item('c', '2026-11-01T09:00:00', 70),
  ];
  const byDay = groupByDay(rows, { year: 2026, month: 9 });
  assert.equal(byDay.size, 1);
  assert.deepEqual(agendaItems(byDay, '2026-10-05', []).map((row) => row.id), ['b', 'a']);
  assert.deepEqual(agendaItems(byDay, '2026-10-06', []), []);
});

test('seçili gün yoksa önümüzdeki 7 gün kullanılır', () => {
  const now = new Date(2026, 9, 15, 12);
  const rows = [
    item('today', new Date(2026, 9, 15, 8).toISOString(), 1),
    item('in6', new Date(2026, 9, 21, 8).toISOString(), 1),
    item('in7', new Date(2026, 9, 22, 8).toISOString(), 1),
    item('past', new Date(2026, 9, 14, 8).toISOString(), 1),
  ];
  const next = nextSevenDays(rows, now);
  assert.deepEqual(next.map((row) => row.id), ['today', 'in6']);
  assert.deepEqual(agendaItems(new Map(), null, next).map((row) => row.id), ['today', 'in6']);
});

test('gecikme bugünün başına göre; para birimleri ayrı toplanır', () => {
  const now = new Date(2026, 9, 15, 12);
  assert.equal(isOverdue({ dueDate: new Date(2026, 9, 14, 23).toISOString() }, now), true);
  assert.equal(isOverdue({ dueDate: new Date(2026, 9, 15, 1).toISOString() }, now), false);
  const text = sumByCurrency([item('a', '', 1000), item('b', '', 500, 'borc', 'EUR'), item('c', '', 250)]);
  assert.match(text, /USD/);
  assert.match(text, /EUR/);
  assert.equal(text.split(' · ').length, 2);
  assert.equal(dayKey(new Date(2026, 0, 3)), '2026-01-03');
});
