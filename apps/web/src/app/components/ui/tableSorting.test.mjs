import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTableValues, tableDate, tableNumber } from './tableSorting.ts';

const sorted = (values, direction = 'asc', type = 'auto') => [...values].sort((a, b) => compareTableValues(a, b, direction, type));
test('numeric currencies sort by value rather than formatted text', () => {
  assert.deepEqual(sorted(['2.000,00 EUR', '150,50 EUR', '12.000,00 EUR']), ['150,50 EUR', '2.000,00 EUR', '12.000,00 EUR']);
  assert.deepEqual(sorted([9, 100, 20], 'desc'), [100, 20, 9]);
});
test('Turkish letters and model numbers follow Turkish natural order', () => {
  assert.deepEqual(sorted(['Şahin', 'Çelik', 'Can', 'Ünal', 'Öz', 'Orhan'], 'asc', 'text'), ['Can', 'Çelik', 'Orhan', 'Öz', 'Şahin', 'Ünal']);
  assert.deepEqual(sorted(['VM 10', 'VM 2', 'VM 1']), ['VM 1', 'VM 2', 'VM 10']);
});
test('calendar values use chronology in both directions', () => {
  assert.deepEqual(sorted(['01.01.2026', '31.12.2025', '06.11.2026']), ['31.12.2025', '01.01.2026', '06.11.2026']);
  assert.deepEqual(sorted(['2025-12-31T20:00:00Z', '2026-01-01T20:00:00Z'], 'desc', 'date'), ['2026-01-01T20:00:00Z', '2025-12-31T20:00:00Z']);
  assert.equal(tableDate('31.02.2026'), null);
});
test('empty and missing values stay at the end in either direction', () => {
  assert.deepEqual(sorted([undefined, 'B', null, 'A', '—']), ['A', 'B', null, '—', undefined]);
  assert.ok(compareTableValues(null, 'A', 'desc') > 0);
  assert.equal(compareTableValues('—', null), 0);
});
test('numeric parsing handles negative values, decimals and currencies without treating models as numbers', () => {
  assert.equal(tableNumber('-1.234,50 €'), -1234.5);
  assert.equal(tableNumber('$1,234.50'), 1234.5);
  assert.equal(tableNumber('9,5'), 9.5);
  assert.equal(tableNumber('VM 10'), null);
  assert.equal(tableNumber('2026-11-06'), null);
  assert.equal(tableNumber(Number.NaN), null);
});
test('text sort remains textual for explicit text columns', () => {
  assert.ok(compareTableValues('2 USD', '10 EUR', 'asc', 'text') < 0);
  assert.equal(compareTableValues('ANKARA', 'ankara', 'asc', 'text'), 0);
});

test('Turkish short and full month dates sort chronologically', () => {
  assert.deepEqual(sorted(['06 Kas 2026', '15 Ocak 2026', '28 Şub. 2025']), ['28 Şub. 2025', '15 Ocak 2026', '06 Kas 2026']);
  assert.equal(tableDate('31 Şubat 2026'), null);
  assert.equal(tableDate('01 Ağu 2026'), tableDate('01.08.2026'));
});

test('technical numeric columns compare values independently of measurement suffixes', () => {
  assert.deepEqual(sorted(['9,5 kW', '9,12 kW', '10 kW']), ['9,12 kW', '9,5 kW', '10 kW']);
  assert.equal(tableNumber('15.000 dev/dk'), 15000);
  assert.equal(tableNumber('VM 10 kW'), null);
});
