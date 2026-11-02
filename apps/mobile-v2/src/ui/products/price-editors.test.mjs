import test from 'node:test';
import assert from 'node:assert/strict';
import { LASER_PRICE_LIST_PRESETS } from '@haksan/shared';
import {
  applyMarkup,
  buildRecalculateBody,
  buildSaleUpdate,
  canEditPrices,
  dirtyDrafts,
  draftFor,
  draftToFormula,
  filterPricedRows,
  formulaToDraft,
  marginPercent,
  mergeLaserPreview,
  parseMarkupPercent,
  parsePrice,
} from './price-editors.ts';

const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;

test('parsePrice: web ile aynı TR / binlik / ondalık yazımları', () => {
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice('  '), null);
  assert.equal(parsePrice('30.000,50'), 30000.5);
  assert.equal(parsePrice('30.000'), 30000);
  assert.equal(parsePrice('30000.5'), 30000.5);
  assert.equal(parsePrice('1 250'), 1250);
  assert.equal(parsePrice('-5'), undefined);
  assert.equal(parsePrice('abc'), undefined);
});

test('canEditPrices: süper admin ya da price_lists.update', () => {
  assert.equal(canEditPrices({ roles: ['super_admin'], permissions: [] }), true);
  assert.equal(canEditPrices({ roles: ['sales'], permissions: ['price_lists.update'] }), true);
  assert.equal(canEditPrices({ roles: ['sales'], permissions: ['price_lists.read'] }), false);
  assert.equal(canEditPrices(null), false);
});

test('applyMarkup: maliyetsiz ve fiyatı girilmiş satırları atlar, maliyet para birimini kullanır', () => {
  const rows = [
    { id: 'a', salePrice: null, saleCurrencyCode: null, costPrice: 1000, costCurrencyCode: 'EUR' },
    { id: 'b', salePrice: 500, saleCurrencyCode: 'USD', costPrice: 400, costCurrencyCode: 'USD' },
    { id: 'c', salePrice: null, saleCurrencyCode: null, costPrice: null },
  ];
  const onlyEmpty = applyMarkup(rows, {}, 25, true);
  assert.deepEqual(onlyEmpty, { a: { salePrice: '1250', currency: 'EUR' } });
  const all = applyMarkup(rows, {}, 12.5, false);
  assert.deepEqual(all.b, { salePrice: '450', currency: 'USD' });
  assert.equal(all.c, undefined);
});

test('parseMarkupPercent: 0–1000 aralığı', () => {
  assert.equal(parseMarkupPercent('25'), 25);
  assert.equal(parseMarkupPercent('12,5'), 12.5);
  assert.equal(parseMarkupPercent('1001'), null);
  assert.equal(parseMarkupPercent('-1'), null);
  assert.equal(parseMarkupPercent(''), null);
});

test('dirtyDrafts + buildSaleUpdate: yalnız değişen satırlar, paylaşılan şemayla doğrulanır', () => {
  const rows = [
    { id: id(1), salePrice: 100, saleCurrencyCode: 'USD' },
    { id: id(2), salePrice: null, saleCurrencyCode: null },
    { id: id(3), salePrice: 50, saleCurrencyCode: 'EUR' },
  ];
  const drafts = {
    [id(1)]: { salePrice: '100', currency: 'USD' }, // değişmedi
    [id(2)]: { salePrice: '1.250', currency: 'TRY' },
    [id(3)]: { salePrice: '', currency: 'EUR' }, // fiyat temizlendi → null
  };
  assert.deepEqual(dirtyDrafts(rows, drafts).map(([key]) => key), [id(2), id(3)]);
  assert.deepEqual(buildSaleUpdate(rows, drafts), {
    ok: true,
    rows: [
      { id: id(2), salePrice: 1250, saleCurrencyCode: 'TRY' },
      { id: id(3), salePrice: null, saleCurrencyCode: 'EUR' },
    ],
  });
  assert.equal(buildSaleUpdate(rows, { [id(1)]: { salePrice: '100', currency: 'USD' } }).ok, false);
  assert.equal(buildSaleUpdate(rows, { [id(2)]: { salePrice: 'x', currency: 'USD' } }).ok, false);
  // sunucu `moneySchema` en fazla 4 ondalık kabul eder
  assert.equal(buildSaleUpdate(rows, { [id(2)]: { salePrice: '1.123456', currency: 'USD' } }).ok, false);
  // sunucu uuid ister
  assert.equal(buildSaleUpdate([{ id: 'x', salePrice: null, saleCurrencyCode: null }], { x: { salePrice: '5', currency: 'USD' } }).ok, false);
});

test('marginPercent: maliyet ve satış aynı para biriminde olmalı', () => {
  const row = { id: 'a', salePrice: null, saleCurrencyCode: null, costPrice: 100, costCurrencyCode: 'USD' };
  assert.equal(marginPercent(row, { salePrice: '125', currency: 'USD' }), 25);
  assert.equal(marginPercent(row, { salePrice: '125', currency: 'EUR' }), null);
  assert.equal(marginPercent({ ...row, costPrice: null }, { salePrice: '125', currency: 'USD' }), null);
});

