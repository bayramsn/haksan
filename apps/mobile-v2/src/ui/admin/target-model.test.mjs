import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TARGET_TEMPLATES,
  applyTemplateTargets,
  clearTargets,
  currentPeriod,
  emptyTarget,
  expectedPeriodPct,
  formatPeriodLabel,
  formatTargetNumber,
  hasTargetValue,
  inferTemplateMetricKey,
  isAutoTracked,
  isInvalidNumberFor,
  livePace,
  mergeTargetItems,
  parseTargetNumber,
  shiftPeriod,
  summarizeTargetItems,
  targetFilledCount,
  targetFromApi,
  targetToApi,
} from './target-model.ts';

test('dönem yerel takvimden okunur ve kaydırılır', () => {
  assert.equal(currentPeriod(new Date(2026, 0, 1, 1, 0)), '2026-01');
  assert.equal(shiftPeriod('2026-01', -1), '2025-12');
  assert.equal(shiftPeriod('2026-12', 1), '2027-01');
  assert.equal(formatPeriodLabel('2026-10'), 'Ekim 2026');
  assert.equal(formatPeriodLabel('bozuk'), 'bozuk');
});

test('beklenen tempo geçmiş/gelecek/güncel dönemde doğru', () => {
  const now = new Date(2026, 3, 15);
  assert.equal(expectedPeriodPct('2026-03', now), 100);
  assert.equal(expectedPeriodPct('2026-05', now), 0);
  assert.equal(expectedPeriodPct('2026-04', now), 50);
});

test('TR binlik ve düz sayılar ayrıştırılır', () => {
  assert.equal(parseTargetNumber('1.250.000,50'), 1250000.5);
  assert.equal(parseTargetNumber('1250,5'), 1250.5);
  assert.equal(parseTargetNumber(' 12 '), 12);
  assert.equal(parseTargetNumber(''), null);
  assert.equal(parseTargetNumber('-5'), null);
  assert.equal(parseTargetNumber('abc'), null);
  assert.equal(formatTargetNumber(1250000.5), '1.250.000,5');
  assert.equal(formatTargetNumber(30), '30');
});

test('adet alanı tam sayı, tutar alanı pozitif olmalı', () => {
  assert.equal(isInvalidNumberFor({ unit: 'count' }, '2,5'), true);
  assert.equal(isInvalidNumberFor({ unit: 'amount' }, '2,5'), false);
  assert.equal(isInvalidNumberFor({ unit: 'count' }, ''), false);
  assert.equal(isInvalidNumberFor({ unit: 'amount' }, 'x'), true);
});

test('ölçüm anahtarı eşlemesi webdeki öncelik sırasını korur', () => {
  const row = (category, activity, unit = 'count') => ({ category, activity, description: '', unit, defaultTarget: '' });
  assert.equal(inferTemplateMetricKey('sales', row('ZİYARET', 'TEKLİF TAKİP ZİYARETİ')), 'visitTarget');
  assert.equal(inferTemplateMetricKey('sales', row('SATIŞ', 'SATIŞ HEDEFİ')), 'machineDeliveredCount');
  assert.equal(inferTemplateMetricKey('sales', row('DİJİTAL PAZARLAMA', 'LINKEDIN PAYLAŞIMI')), null);
  assert.equal(inferTemplateMetricKey('service', row('SATIŞ', 'DIŞ SERVİS', 'amount')), 'serviceAmount');
  assert.equal(inferTemplateMetricKey('service', row('SATIŞ', 'YEDEK PARÇA & AKSESUAR SATIŞI', 'amount')), 'salesAmount');
  const manual = TARGET_TEMPLATES.finance.find((item) => item.activity === 'CARİ MUTABAKAT');
  assert.equal(manual.trackingMode, 'manual');
  assert.equal(isAutoTracked(manual), false);
});

test('yeni hedef boş açılır; şablon doldur/temizle bölüm bazlı çalışır', () => {
  const blank = emptyTarget('2026-10');
  assert.equal(hasTargetValue(blank), false);
  const total = Object.values(TARGET_TEMPLATES).reduce((sum, rows) => sum + rows.length, 0);
  assert.equal(blank.targetItems.length, total);
  assert.ok(total <= 80, 'API en fazla 80 kalem kabul eder');

  const filled = applyTemplateTargets(blank, 'sales');
  assert.equal(targetFilledCount(filled, 'sales'), TARGET_TEMPLATES.sales.filter((item) => item.defaultTarget).length);
  assert.equal(targetFilledCount(filled, 'service'), 0);
  const cleared = clearTargets(applyTemplateTargets(blank), 'service');
  assert.equal(targetFilledCount(cleared, 'service'), 0);
  assert.ok(targetFilledCount(cleared, 'sales') > 0);
});

test('API satırı forma ve forma geri dönüşte bilinmeyen kalemler düşer', () => {
  const row = {
    period: '2026-09',
    salesAmount: '15000.00',
    visitTarget: 12,
    note: null,
    targetItems: [
      { targetType: 'sales', category: 'ZİYARET', activity: 'MÜŞTERİ ZİYARETİ', target: '20', metricKey: 'quoteTarget' },
      { targetType: 'sales', category: 'X', activity: 'SİLİNMİŞ', target: '9' },
    ],
  };
  const form = targetFromApi(row);
  assert.equal(form.salesAmount, '15000.00');
  assert.equal(form.visitTarget, '12');
  const visit = form.targetItems.find((item) => item.activity === 'MÜŞTERİ ZİYARETİ' && item.targetType === 'sales');
  assert.equal(visit.target, '20');
  assert.equal(visit.metricKey, 'visitTarget', 'ölçüm anahtarı şablondan gelir');
  assert.equal(mergeTargetItems(row.targetItems).some((item) => item.activity === 'SİLİNMİŞ'), false);

  const body = targetToApi(form);
  assert.equal(body.salesAmount, 15000);
  assert.equal(body.salesNewCustomers, null);
  assert.equal(body.currency, 'USD');
  assert.equal(body.note, undefined);
  assert.equal(body.targetItems.length, form.targetItems.length);
  assert.equal(body.targetItems.find((item) => item.activity === 'LINKEDIN PAYLAŞIMI').trackingMode, 'manual');
});

test('özet geçersiz değerleri ayrı sayar', () => {
  const form = emptyTarget('2026-10');
  const items = form.targetItems.filter((item) => item.targetType === 'finance').map((item, index) =>
    index === 0 ? { ...item, target: '1.000' } : index === 2 ? { ...item, target: '2,5' } : item
  );
  const summary = summarizeTargetItems(items);
  assert.equal(summary.filled, 2);
  assert.equal(summary.invalid, 1);
  assert.equal(summary.amountTotal, 1000);
});

test('canlı tempo ölçülen hedeflerin ortalamasıdır; rol çarpanı uygulanır', () => {
  const form = { ...emptyTarget('2026-10'), salesAmount: '1000', visitTarget: '10' };
  const actual = { salesAmount: 500, visitTarget: 20 };
  assert.equal(livePace(form, (key) => actual[key] ?? null, 1), 75);
  assert.equal(livePace(form, (key) => actual[key] ?? null, 2), 63);
  assert.equal(livePace(emptyTarget('2026-10'), () => 5, 1), null);
});
