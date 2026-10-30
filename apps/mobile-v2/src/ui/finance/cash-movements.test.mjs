import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agingByCurrency,
  cashByCurrency,
  cashCounts,
  collectionTrend,
  filterCashMovements,
  hideUndeliveredExpected,
  mergeCashMovements,
  overdueDays,
  topDebtors,
  upcomingDues,
} from './cash-movements.ts';

const company = { legalTitle: 'Acme Makina A.Ş.', shortName: 'Acme' };

const receivable = (id, amount, dueDate, status = 'pending', currency = 'USD') => ({
  id,
  companyId: 'c1',
  invoiceNo: `F-${id}`,
  amount: String(amount),
  dueDate,
  notes: null,
  paymentMethod: null,
  company,
  status: { code: status },
  currency: { code: currency },
});

const payment = (id, amount, paymentDate, direction, status = 'paid', currency = 'USD') => ({
  id,
  companyId: 'c2',
  invoiceNo: null,
  direction,
  amount: String(amount),
  paymentDate,
  paymentMethod: 'bank_transfer',
  notes: 'not',
  company: { legalTitle: 'Tedarikçi', shortName: null },
  status: { code: status },
  currency: { code: currency },
});

test('alacak ve ödemeler tek listede, tarihe göre yeniden eskiye birleşir', () => {
  const rows = mergeCashMovements(
    [receivable('r1', 100, '2026-09-01')],
    [payment('p1', 50, '2026-10-01', 'out'), payment('p2', 70, '2026-08-01', 'in')],
  );
  assert.deepEqual(rows.map((row) => row.id), ['p1', 'r1', 'p2']);
  assert.equal(rows[1].source, 'receivable');
  assert.equal(rows[1].direction, 'in');
  assert.equal(rows[0].paidDate, '2026-10-01');
});

test('arama firma, fatura no ve not üzerinde; durum ve yön filtreleri birlikte çalışır', () => {
  const rows = mergeCashMovements(
    [receivable('r1', 100, '2026-09-01', 'overdue')],
    [payment('p1', 50, '2026-10-01', 'out')],
  );
  assert.equal(filterCashMovements(rows, { direction: 'all', status: 'all', search: 'acme' }).length, 1);
  assert.equal(filterCashMovements(rows, { direction: 'in', status: 'Overdue', search: '' }).length, 1);
  assert.equal(filterCashMovements(rows, { direction: 'out', status: 'Overdue', search: '' }).length, 0);
  const counts = cashCounts(rows, 'in');
  assert.deepEqual(counts.direction, { all: 2, in: 1, out: 1 });
  assert.equal(counts.status.Overdue, 1);
});

test('kasa bakiyesi para birimlerini asla toplamaz; iptal hariç', () => {
  const rows = mergeCashMovements(
    [receivable('r1', 100, '2026-09-01'), receivable('r2', 999, '2026-09-01', 'cancelled')],
    [payment('p1', 40, '2026-10-01', 'out'), payment('p2', 70, '2026-08-01', 'in', 'paid', 'EUR')],
  );
  const byCode = Object.fromEntries(cashByCurrency(rows).map((entry) => [entry.currencyCode, entry]));
  assert.equal(byCode.USD.pendingIn, 100);
  assert.equal(byCode.USD.outgoing, 40);
  assert.equal(byCode.USD.net, -40);
  assert.equal(byCode.EUR.incoming, 70);
});

test('gecikme, yaklaşan vadeler, yaşlandırma ve en yüksek borçlular', () => {
  const now = new Date(2026, 9, 15, 12);
  const rows = mergeCashMovements(
    [
      receivable('late', 300, new Date(2026, 9, 1).toISOString()),
      receivable('very-late', 200, new Date(2026, 5, 1).toISOString()),
      receivable('soon', 100, new Date(2026, 9, 20).toISOString()),
      receivable('far', 100, new Date(2027, 0, 20).toISOString()),
    ],
    [],
  );
  assert.equal(overdueDays(rows.find((row) => row.id === 'late'), now), 14);
  assert.deepEqual(upcomingDues(rows, now).map((row) => row.id), ['soon']);
  const [usd] = agingByCurrency(rows, now);
  assert.deepEqual(usd.buckets, [300, 0, 0, 200]);
  const [debtor] = topDebtors(rows);
  assert.equal(debtor.amount, 700);
  assert.equal(debtor.count, 4);
});

test('tahsilat trendi son 6 ayı tek para biriminde döner', () => {
  const now = new Date(2026, 9, 15);
  const rows = mergeCashMovements(
    [receivable('open', 80, new Date(2026, 9, 20).toISOString())],
    [payment('paid', 50, new Date(2026, 8, 3).toISOString(), 'in'), payment('eur', 999, new Date(2026, 8, 3).toISOString(), 'in', 'paid', 'EUR')],
  );
  const trend = collectionTrend(rows, 'USD', now);
  assert.equal(trend.length, 6);
  assert.equal(trend[5].pending, 80);
  assert.equal(trend[4].collected, 50);
});

test('teslim edilmemiş fırsatın beklenen tahsilatı gizlenir; fırsatsız ya da teslim edilmiş olan kalır', () => {
  const rows = [
    { id: 'a', quoteId: 'q-open' },
    { id: 'b', quoteId: 'q-done' },
    { id: 'c', quoteId: 'q-free' },
    { id: 'd', quoteId: null },
  ];
  const stages = new Map([['q-open', 'contract'], ['q-done', 'delivered']]);
  assert.deepEqual(hideUndeliveredExpected(rows, stages).map((row) => row.id), ['b', 'c', 'd']);
});
