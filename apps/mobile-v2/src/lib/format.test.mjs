import assert from 'node:assert/strict';
import test from 'node:test';
import { dayLabel, dueLabel, formatAmount, formatCompact, greeting, relativeTime } from './format.ts';

test('KPI kutusuna sığacak şekilde kısaltır', () => {
  assert.equal(formatCompact(22184674), '22,2 Mn');
  assert.equal(formatCompact(1500), '1,5 B');
  assert.equal(formatCompact(2_400_000_000), '2,4 Mr');
});

test('eşiğin altında kısaltmaz', () => {
  assert.equal(formatCompact(0), '0');
  assert.equal(formatCompact(999), '999');
});

test('negatif değerler de kısaltılır', () => {
  assert.equal(formatCompact(-22184674), '-22,2 Mn');
});

test('selamlama saate göre değişir', () => {
  const at = (h) => greeting(new Date(2026, 0, 1, h));
  assert.equal(at(3), 'İyi geceler');
  assert.equal(at(9), 'Günaydın');
  assert.equal(at(14), 'İyi günler');
  assert.equal(at(21), 'İyi akşamlar');
});

test('göreli zaman eşiklere göre değişir', () => {
  const now = new Date(2026, 4, 20, 12, 0, 0);
  const ago = (ms) => relativeTime(new Date(now.getTime() - ms), now);
  assert.equal(ago(30_000), 'az önce');
  assert.equal(ago(5 * 60_000), '5 dk önce');
  assert.equal(ago(2 * 3_600_000), '2 saat önce');
  assert.equal(ago(3 * 86_400_000), '3 gün önce');
});

test('gün etiketi takvim gününe bakar, 24 saate değil', () => {
  const now = new Date(2026, 4, 20, 0, 10, 0);
  assert.equal(dayLabel(new Date(2026, 4, 20, 0, 5), now), 'Bugün');
  // 25 dakika önce ama takvimde dün:
  assert.equal(dayLabel(new Date(2026, 4, 19, 23, 45), now), 'Dün');
});

test('vade gecikmeyi işaretler', () => {
  const now = new Date(2026, 4, 20);
  assert.deepEqual(dueLabel(new Date(2026, 4, 15), now), { text: '5 gün gecikti', overdue: true });
  assert.deepEqual(dueLabel(new Date(2026, 4, 20), now), { text: 'Bugün', overdue: false });
  assert.deepEqual(dueLabel(new Date(2026, 4, 25), now), { text: '5 gün kaldı', overdue: false });
});

test('boş para değeri tire döner, sayı biçimlenir', () => {
  assert.equal(formatAmount(null), '—');
  assert.equal(formatAmount(''), '—');
  assert.match(formatAmount('1250.5'), /1\.250,5/);
});
