import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addYears,
  complaintLinkTitle,
  machineNotes,
  publicComplaintUrl,
  warrantyInfo,
  warrantyShortLabel,
  warrantyStats,
} from './machines.ts';
import {
  compatibilityLabel,
  defaultPriceListId,
  effectivePrices,
  matchesProduct,
  overridesFromItems,
  parsePriceInput,
  priceChanges,
  priceCurrency,
  serviceCategoryProducts,
  servicePriceCounts,
  sortPriceLists,
  sortProducts,
} from './priceList.ts';

const NOW = Date.parse('2026-10-15T12:00:00Z');

test('garanti durumu 60 gün eşiğiyle hesaplanır', () => {
  assert.deepEqual(warrantyInfo(null, NOW), { state: 'unknown', days: null });
  assert.equal(warrantyInfo('2026-10-01', NOW).state, 'expired');
  assert.deepEqual(warrantyInfo('2026-11-14T12:00:00Z', NOW), { state: 'expiring', days: 30 });
  assert.equal(warrantyInfo('2027-10-15', NOW).state, 'active');
  assert.equal(warrantyShortLabel({ state: 'expiring', days: 30 }), '30 gün kaldı');
  assert.equal(warrantyShortLabel({ state: 'unknown', days: null }), 'Garanti yok');
  assert.deepEqual(
    warrantyStats([{ warrantyEndDate: null }, { warrantyEndDate: '2027-10-15' }, { warrantyEndDate: '2020-01-01' }], NOW),
    { active: 1, expiring: 0, expired: 1, unknown: 1 },
  );
});

test('makine formu yardımcıları', () => {
  assert.equal(addYears('2026-10-15', 2), '2028-10-15');
  assert.equal(addYears('2028-02-29', 1), '2029-02-28');
  assert.equal(addYears('15.10.2026', 2), '');
  assert.equal(machineNotes(' MV-850 ', ''), 'MV-850');
  assert.equal(complaintLinkTitle(null), 'Makine Servis Formu');
  assert.equal(publicComplaintUrl('https://crm.example.com/', 'public/x/y'), 'https://crm.example.com/public/x/y');
});

const product = (overrides) => ({
  id: 'p',
  modelCode: 'M',
  modelName: null,
  fullName: 'Ürün',
  stockCode: null,
  listPrice: '100',
  cashPrice: null,
  vatRate: null,
  originCountry: null,
  brand: null,
  currency: null,
  category: null,
  subcategory: null,
  productType: null,
  ...overrides,
});

test('servis fiyat listesi sıralama, arama ve fiyat kuralları', () => {
  const sorted = sortProducts([
    product({ id: 'b', modelCode: 'MV-1050', brand: { name: 'Haksan' } }),
    product({ id: 'a', modelCode: 'MV-850', brand: { name: 'Haksan' } }),
  ]);
  assert.deepEqual(sorted.map((p) => p.id), ['a', 'b']);
  assert.deepEqual(sortPriceLists([{ name: 'Zeta', code: 'Z' }, { name: '', code: 'A' }]).map((p) => p.code), ['A', 'Z']);
  assert.equal(defaultPriceListId([{ id: '1', isActive: false }, { id: '2', isActive: true }]), '2');
  assert.equal(defaultPriceListId([]), '');
  assert.equal(matchesProduct(product({ stockCode: 'YP-İĞNE' }), 'iğne'), true);
  assert.equal(matchesProduct(product({}), 'yok'), false);
  assert.equal(compatibilityLabel(product({ productType: { name: 'Torna' } })), 'Torna');
  assert.equal(compatibilityLabel(product({ compatibleMachineType: { code: 'CNC', name: 'CNC' } })), 'CNC');
  assert.equal(compatibilityLabel(product({})), 'Genel uyum');
  const overrides = overridesFromItems([
    { item: { id: 'i1', listPrice: '90', cashPrice: null }, product: { id: 'p' } },
    { item: { id: 'i2', listPrice: '1', cashPrice: '1' }, product: null },
  ]);
  assert.deepEqual(overrides, { p: { itemId: 'i1', listPrice: 90, cashPrice: undefined } });
  assert.deepEqual(effectivePrices(product({ cashPrice: '80' }), overrides.p), { cash: 80, list: 90 });
  assert.equal(parsePriceInput('1.250,50'), 1250.5);
  assert.equal(parsePriceInput('1250.5'), 1250.5);
  assert.equal(parsePriceInput('-5'), null);
  assert.equal(parsePriceInput(''), null);
});

test('servis fiyat sekmeleri kategori koduna göre sayılır ve süzülür', () => {
  const row = (id, code, brand) => ({
    id,
    modelCode: id,
    modelName: null,
    fullName: id,
    stockCode: null,
    listPrice: null,
    cashPrice: null,
    vatRate: null,
    originCountry: null,
    brand: { name: brand },
    currency: { code: 'EUR' },
    category: code ? { code, name: code } : null,
    subcategory: null,
    productType: null,
  });
  const rows = [row('b', 'YEDEK_PARCA', 'Zeta'), row('a', 'YEDEK_PARCA', 'Alfa'), row('c', 'ISCILIK', 'X'), row('d', null, 'Y')];
  assert.deepEqual(servicePriceCounts(rows), { parts: 2, accessory: 0, optional: 0, labor: 1 });
  assert.deepEqual(serviceCategoryProducts(rows, 'parts').map((p) => p.id), ['a', 'b']);
  assert.equal(priceCurrency(rows[0], 'USD'), 'USD');
  assert.equal(priceCurrency(rows[0], undefined), 'EUR');
});

test('fiyat düzenleme yalnız değişen ve geçerli alanları gönderir', () => {
  assert.deepEqual(priceChanges({ cash: '1.250,50', list: '2000' }, { cash: null, list: 2000 }, false), {
    ok: true,
    prices: { cashPrice: 1250.5 },
  });
  assert.deepEqual(priceChanges({ cash: '', list: '300' }, { cash: null, list: null }, true), { ok: true, prices: { listPrice: 300 } });
  assert.deepEqual(priceChanges({ cash: 'abc', list: '' }, { cash: null, list: null }, false), { ok: false, error: 'Geçerli bir tutar girin' });
  assert.deepEqual(priceChanges({ cash: '10', list: '' }, { cash: 10, list: null }, false), { ok: false, error: 'Değişiklik yok' });
});
