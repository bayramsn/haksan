import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOfferTrend,
  businessLineForDivision,
  chartAxisLabels,
  exportQueryForTab,
  formatDay,
  itemsNetTotal,
  lastMonths,
  mergeQuotePages,
  parseDay,
  parseDecimal,
  parseQuoteItems,
  planQuoteItemChanges,
  sharePercent,
  statusCodesForTab,
  topRejectionReason,
  validUntil,
  winRate,
} from './quote-logic.ts';

test('son 6 ay gerçek tarihten üretilir ve yıl sınırını geçer', () => {
  const months = lastMonths(new Date(2026, 1, 15), 6);
  assert.deepEqual(
    months.map((m) => m.key),
    ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']
  );
  assert.equal(months.at(-1).long, 'Şubat');
  assert.deepEqual(chartAxisLabels(months), ['Eyl', 'Kas', 'Şub']);
});

test('trend: gönderilen = gönderildi + onaylı + reddedildi; onaylanan ayrı', () => {
  const buckets = lastMonths(new Date(2026, 9, 1), 2);
  const summary = (rows) => ({ byCurrency: rows });
  const trend = buildOfferTrend(buckets, {
    sent: summary([{ currencyCode: 'USD', months: [{ month: '2026-10', count: 2, total: '0' }] }]),
    approved: summary([
      { currencyCode: 'USD', months: [{ month: '2026-10', count: 1, total: '0' }] },
      { currencyCode: 'EUR', months: [{ month: '2026-09', count: 3, total: '0' }] },
    ]),
    rejected: summary([{ currencyCode: 'USD', months: [{ month: '2026-10', count: 4, total: '0' }] }]),
  });
  assert.deepEqual(trend, [
    { key: '2026-09', label: 'Eyl', sent: 3, approved: 3 },
    { key: '2026-10', label: 'Eki', sent: 7, approved: 1 },
  ]);
});

test('kazanma oranı ve pay hesapları sıfıra bölmez', () => {
  assert.equal(winRate(0, 0), 0);
  assert.equal(winRate(1, 3), 33);
  assert.equal(sharePercent(1, 3), 33.3);
  assert.equal(sharePercent(5, 0), 0);
});

test('en sık ret nedeni boş nedenleri gruplar', () => {
  assert.equal(topRejectionReason([]), null);
  assert.deepEqual(
    topRejectionReason([
      { lostReason: { name: 'Fiyat' } },
      { lostReason: null },
      { lostReason: { name: 'Fiyat' } },
      { lostReason: { name: '  ' } },
      { lostReason: { name: '' } },
    ]),
    { reason: 'Neden belirtilmemiş', count: 3 }
  );
});

test('bölüm kodu teklif iş koluna çevrilir', () => {
  assert.equal(businessLineForDivision('cnc'), 'CNC');
  assert.equal(businessLineForDivision('universal'), 'UNI');
  assert.equal(businessLineForDivision('sac_isleme'), 'SACISLE');
  assert.equal(businessLineForDivision('servis'), undefined);
});

test('sekme durum kodları ve dışa aktarma sorgusu webdeki gibi', () => {
  assert.deepEqual(statusCodesForTab('follow-up'), ['price_waiting', 'budget_waiting', 'on_hold', 'postponed']);
  assert.deepEqual(exportQueryForTab('closed', ' abc '), { search: 'abc' });
  assert.deepEqual(exportQueryForTab('approved', ''), { statusCode: 'approved' });
  assert.deepEqual(exportQueryForTab('all', ''), {});
});

test('grup sayfaları tekilleşir ve teklif no/revizyon azalan sıralanır', () => {
  const merged = mergeQuotePages([
    [{ id: 'a', documentNo: 'T-2', revisionNo: 1 }, { id: 'b', documentNo: 'T-10', revisionNo: 1 }],
    [{ id: 'a', documentNo: 'T-2', revisionNo: 1 }, { id: 'c', documentNo: 'T-10', revisionNo: 2 }],
  ]);
  assert.deepEqual(merged.map((r) => r.id), ['c', 'b', 'a']);
});

test('ondalık girdi tr-TR ve düz biçimi okur', () => {
  assert.equal(parseDecimal('1.234,56'), 1234.56);
  assert.equal(parseDecimal('1234.5'), 1234.5);
  assert.equal(parseDecimal('12,5'), 12.5);
  assert.ok(Number.isNaN(parseDecimal('')));
});

test('kalem doğrulaması sunucu şemasıyla aynı kuralları uygular', () => {
  const base = { key: 'k', description: 'Makine', quantity: '2', unitPrice: '100', discountAmount: '', vatRate: '' };
  assert.equal(parseQuoteItems([]).error, 'En az bir kalem girin.');
  assert.match(parseQuoteItems([{ ...base, quantity: '0' }]).error, /adet/);
  assert.match(parseQuoteItems([{ ...base, discountAmount: '500' }]).error, /iskontosu/);
  assert.match(parseQuoteItems([{ ...base, vatRate: '120' }]).error, /KDV/);
  assert.match(parseQuoteItems([{ ...base, quantity: '1,0001' }]).error, /ondalık/);
  const ok = parseQuoteItems([
    { ...base, key: 'empty', description: '', unitPrice: '' },
    { ...base, itemId: 'i1', productModelId: 'p1' },
  ]);
  assert.equal(ok.error, null);
  assert.deepEqual(ok.items, [
    { itemId: 'i1', productModelId: 'p1', description: 'Makine', quantity: 2, unitCode: 'adet', unitPrice: 100, discountAmount: 0, vatRate: 20, sortOrder: 0 },
  ]);
  assert.equal(itemsNetTotal([{ quantity: 2, unitPrice: 100, discountAmount: 15 }]), 185);
});

test('kalem planı güncelle/ekle/sil ayrımını yapar', () => {
  const plan = planQuoteItemChanges(
    ['i1', 'i2'],
    [
      { itemId: 'i2', description: 'B', quantity: 1, unitCode: 'adet', unitPrice: 1, discountAmount: 0, vatRate: 20, sortOrder: 5 },
      { description: 'Yeni', quantity: 1, unitCode: 'adet', unitPrice: 2, discountAmount: 0, vatRate: 20, sortOrder: 9 },
    ]
  );
  assert.deepEqual(plan.update.map((u) => [u.itemId, u.body.sortOrder]), [['i2', 0]]);
  assert.deepEqual(plan.add.map((a) => [a.description, a.sortOrder]), [['Yeni', 1]]);
  assert.deepEqual(plan.remove, ['i1']);
});

test('tarih yardımcıları geçersiz günü reddeder', () => {
  assert.equal(parseDay('2026-02-30'), null);
  assert.equal(parseDay('15.10.2026'), null);
  assert.equal(formatDay(parseDay('2026-10-15')), '2026-10-15');
  assert.equal(validUntil(null, 30), null);
  assert.equal(validUntil('2026-01-01T00:00:00.000Z', 30).toISOString(), '2026-01-31T00:00:00.000Z');
});
