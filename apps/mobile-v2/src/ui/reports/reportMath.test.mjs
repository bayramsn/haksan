import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateQuoteProducts,
  analyzeTargetSubject,
  activityBucketLabel,
  bucketLabel,
  buildExecutiveSummary,
  comparedMonths,
  daysLeftInPeriod,
  defaultActivityRange,
  delta,
  departmentProgress,
  metricLineText,
  monthRange,
  parseGoalNumber,
  pct,
  previousPeriod,
  rowsUpToMonth,
  shiftMonth,
  sumMetrics,
  sumOperational,
  totalsLabel,
  usd,
  validateActivityRange,
} from './reportMath.ts';

const row = (bucket, values = {}) => ({ bucket, quotes: 0, approved: 0, rejected: 0, won: 0, lost: 0, service: 0, revenueUsd: 0, ...values });

test('operasyonel toplamlar ve dönüşüm oranı web ile aynı', () => {
  const totals = sumOperational([row('2026-01', { quotes: 4, approved: 1, revenueUsd: 100.4 }), row('2026-02', { quotes: 6, approved: 4, revenueUsd: 50 })]);
  assert.equal(totals.quotes, 10);
  assert.equal(pct(totals.approved, totals.quotes), 50);
  assert.equal(pct(3, 0), 0);
  assert.equal(usd(150.4), '$ 150');
});

test('ay kovası Türkçe kısaltmaya çevrilir, yıllık kova aynen kalır', () => {
  assert.equal(bucketLabel('2026-03'), 'Mar');
  assert.equal(bucketLabel('2025'), '2025');
  assert.equal(activityBucketLabel('2026-07', 'weekly'), 'H7');
});

test('kıyas penceresi içinde bulunulan yılda bugünün ayıyla sınırlanır', () => {
  const now = new Date(2026, 4, 10);
  assert.equal(comparedMonths(2026, now), 5);
  assert.equal(comparedMonths(2025, now), 12);
  assert.equal(rowsUpToMonth([row('2026-04'), row('2026-06')], 5).length, 1);
});

test('delta etiketi yön, birim ve eşitlik metnini üretir', () => {
  assert.equal(delta(5, null), null);
  assert.equal(delta(5, 3).label, '▲ 2');
  assert.equal(delta(40, 45, 'puan').label, '▼ 5 puan');
  assert.equal(delta(2000, 1000, 'usd').label, `▲ ${(1000).toLocaleString('tr-TR')} USD`);
  assert.equal(delta(1, 1).label, 'geçen yılla aynı');
});

test('ay kaydırma ve ay aralığı yıl sınırını doğru geçer', () => {
  assert.equal(previousPeriod('2026-01'), '2025-12');
  assert.equal(shiftMonth('2025-12', 1), '2026-01');
  const range = monthRange('2026-02');
  assert.equal(range.from, '2026-02-01');
  assert.ok(range.to.startsWith('2026-02-28T23:59:59'));
});

test('ürün bazlı teklif aynı ürünü para birimine göre toplar', () => {
  const result = aggregateQuoteProducts([
    { productId: 'p1', productName: 'PG3015', brand: 'AORE', currency: 'USD', count: 2, totalValue: '1000' },
    { productId: 'p1', productName: 'PG3015', brand: 'AORE', currency: 'EUR', count: 1, totalValue: '500' },
    { productId: 'p2', productName: 'T6', brand: 'HEX', currency: 'USD', count: 5, totalValue: '50' },
  ]);
  assert.equal(result[0].key, 'p2');
  assert.equal(result[1].count, 3);
  assert.equal(totalsLabel(result[1].totals), `${(1000).toLocaleString('tr-TR')} USD + 500 EUR`);
});

test('hedef sayısı Türkçe binlik biçimini API ile aynı çözer', () => {
  assert.equal(parseGoalNumber('1.250.000'), 1250000);
  assert.equal(parseGoalNumber('12,5'), 12.5);
  assert.equal(parseGoalNumber('yaklaşık 5'), null);
});

