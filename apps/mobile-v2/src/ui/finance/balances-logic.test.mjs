import test from 'node:test';
import assert from 'node:assert/strict';
import { agingState, balanceKpis, bucketTotal, openDebtForRow, safeFileName, statementBalances } from './balances-logic.ts';

const aging = (worstBucket, maxOverdueDays, buckets, overdueTotal = []) => ({
  byCurrency: [{ currencyCode: 'USD', current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, openTotal: 0, ...buckets }],
  worstBucket,
  maxOverdueDays,
  overdueTotal,
});

const row = (companyName, currencies, rowAging, nearestDueDate = null) => ({
  companyName,
  borc: 0,
  nearestDueDate,
  currencies,
  aging: rowAging,
});

test('KPI: açık borç ve net bakiye para birimi bazında; gecikmiş ve 7 gün sayılır', () => {
  const now = new Date(2026, 9, 15);
  const rows = [
    row('A', [{ currencyCode: 'USD', borc: 100, net: 80 }], aging('d1_30', 10, { d1_30: 100, openTotal: 100 }, [{ currencyCode: 'USD', amount: 100 }]), new Date(2026, 9, 18).toISOString()),
    row('B', [{ currencyCode: 'EUR', borc: 40, net: 40 }], aging('current', 0, { current: 40, openTotal: 40 })),
  ];
  const kpi = balanceKpis(rows, now);
  assert.equal(kpi.companies, 2);
  assert.deepEqual(kpi.openDebt, [{ currencyCode: 'USD', amount: 100 }, { currencyCode: 'EUR', amount: 40 }]);
  assert.equal(kpi.overdueCount, 1);
  assert.deepEqual(kpi.overdueTotals, [{ currencyCode: 'USD', amount: 100 }]);
  assert.equal(kpi.dueSoonCount, 1);
});

test('yaşlandırma ısı haritası etiketi', () => {
  assert.equal(agingState({ aging: null }).label, 'Açık alacak yok');
  assert.equal(agingState({ aging: aging('current', 0, { current: 10, openTotal: 10 }) }).label, 'Güncel');
  const late = agingState({ aging: aging('d90_plus', 120, { d90_plus: 10, openTotal: 10 }) });
  assert.equal(late.label, '120 gün gecikmiş');
  assert.equal(late.tone, 'danger');
  assert.equal(late.index, 4);
  assert.equal(bucketTotal(aging('d1_30', 5, { d1_30: 7 }), 'd1_30'), 7);
});

test('açık borç negatif bakiyeyi saymaz', () => {
  assert.equal(openDebtForRow({ currencies: [{ borc: 50 }, { borc: -20 }], borc: 0 }), 50);
  assert.equal(openDebtForRow({ currencies: [], borc: 12 }), 12);
});

test('ekstre bakiyesi para birimi bazında son satır bakiyesini alır', () => {
  const lines = [
    { id: '1', date: '2026-01-01', debit: 100, credit: 0, balance: 100, currencyCode: 'USD' },
    { id: '2', date: '2026-02-01', debit: 0, credit: 30, balance: 70, currencyCode: 'USD' },
    { id: '3', date: '2026-02-01', debit: 10, credit: 0, balance: 10, currencyCode: null },
  ];
  const balances = statementBalances(lines, [], 'EUR');
  assert.deepEqual(balances, [
    { currencyCode: 'USD', debit: 100, credit: 30, balance: 70 },
    { currencyCode: 'EUR', debit: 10, credit: 0, balance: 10 },
  ]);
  assert.deepEqual(statementBalances([], [{ currencyCode: 'TRY', borc: 5, alacak: 1, net: 4 }], null), [
    { currencyCode: 'TRY', debit: 5, credit: 1, balance: 4 },
  ]);
  assert.equal(safeFileName('A/B: C'), 'A-B- C');
});