test('filterPricedRows: filtre + Türkçe büyük/küçük harf duyarsız arama', () => {
  const rows = [{ g: 'Kompresör', n: 'İNCE' }, { g: 'Soğutucu', n: 'TG-6020' }];
  const pick = (filter, query) => filterPricedRows(rows, (r) => r.g, filter, (r) => `${r.g} ${r.n}`, query).map((r) => r.n);
  assert.deepEqual(pick('', 'ince'), ['İNCE']);
  assert.deepEqual(pick('Soğutucu', ''), ['TG-6020']);
  assert.deepEqual(pick('Kompresör', 'tg'), []);
});

test('formül taslağı: oranlar yüzde gösterilir, sunucu şeması sınırları uygulanır', () => {
  const formula = LASER_PRICE_LIST_PRESETS[1].formula;
  const draft = formulaToDraft(formula);
  assert.equal(draft.dutyRate, '25');
  assert.equal(draft.listMarkup, '30');
  assert.deepEqual(draftToFormula(draft), formula);
  assert.equal(draftToFormula({ ...draft, fixedUsd: '' }), null);
  assert.equal(draftToFormula({ ...draft, dutyRate: '600' }), null); // dutyRate ≤ 5
  assert.equal(draftToFormula({ ...draft, listMarkup: '1001' }), null); // markup ≤ 10
});

test('buildRecalculateBody: kod ve apply ile doğrulanmış gövde', () => {
  const draft = formulaToDraft(LASER_PRICE_LIST_PRESETS[0].formula);
  assert.deepEqual(buildRecalculateBody('LAZER-CIF-IST', draft, false), {
    code: 'LAZER-CIF-IST',
    formula: LASER_PRICE_LIST_PRESETS[0].formula,
    apply: false,
  });
  assert.equal(buildRecalculateBody('BILINMEYEN', draft, true), null);
  assert.equal(buildRecalculateBody('LAZER-CIF-IST', null, true), null);
});

test('mergeLaserPreview: önizleme fiyatı bindirilir, değişen satır işaretlenir', () => {
  const rows = [
    { configurationPriceId: 'a', listPrice: 100, cashPrice: 90, cost: 70 },
    { configurationPriceId: 'b', listPrice: 200, cashPrice: 180, cost: 150 },
    { configurationPriceId: 'c', listPrice: null, cashPrice: null },
  ];
  const merged = mergeLaserPreview(rows, [
    { configurationPriceId: 'a', listPrice: 110, cashPrice: 95, cost: 75 },
    { configurationPriceId: 'b', listPrice: 200, cashPrice: 180, cost: 150 },
  ]);
  assert.deepEqual(merged.map((entry) => [entry.changed, entry.listPrice, entry.cashPrice, entry.cost]), [
    [true, 110, 95, 75],
    [false, 200, 180, 150],
    [false, null, null, null],
  ]);
  assert.equal(mergeLaserPreview(rows, null)[0].changed, false);
});

test('regresyon: ondalıklı kayıtlı fiyat taslakta binlik sanılmaz (yalnız para birimi değişince 1.125 → 1125 olmaz)', () => {
  const rows = [{ id: id(1), salePrice: 1.125, saleCurrencyCode: 'USD' }, { id: id(2), salePrice: 30000.5, saleCurrencyCode: 'EUR' }];
  assert.equal(draftFor(rows[0], {}).salePrice, '1,125');
  assert.equal(parsePrice(draftFor(rows[0], {}).salePrice), 1.125);
  // dokunulmamış taslak kirli sayılmaz
  assert.deepEqual(dirtyDrafts(rows, { [id(1)]: draftFor(rows[0], {}), [id(2)]: draftFor(rows[1], {}) }), []);
  const currencyOnly = { [id(1)]: { ...draftFor(rows[0], {}), currency: 'EUR' } };
  assert.deepEqual(buildSaleUpdate(rows, currencyOnly), { ok: true, rows: [{ id: id(1), salePrice: 1.125, saleCurrencyCode: 'EUR' }] });
  // fiyatı girilmiş sayılır, markup üzerine yazmaz
  assert.deepEqual(applyMarkup([{ ...rows[0], costPrice: 1 }], {}, 10, true), {});
});

test('regresyon: formül taslağı ondalıklı USD değerini korur', () => {
  const formula = { appearanceUsd: 1.125, freight20Usd: 4000, freight40Usd: 7000.5, dutyRate: 0.125, fixedUsd: 3000, listMarkup: 0.3, cashMarkup: 0.25 };
  const draft = formulaToDraft(formula);
  assert.equal(draft.appearanceUsd, '1,125');
  assert.equal(draft.dutyRate, '12,5');
  assert.deepEqual(draftToFormula(draft), formula);
});
