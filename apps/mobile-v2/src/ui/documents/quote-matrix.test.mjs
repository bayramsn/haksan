import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteItemCompatibilitySchema } from '@haksan/shared';
import {
  configurationPriceFor,
  deliveryForSavedPriceList,
  groupPriceRows,
  laserPriceListForDelivery,
  matrixConfigurationSetIds,
  matrixPriceLists,
  matrixPriceRow,
  quoteConfigurationChoices,
  quoteMatrixPrice,
  removeQuoteOption,
} from './quote-configuration.ts';
import { parseQuoteItems } from './quote-logic.ts';

const table = { id: 'table', name: 'Tabla', configurationKind: 'table', values: [
  { id: 't1', value: '3015', priceDelta: '0', currencyCode: 'USD', sourceModelCode: 'F3015' },
  { id: 't2', value: '4020', priceDelta: '0', currencyCode: 'USD', sourceModelCode: 'F4020' },
] };
const power = { id: 'power', name: 'Güç', configurationKind: 'power', values: [
  { id: 'p6', value: '6 kW', priceDelta: '0', currencyCode: 'USD', powerKw: '6' },
  { id: 'p12', value: '12 kW', priceDelta: '0', currencyCode: 'USD', powerKw: 12 },
] };
const extra = { id: 'extra', name: 'Kompresör', configurationKind: null, values: [{ id: 'c', value: 'Var', priceDelta: '900', currencyCode: 'USD' }] };
const sets = [table, power, extra];
const pick = (setId, valueId) => ({ optionSetId: setId, optionValueId: valueId, name: setId, value: valueId, priceDelta: 0, currencyCode: 'USD' });
const lists = [
  { code: 'LAZER-CIF-IST', name: 'Fiber Lazer Kesim – CIF İstanbul Gümrük Teslim', listPrice: 41000, cashPrice: 39000 },
  { code: 'LAZER-MILLI-IST', name: 'Fiber Lazer Kesim – Millileştirilmiş Antrepo Teslim İstanbul', listPrice: 52000, cashPrice: 50000 },
];
const matrix = [
  { id: 'm1', sourceModelCode: 'F3015', powerKw: 6, salePrice: 30000, saleCurrencyCode: 'USD', listPrices: lists },
  { id: 'm2', sourceModelCode: 'F3015', powerKw: 12, salePrice: null, saleCurrencyCode: null },
  { id: 'm3', sourceModelCode: 'F4020', powerKw: 6, salePrice: 28000, saleCurrencyCode: 'EUR' },
];

test('teslim şekli ↔ lazer fiyat listesi', () => {
  assert.equal(laserPriceListForDelivery('cif_istanbul'), 'LAZER-CIF-IST');
  assert.equal(laserPriceListForDelivery('nationalized'), 'LAZER-MILLI-IST');
  assert.equal(laserPriceListForDelivery('fob'), null);
  assert.equal(deliveryForSavedPriceList([null, { priceListCode: 'LAZER-MILLI-IST' }]), 'nationalized');
  assert.equal(deliveryForSavedPriceList([{ sourceModelCode: 'F3015', powerKw: 6, salePrice: 1, currencyCode: 'USD' }]), null);
});

test('configurationPriceFor: listede varsa liste fiyatı (USD), yoksa kart satış fiyatı', () => {
  assert.deepEqual(configurationPriceFor(matrix[0], 'LAZER-CIF-IST'), { salePrice: 41000, currencyCode: 'USD', cashPrice: 39000, priceListCode: 'LAZER-CIF-IST' });
  assert.deepEqual(configurationPriceFor(matrix[0], null), { salePrice: 30000, currencyCode: 'USD' });
  assert.deepEqual(configurationPriceFor(matrix[2], 'LAZER-CIF-IST'), { salePrice: 28000, currencyCode: 'EUR' });
  assert.equal(configurationPriceFor(matrix[1], null), null);
  assert.equal(configurationPriceFor(undefined, null), null);
});

test('matrixPriceRow: tabla kaynak modeli + güç kW eşleşir (metin kW sayıya çevrilir)', () => {
  assert.equal(matrixPriceRow(sets, [pick('table', 't1'), pick('power', 'p6')], matrix).row.id, 'm1');
  assert.equal(matrixPriceRow(sets, [pick('table', 't1')], matrix).row, undefined);
  assert.equal(matrixPriceRow(sets, [pick('table', 't2'), pick('power', 'p12')], matrix).row, undefined);
});

