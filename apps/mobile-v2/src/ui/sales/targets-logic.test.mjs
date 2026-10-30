import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPeriodResult,
  buildTeamRows,
  clearTargets,
  currentPeriod,
  emptyTargetForm,
  fillFromTemplate,
  hasTargetValue,
  invalidTargetFieldCount,
  mergeTargetItems,
  monthRange,
  paceMeta,
  parseTargetNumber,
  projectedPct,
  quarterRange,
  reportLines,
  sortTeamRows,
  summarizeResults,
  TARGET_TEMPLATES,
  targetFormFromApi,
  targetFormToApi,
  targetReportCsv,
  targetReportHtml,
  targetStatus,
  yearRange,
} from './targets-logic.ts';

const NOW = new Date(2026, 9, 15, 12, 0, 0);

test('currentPeriod yerel takvimden okunur', () => {
  assert.equal(currentPeriod(new Date(2026, 0, 1, 0, 30)), '2026-01');
});

test('monthRange sıralı dönemleri döner ve 18 ay sınırını uygular', () => {
  assert.deepEqual(monthRange('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.throws(() => monthRange('2026-03', '2026-01'), /Başlangıç dönemi/);
  assert.throws(() => monthRange('2024-01', '2026-01'), /18 aylık/);
});

test('çeyrek ve yıl kısayolları', () => {
  assert.deepEqual(quarterRange('2026-05'), { from: '2026-04', to: '2026-06' });
  assert.deepEqual(yearRange('2026-05'), { from: '2026-01', to: '2026-12' });
});

test('ay sonu tahmini yalnız ay içindeyken hesaplanır', () => {
  assert.equal(projectedPct(40, 50), 80);
  assert.equal(projectedPct(40, 3), null);
  assert.equal(projectedPct(null, 50), null);
  assert.equal(projectedPct(40, 100), null);
});

test('targetStatus geçmiş/gelecek/risk ayrımı', () => {
  assert.equal(targetStatus('2026-10', 100, 50, false, NOW), 'achieved');
  assert.equal(targetStatus('2026-09', 60, 100, false, NOW), 'missed');
  assert.equal(targetStatus('2026-11', 0, 0, false, NOW), 'scheduled');
  assert.equal(targetStatus('2026-10', 20, 50, false, NOW), 'at_risk');
  assert.equal(targetStatus('2026-10', 45, 50, false, NOW), 'on_track');
  assert.equal(targetStatus('2026-10', null, 50, false, NOW), 'manual');
});

const subject = {
  subject: { kind: 'user', id: 'u1', name: 'Ayşe' },
  hasTarget: true,
  metrics: {
    salesAmount: { target: 1000, actual: 500, pct: 50 },
    quoteTarget: { target: 0, actual: 3, pct: null },
  },
  targetItems: [
    { targetType: 'sales', category: 'ZİYARET', activity: 'MÜŞTERİ ZİYARETİ', unit: 'count', target: '10', actual: 4, metricKey: 'visitTarget', trackingMode: 'automatic' },
    { targetType: 'sales', category: 'ZİYARET', activity: 'FUAR ZİYARETİ', unit: 'count', target: '2', actual: 4, metricKey: 'visitTarget', trackingMode: 'automatic' },
    { targetType: 'sales', category: 'DİJİTAL PAZARLAMA', activity: 'LINKEDIN PAYLAŞIMI', unit: 'count', target: '5', trackingMode: 'manual' },
    { targetType: 'sales', category: 'SATIŞ', activity: 'SATIŞ HEDEFİ', unit: 'count', target: '', metricKey: 'machineDeliveredCount', trackingMode: 'automatic' },
  ],
};

test('reportLines aynı sayaca bağlı alt hedefleri birleştirir', () => {
  const lines = reportLines(subject, '2026-10', 50, NOW);
  assert.equal(lines.length, 3);
  const visit = lines.find((line) => line.id === 'item-group:visitTarget');
  assert.equal(visit.target, 12);
  assert.equal(visit.actual, 4);
  assert.equal(visit.pct, 33);
  assert.match(visit.label, /2 alt kalem/);
  assert.equal(lines.find((line) => line.id.startsWith('manual:')).status, 'manual');
});

test('buildPeriodResult ortalama ve sayaçlar', () => {
  const result = buildPeriodResult('2026-10', { expectedProgressPct: 50, subjects: [subject] }, NOW);
  assert.equal(result.averagePct, 42);
  assert.equal(result.manualCount, 1);
  assert.equal(result.riskCount, 1);
  const summary = summarizeResults([result], NOW);
  assert.equal(summary.overallAverage, 42);
  assert.equal(summary.monthEndProjection, 84);
});

test('boş yanıt boş sonuç üretir', () => {
  const result = buildPeriodResult('2026-10', null, NOW);
  assert.equal(result.lines.length, 0);
  assert.equal(result.averagePct, null);
});

test('ekip karnesi tempo sırası ve rozet', () => {
  const rows = buildTeamRows(
    {
      period: '2026-10',
      expectedProgressPct: 50,
      subjects: [
        subject,
        { subject: { kind: 'user', id: 'u2', name: 'Can' }, hasTarget: false },
        { subject: { kind: 'user', id: 'u3', name: 'Bora', departmentNames: ['Satış'] }, hasTarget: true, metrics: { callTarget: { target: 10, actual: 9, pct: 90 } } },
      ],
    },
    NOW
  );
  const sorted = sortTeamRows(rows, 'pace');
  assert.deepEqual(sorted.map((row) => row.id), ['u1', 'u3', 'u2']);
  assert.equal(sorted[1].department, 'Satış');
  assert.deepEqual(sortTeamRows(rows, 'name').map((row) => row.name), ['Ayşe', 'Bora', 'Can']);
  assert.equal(paceMeta(null).label, 'Hedef yok');
  assert.equal(paceMeta(5).tone, 'info');
  assert.equal(paceMeta(-10).tone, 'warning');
  assert.equal(paceMeta(-30).tone, 'destructive');
});

test('CSV formül enjeksiyonunu etkisizleştirir', () => {
  const result = buildPeriodResult('2026-10', { expectedProgressPct: 50, subjects: [subject] }, NOW);
  const csv = targetReportCsv({ scopeKind: 'user', subjectName: '=HYPERLINK("x")', results: [result] });
  assert.ok(csv.startsWith('\uFEFFDönem;Kapsam'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
});

test('parseTargetNumber katı biçim', () => {
  assert.equal(parseTargetNumber('1.250.000'), 1250000);
  assert.equal(parseTargetNumber('12,5'), 12.5);
  assert.equal(parseTargetNumber('abc'), null);
  assert.equal(parseTargetNumber(''), null);
});

test('şablonlar web ile aynı ölçüm anahtarlarını üretir ve 80 kalem sınırında kalır', () => {
  const all = Object.values(TARGET_TEMPLATES).flat();
  assert.ok(all.length <= 80);
  const byActivity = (type, activity) => TARGET_TEMPLATES[type].find((row) => row.activity === activity);
  assert.equal(byActivity('sales', 'SATIŞ HEDEFİ').metricKey, 'machineDeliveredCount');
  assert.equal(byActivity('sales', 'TEKLİF TAKİP ZİYARETİ').metricKey, 'visitTarget');
  assert.equal(byActivity('sales', 'LINKEDIN PAYLAŞIMI').metricKey, null);
  assert.equal(byActivity('sales', 'LINKEDIN PAYLAŞIMI').trackingMode, 'manual');
  assert.equal(byActivity('service', 'YEDEK PARÇA & AKSESUAR SATIŞI').metricKey, 'salesAmount');
});

test('form API dönüşümü, şablon doldurma ve doğrulama', () => {
  const form = targetFormFromApi(
    {
      period: '2026-10',
      salesAmount: '15000.0000',
      targetItems: [{ targetType: 'sales', category: 'ZİYARET', activity: 'MÜŞTERİ ZİYARETİ', target: '12', metricKey: 'quoteTarget' }],
      note: 'not',
    },
    '2026-10'
  );
  assert.equal(form.salesAmount, '15000.0000');
  const visit = form.targetItems.find((item) => item.activity === 'MÜŞTERİ ZİYARETİ' && item.targetType === 'sales');
  assert.equal(visit.target, '12');
  assert.equal(visit.metricKey, 'visitTarget');

  const body = targetFormToApi(form);
  assert.equal(body.salesAmount, 15000);
  assert.equal(body.currency, 'USD');
  assert.equal(body.note, 'not');
  assert.equal(body.targetItems.length, mergeTargetItems([]).length);

  const filled = fillFromTemplate(emptyTargetForm('2026-10'), 'finance');
  assert.equal(filled.targetItems.find((item) => item.activity === 'CARİ MUTABAKAT').target, '20');
  assert.equal(filled.targetItems.find((item) => item.targetType === 'sales' && item.activity === 'SATIŞ HEDEFİ').target, '');
  assert.equal(hasTargetValue(clearTargets(filled)), false);

  const invalid = { ...emptyTargetForm('2026-10'), visitTarget: '2,5', salesAmount: '-3' };
  assert.equal(invalidTargetFieldCount(invalid), 2);
  assert.equal(invalidTargetFieldCount({ ...invalid, visitTarget: '3', salesAmount: '10,5' }), 0);
});

test('yazdırma raporu değerleri kaçışlar ve betik içermez', () => {
  const result = buildPeriodResult(
    '2026-10',
    {
      expectedProgressPct: 50,
      subjects: [{ subject: { kind: 'user', id: 'u1', name: 'A' }, hasTarget: true, metrics: { quoteTarget: { target: 10, actual: 5, pct: 50 } } }],
    },
    NOW
  );
  const html = targetReportHtml({ scopeKind: 'user', subjectName: '<script>alert(1)</script>', results: [result], generatedAt: NOW });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('Teklif'));
  assert.ok(html.includes('%50'));
});
