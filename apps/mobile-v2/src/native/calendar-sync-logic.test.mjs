import assert from 'node:assert/strict';
import test from 'node:test';
import { allDayKey, buildDeviceEvents, commandHash, droppedCalendars, eventKey, planUpsert, prelinkByContent, syncWindow } from './calendar-sync-logic.ts';

const at = new Date('2026-10-27T10:00:00.000Z');
const yes = () => true;
const device = (over = {}) => ({
  id: 'e1', calendarId: 'c1', title: 'Ziyaret', notes: '', location: null,
  startDate: '2026-10-28T09:00:00.000Z', endDate: '2026-10-28T10:00:00.000Z',
  allDay: false, timeZone: 'Europe/Istanbul', recurrenceRule: null, ...over,
});
const command = (over = {}) => ({
  crmEventId: 'crm-1', externalCalendarId: 'c1', externalEventId: 'e1', occurrenceId: '',
  title: 'Ziyaret', description: null, location: null,
  startsAt: '2026-10-28T09:00:00.000Z', endsAt: '2026-10-28T10:00:00.000Z',
  allDay: false, timezone: 'Europe/Istanbul', modifiedAt: '2026-10-20T00:00:00.000Z', ...over,
});

test('değişmeyen etkinlik eski modifiedAt ve crm eşlemesini korur, değişen gözlem anını alır', () => {
  const key = eventKey('c1', 'e1');
  const first = buildDeviceEvents([device()], {}, at);
  assert.equal(first.payload[0].modifiedAt, at.toISOString());
  const state = { [key]: { ...first.nextState[key], modifiedAt: '2026-10-01T00:00:00.000Z', crmEventId: 'crm-1' } };
  const later = new Date('2026-10-27T12:00:00.000Z');
  assert.equal(buildDeviceEvents([device()], state, later).payload[0].modifiedAt, '2026-10-01T00:00:00.000Z');
  assert.equal(buildDeviceEvents([device()], state, later).payload[0].crmEventId, 'crm-1');
  assert.equal(buildDeviceEvents([device({ title: 'Ertelendi' })], state, later).payload[0].modifiedAt, later.toISOString());
});

test('planUpsert: aynı içerik link, farklı içerik update, salt okunur/tekrarlayan/yok atlanır', () => {
  const present = new Map([[eventKey('c1', 'e1'), device()]]);
  assert.equal(planUpsert(command(), present, {}, yes).kind, 'link');
  assert.equal(planUpsert(command({ title: 'Yeni' }), present, {}, yes).kind, 'update');
  assert.equal(planUpsert(command({ title: 'Yeni' }), present, {}, () => false).kind, 'skip');
  assert.equal(planUpsert(command({ recurrenceRule: 'FREQ=WEEKLY' }), present, {}, yes).kind, 'skip');
  assert.equal(planUpsert(command({ externalEventId: 'gone' }), present, {}, yes).kind, 'skip');
});

test('planUpsert: bağlantısız komut hedef takvimde bir kez oluşturulur', () => {
  const create = command({ externalEventId: null });
  assert.deepEqual(planUpsert(create, new Map(), {}, yes), { kind: 'create', calendarId: 'c1' });
  const key = eventKey('c1', 'new-1');
  const state = { [key]: { hash: commandHash(create), modifiedAt: create.modifiedAt, crmEventId: 'crm-1' } };
  assert.equal(planUpsert(create, new Map([[key, device({ id: 'new-1' })]]), state, yes).kind, 'skip');
});

test('tüm gün: Android UTC gece yarısı ile CRM yerel gece yarısı aynı gün sayılır', () => {
  assert.equal(allDayKey('2026-10-28T00:00:00.000Z'), '2026-10-28');
  const local = new Date(2026, 9, 28); // yerel gece yarısı
  assert.equal(allDayKey(local), '2026-10-28');
});

test('ilk tur: aynı içerikli CRM etkinliği eşleştirilir, kopya açılmaz', () => {
  const state = prelinkByContent([device()], [{ id: 'crm-9', title: 'Ziyaret', startsAt: '2026-10-28T09:00:00.000Z', endsAt: '2026-10-28T10:00:00.000Z', allDay: false }], {});
  assert.equal(state[eventKey('c1', 'e1')].crmEventId, 'crm-9');
});

test('düşüş koruması: kayıtların yarısından fazlası kaybolan takvim yakalanır', () => {
  const previous = Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [eventKey('c1', `e${n}`), { hash: '', modifiedAt: '' }]));
  assert.deepEqual(droppedCalendars(previous, [], ['c1']), ['c1']);
  assert.deepEqual(droppedCalendars(previous, [1, 2, 3, 4].map((n) => device({ id: `e${n}` })), ['c1']), []);
});

test('syncWindow UTC ay aralığı ve 35 gün okuma payı', () => {
  const w = syncWindow(at, 6, 6);
  assert.equal(w.from.toISOString(), '2026-04-27T10:00:00.000Z');
  assert.equal(w.to.toISOString(), '2027-04-27T10:00:00.000Z');
  assert.ok(w.readFrom < w.from && w.readTo > w.to);
});
