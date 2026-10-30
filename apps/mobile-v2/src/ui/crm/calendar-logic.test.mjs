import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarImportSelection,
  normalizeEventType,
  periodLabel,
  todayEventCount,
  upcomingEvents,
  validateCalendarFile,
} from './calendar-logic.ts';

test('takvim dosyası doğrulaması', () => {
  assert.equal(validateCalendarFile({ name: 'takvim.ics', size: 1000 }), null);
  assert.equal(validateCalendarFile({ name: 'TAKVIM.ICAL', size: null }), null);
  assert.equal(validateCalendarFile({ name: 'liste.xlsx', size: 10 }), 'Yalnız .ics veya .ical dosyası seçin.');
  assert.equal(validateCalendarFile({ name: 'big.ics', size: 11 * 1024 * 1024 }), 'Dosya 10 MB sınırını aşıyor.');
});

test('içe aktarma seçimi: pencere filtresi', () => {
  const events = [{ uid: 'a', inWindow: true }, { uid: 'b', inWindow: false }];
  assert.deepEqual(calendarImportSelection(events, true).map((e) => e.uid), ['a']);
  assert.equal(calendarImportSelection(events, false).length, 2);
});

test('dönem etiketi: web metinleri', () => {
  const cursor = new Date(2026, 9, 15);
  assert.equal(periodLabel('month', cursor), 'Ekim 2026');
  assert.equal(periodLabel('day', cursor), '15 Ekim 2026 Perşembe');
  assert.equal(periodLabel('week', cursor), '12 Eki — 18 Eki 2026');
  assert.equal(periodLabel('list', cursor), 'Geçmiş 6 ay · Gelecek 6 ay');
});

test('tür normalizasyonu: eski mobil kodları sunucu türlerine çevirir', () => {
  assert.equal(normalizeEventType('meeting'), 'meeting');
  assert.equal(normalizeEventType('customer_visit'), 'customer_visit');
  assert.equal(normalizeEventType('visit'), 'customer_visit');
  assert.equal(normalizeEventType('service'), 'other');
  assert.equal(normalizeEventType(undefined), 'other');
});

test('yaklaşanlar: arşivlenen ve bitenler hariç, sıralı', () => {
  const now = new Date('2026-10-15T10:00:00Z');
  const events = [
    { id: 'b', startsAt: '2026-10-16T09:00:00Z', endsAt: '2026-10-16T10:00:00Z' },
    { id: 'a', startsAt: '2026-10-15T09:30:00Z', endsAt: '2026-10-15T11:00:00Z' },
    { id: 'past', startsAt: '2026-10-14T09:00:00Z', endsAt: '2026-10-14T10:00:00Z' },
    { id: 'arch', startsAt: '2026-10-17T09:00:00Z', endsAt: '2026-10-17T10:00:00Z', deletedAt: '2026-10-10T00:00:00Z' },
  ];
  assert.deepEqual(upcomingEvents(events, now).map((e) => e.id), ['a', 'b']);
  assert.deepEqual(upcomingEvents(events, now, 1).map((e) => e.id), ['a']);
});

test('bugünkü etkinlik sayısı arşivi saymaz', () => {
  const now = new Date(2026, 9, 15, 12);
  const events = [
    { startsAt: new Date(2026, 9, 15, 9).toISOString(), endsAt: new Date(2026, 9, 15, 10).toISOString() },
    { startsAt: new Date(2026, 9, 15, 14).toISOString(), endsAt: new Date(2026, 9, 15, 15).toISOString(), deletedAt: 'x' },
    { startsAt: new Date(2026, 9, 16, 9).toISOString(), endsAt: new Date(2026, 9, 16, 10).toISOString() },
  ];
  assert.equal(todayEventCount(events, now), 1);
});
