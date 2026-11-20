import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionTotals, homePeriod, initialHomeSection, orderHomeMetrics } from './home-policy.ts';

test('web role priorities keep authorized metrics and do not mutate their source', () => {
  const rows = ['customers', 'sales', 'overdue', 'service', 'machines'].map((key) => ({ key }));
  assert.equal(orderHomeMetrics(rows, ['finance'])[0].key, 'overdue');
  assert.equal(orderHomeMetrics(rows, ['service'])[0].key, 'service');
  assert.deepEqual(rows.map((row) => row.key), ['customers', 'sales', 'overdue', 'service', 'machines']);
  assert.equal(initialHomeSection(['sales']), 'overview');
  assert.equal(initialHomeSection(['service']), 'operations');
});
test('collections keep exact cents and separate currencies, excluding payments sent and invalid amounts', () => {
  const row = (amount, code, direction = 'in') => ({ amount, currency: code ? { code } : null, direction });
  assert.deepEqual(collectionTotals([row('0.10', 'USD'), row('0.20', 'USD'), row('12.30', 'TRY'), row('500', 'USD', 'out'), row('bad', 'USD'), row('100', null)]), [
    { currencyCode: 'TRY', amount: '12.30' }, { currencyCode: 'USD', amount: '0.30' },
  ]);
});
test('target period follows the local calendar at a month boundary', () => {
  const now = new Date(2026, 9, 1, 0, 15);
  assert.equal(homePeriod(now).period, '2026-10');
  assert.equal(new Date(homePeriod(now).from).getDate(), 1);
});