test('quoteMatrixPrice: fiyat, para birimi uyuşmazlığı ve fiyatsız satır', () => {
  const selected = [pick('table', 't1'), pick('power', 'p6')];
  assert.deepEqual(quoteMatrixPrice(sets, selected, matrix, null, 'USD'), {
    configurationPrice: { sourceModelCode: 'F3015', powerKw: 6, salePrice: 30000, currencyCode: 'USD' },
    unitPrice: '30000',
    notice: null,
  });
  const cif = quoteMatrixPrice(sets, selected, matrix, 'LAZER-CIF-IST', 'USD');
  assert.equal(cif.unitPrice, '41000');
  assert.equal(cif.configurationPrice.priceListCode, 'LAZER-CIF-IST');
  assert.match(cif.notice.message, /son fiyat 39\.000 USD/);
  // sunucu şeması kabul eder
  assert.equal(quoteItemCompatibilitySchema.safeParse({ configurationPrice: cif.configurationPrice }).success, true);

  const eur = quoteMatrixPrice(sets, [pick('table', 't2'), pick('power', 'p6')], matrix, null, 'USD');
  assert.equal(eur.configurationPrice, null);
  assert.equal(eur.unitPrice, undefined);
  assert.equal(eur.notice.tone, 'error');

  const unpriced = quoteMatrixPrice(sets, [pick('table', 't1'), pick('power', 'p12')], matrix, null, 'USD');
  assert.equal(unpriced.configurationPrice, null);
  assert.match(unpriced.notice.message, /satış fiyatı girilmemiş/);

  assert.deepEqual(quoteMatrixPrice(sets, selected, [], null, 'USD'), { configurationPrice: null, notice: null });
});

test('matrisli kartta konfigürasyon grupları alt satır açmaz; matris yoksa açar', () => {
  assert.deepEqual([...matrixConfigurationSetIds(sets, matrix)].sort(), ['power', 'table']);
  assert.equal(matrixConfigurationSetIds(sets, []).size, 0);
});

test('seçici: güç listesi seçili modelin matris güçleriyle sınırlanır ve fiyat gösterilir', () => {
  const selected = [pick('table', 't2')];
  assert.deepEqual(quoteConfigurationChoices(power, sets, selected, matrix, null, 'USD'), [{ value: 'p6', label: '6 kW · 28.000 EUR' }]);
  assert.deepEqual(quoteConfigurationChoices(power, sets, [pick('table', 't1')], matrix, 'LAZER-CIF-IST', 'USD').map((row) => row.label), [
    '6 kW · 41.000 USD (son 39.000)',
    '12 kW · satış fiyatı girilmemiş',
  ]);
  assert.deepEqual(quoteConfigurationChoices(table, sets, [], matrix, null, 'USD').map((row) => row.label), ['3015', '4020']);
  assert.deepEqual(quoteConfigurationChoices(extra, sets, [], matrix, null, 'USD'), [{ value: 'c', label: 'Var · +900 USD' }]);
  // matris yoksa web'deki ek fiyat etiketi
  assert.equal(quoteConfigurationChoices(power, sets, [], [], null, 'USD')[0].label, '6 kW · +0 USD');
});

test('parseQuoteItems configurationPrice taşır; yoksa alan eklenmez (kayıtlı snapshot korunur)', () => {
  const base = {
    key: 'k', description: 'Lazer', quantity: '1', unitPrice: '41000', discount: '', discountType: 'amount', vatRate: '20',
    nationalized: false, lineGroupKey: 'lg', selectedProductOptions: [], technicalSpecs: [], technicalConfiguration: null,
    compatibilityFilters: { machineIds: [], brands: [], controlUnits: [], supplierIds: [] }, optionChildren: [], configurationChanged: true,
  };
  const price = { sourceModelCode: 'F3015', powerKw: 6, salePrice: 41000, currencyCode: 'USD', priceListCode: 'LAZER-CIF-IST' };
  assert.deepEqual(parseQuoteItems([{ ...base, configurationPrice: price }]).items[0].compatibility.configurationPrice, price);
  assert.equal('configurationPrice' in parseQuoteItems([base]).items[0].compatibility, false);
});

test('katalog opsiyonu silinince model fiyatı da düşer', () => {
  const item = { selectedProductOptions: [pick('extra', 'c')], optionChildren: [{ key: 'child', optionSetId: 'extra' }], configurationPrice: { salePrice: 1 } };
  assert.equal(removeQuoteOption(item, 'child').configurationPrice, null);
});

test('ürün detayı: alt model sırası ve listeler', () => {
  const groups = groupPriceRows([...matrix].reverse(), ['F4020', 'F3015']);
  assert.deepEqual(groups.map((group) => [group.model, group.rows.map((row) => row.powerKw)]), [['F4020', [6]], ['F3015', [6, 12]]]);
  assert.deepEqual(groupPriceRows(matrix).map((group) => group.model), ['F3015', 'F4020']);
  assert.deepEqual(matrixPriceLists(matrix), [
    { code: 'LAZER-CIF-IST', name: 'CIF İstanbul Gümrük Teslim' },
    { code: 'LAZER-MILLI-IST', name: 'Millileştirilmiş Antrepo Teslim İstanbul' },
  ]);
});