test('hedef analizi ölçülebilir kalemlerden durum ve yüzde çıkarır', () => {
  const now = new Date(2026, 4, 15);
  const analysis = analyzeTargetSubject(
    {
      subject: { kind: 'user', id: 'u1', name: 'Ali' },
      hasTarget: true,
      metrics: { quoteTarget: { target: 10, actual: 6, pct: 60 }, salesAmount: { target: 1000, actual: null, pct: null } },
    },
    50,
    '2026-05',
    now,
  );
  assert.equal(analysis.completionPct, 60);
  assert.equal(analysis.status, 'on_track');
  assert.equal(analysis.manual[0].label, 'Satış cirosu');
  assert.equal(analyzeTargetSubject({ subject: { kind: 'user', id: 'u2', name: 'B' }, hasTarget: false }, 50, '2026-05', now).status, 'no_target');
  assert.equal(analyzeTargetSubject({ subject: { kind: 'user', id: 'u3', name: 'C' }, hasTarget: true, metrics: { quoteTarget: { target: 10, actual: 2, pct: 20 } } }, 50, '2026-04', now).status, 'missed');
});

test('ölçüt metni eksik ve günlük tempoyu gösterir', () => {
  assert.equal(metricLineText({ label: 'Teklif', target: 10, actual: 6, pct: 60, unit: 'adet' }, 4), '6 / 10 (%60) · 4 eksik · 1/gün');
  const team = sumMetrics([[{ label: 'Teklif', target: 10, actual: 5, pct: 50, unit: 'adet' }], [{ label: 'Teklif', target: 10, actual: 10, pct: 100, unit: 'adet' }]]);
  assert.equal(team[0].pct, 75);
  assert.equal(daysLeftInPeriod('2026-04', new Date(2026, 4, 15)), 0);
  assert.equal(daysLeftInPeriod('2026-05', new Date(2026, 4, 30)), 2);
});

test('aktivite raporu aralığı pazartesi-cumartesi ve doğrulama kuralları', () => {
  const range = defaultActivityRange(new Date('2026-10-15T09:00:00Z'));
  assert.deepEqual(range, { from: '2026-10-12', to: '2026-10-17' });
  assert.equal(validateActivityRange(range), null);
  assert.equal(validateActivityRange({ from: '2026-10-17', to: '2026-10-12' }), 'Bitiş tarihi başlangıçtan önce olamaz');
  assert.equal(validateActivityRange({ from: '2024-01-01', to: '2026-01-01' }), 'Aralık en fazla 366 gün olabilir.');
});

test('yönetici özeti yalnız gerçek sinyallerden madde üretir', () => {
  assert.deepEqual(buildExecutiveSummary({}), []);
  const items = buildExecutiveSummary({
    current: { quotes: 10, approved: 2, rejected: 0, won: 1, lost: 3, service: 0, revenueUsd: 100 },
    previous: { quotes: 10, approved: 5, rejected: 0, won: 2, lost: 1, service: 0, revenueUsd: 200 },
    newComplaints: 2,
  });
  assert.deepEqual(items.map((item) => item.key), ['conversion-drop', 'revenue-drop', 'loss-ratio', 'complaints']);
});

test('aktivite raporu aralığı gerçek takvim günü ve dahil 366 gün sınırını izler', () => {
  assert.equal(validateActivityRange({ from: '2026-02-30', to: '2026-03-03' }), 'Geçerli bir tarih girin.');
  assert.equal(validateActivityRange({ from: '2024-01-01', to: '2024-12-31' }), null);
  assert.equal(validateActivityRange({ from: '2024-01-01', to: '2025-01-01' }), 'Aralık en fazla 366 gün olabilir.');
});

test('departmentProgress: kendi hedefi olmayan departman durumu üye ortalamasından alır', () => {
  const now = new Date('2026-05-15T12:00:00Z');
  const none = { status: 'no_target', completionPct: null, metrics: [], manual: [] };
  const member = (completionPct) => ({ row: { subject: { kind: 'user', id: String(completionPct), name: 'x' }, hasTarget: true }, analysis: { status: 'on_track', completionPct, metrics: [], manual: [] } });
  assert.deepEqual(departmentProgress(none, [member(100), member(100)], 50, '2026-05', now), { completionPct: 100, status: 'completed' });
  assert.deepEqual(departmentProgress(none, [member(10), member(20)], 50, '2026-05', now), { completionPct: 15, status: 'at_risk' });
  assert.deepEqual(departmentProgress(none, [], 50, '2026-05', now), { completionPct: null, status: 'no_target' });
  const own = { status: 'on_track', completionPct: 60, metrics: [], manual: [] };
  assert.deepEqual(departmentProgress(own, [member(0)], 50, '2026-05', now), { completionPct: 60, status: 'on_track' });
});
