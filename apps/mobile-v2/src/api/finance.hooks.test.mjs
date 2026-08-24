import assert from 'node:assert/strict';
import test from 'node:test';
import { monthlyTotals, monthlyTotalsByCurrency } from './finance-trends.ts';

const now = new Date();
const paymentDate = new Date(now.getFullYear(), now.getMonth(), 15).toISOString();
const row = (id, amount, currencyCode, direction = 'in') => ({
  id,
  companyId: 'company-1',
  direction,
  amount: String(amount),
  paymentDate,
  company: { id: 'company-1', legalTitle: 'Firma', shortName: null },
  status: null,
  currency: currencyCode ? { id: `currency-${currencyCode}`, code: currencyCode } : null,
});

test('aylık ödeme trendi farklı para birimlerini tek toplama karıştırmaz', () => {
  const groups = monthlyTotalsByCurrency([
    row('try-1', 100, 'TRY'),
    row('usd-1', 50, 'USD'),
    row('eur-out', 25, 'EUR', 'out'),
  ], 6, 'in');

  assert.deepEqual(groups.map(({ currencyCode, total }) => ({ currencyCode, total })), [
    { currencyCode: 'TRY', total: 100 },
    { currencyCode: 'USD', total: 50 },
  ]);
});

test('tek para birimi filtresi yalnız istenen kovayı toplar', () => {
  const months = monthlyTotals([
    row('usd-1', 10, 'USD'),
    row('usd-2', 20, 'usd'),
    row('try-1', 30, 'TRY'),
  ], 2, 'in', 'USD');

  assert.equal(months.reduce((sum, month) => sum + month.total, 0), 30);
});

test('lookup değeri olmayan eski kayıtlar TRY kovasında, tutarı olmayan aylar sıfır kalır', () => {
  const groups = monthlyTotalsByCurrency([row('legacy', 40, null)], 3, 'in');
  assert.equal(groups[0]?.currencyCode, 'TRY');
  assert.equal(groups[0]?.total, 40);
  assert.equal(groups[0]?.months.length, 3);
  assert.equal(groups[0]?.months.filter((month) => month.total === 0).length, 2);
});
