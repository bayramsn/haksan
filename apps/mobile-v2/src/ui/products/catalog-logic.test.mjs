import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_TAXONOMY,
  catalogView,
  changeTaxonomy,
  optionalEquipmentTotals,
  productFamilyLabel,
  productSeriesLabel,
  taxonomyOptions,
  visibleCatalog,
} from './catalog-logic.ts';

const ref = (code, name) => ({ code, name });

const product = (id, overrides = {}) => ({
  id,
  modelCode: 'VM-850',
  modelName: null,
  fullName: `Ürün ${id}`,
  series: null,
  stockCode: null,
  brand: { name: 'Haksan' },
  productGroup: ref('CNC', 'CNC'),
  category: ref('TEZGAH', 'Tezgah'),
  subcategory: ref('DIK', 'Dik İşleme'),
  productType: ref('CNC_DIK_ISLEME', 'Dik İşleme Merkezi'),
  ...overrides,
});

test('seri model kodundan türetilir; aile CNC alt ailesine ayrılır', () => {
  assert.equal(productSeriesLabel(product('a')), 'VM Serisi');
  assert.equal(productSeriesLabel(product('b', { series: 'MT serisi' })), 'MT Serisi');
  assert.equal(productSeriesLabel(product('c', { modelCode: 'XYZ' })), 'Serisiz');
  assert.equal(productFamilyLabel(product('a')), 'CNC Dik İşleme Merkezleri');
  assert.equal(productFamilyLabel(product('d', { category: ref('YEDEK_PARCA', 'Yedek Parça') })), 'Yedek Parça');
});

test('servis rolü yalnız yedek parça/işçilik görür; bölüm kodu ürün grubuyla eşleşir', () => {
  const rows = [product('a'), product('b', { category: ref('YEDEK_PARCA', 'Yedek Parça') }), product('c', { productGroup: ref('UNIVERSAL', 'Üniversal') })];
  assert.deepEqual(visibleCatalog(rows, { roles: ['service'], divisionCode: null }).map((row) => row.id), ['b']);
  assert.equal(visibleCatalog(rows, { roles: ['service', 'admin'], divisionCode: null }).length, 3);
  assert.deepEqual(visibleCatalog(rows, { roles: ['sales'], divisionCode: 'universal' }).map((row) => row.id), ['c']);
});

test('taksonomi seçenekleri üst seçimden türetilir, üst değişince alt sıfırlanır', () => {
  const rows = [product('a'), product('b', { productGroup: ref('UNIVERSAL', 'Üniversal'), category: ref('FREZE', 'Freze') })];
  const options = taxonomyOptions(rows, { ...EMPTY_TAXONOMY, group: 'Üniversal' });
  assert.deepEqual(options.category, ['Freze']);
  const changed = changeTaxonomy({ group: 'CNC', category: 'Tezgah', subcategory: 'x', type: 'y' }, 'category', 'Freze');
  assert.deepEqual(changed, { group: 'CNC', category: 'Freze', subcategory: 'all', type: 'all' });
});

test('katalog görünümü KPI, aile, seri ve aramayı birlikte uygular', () => {
  const rows = [
    product('a', { brand: { name: 'B' } }),
    product('b', { brand: { name: 'A' }, modelCode: 'MT-200', productType: ref('CNC_TORNA', 'Torna') }),
    product('c', { category: ref('YEDEK_PARCA', 'Yedek Parça'), modelCode: 'RLM-1', fullName: 'Rulman' }),
  ];
  const all = catalogView(rows, { taxonomy: EMPTY_TAXONOMY, family: 'all', series: 'all', query: '' });
  assert.deepEqual(all.kpis, { total: 3, families: 3, series: 3 });
  assert.deepEqual(all.rows.map((row) => row.id), ['b', 'a', 'c']);
  const search = catalogView(rows, { taxonomy: EMPTY_TAXONOMY, family: 'all', series: 'all', query: 'rulman' });
  assert.deepEqual(search.rows.map((row) => row.id), ['c']);
  const series = catalogView(rows, { taxonomy: EMPTY_TAXONOMY, family: 'all', series: 'MT Serisi', query: '' });
  assert.deepEqual(series.rows.map((row) => row.id), ['b']);
  const missingFamily = catalogView(rows, { taxonomy: EMPTY_TAXONOMY, family: 'Yok', series: 'all', query: '' });
  assert.equal(missingFamily.family, 'all');
});

test('opsiyonel donanım toplamı yalnız seçilenleri ve para birimi bazında toplar', () => {
  const totals = optionalEquipmentTotals(
    [
      { id: '1', listPrice: '100', currencyCode: 'USD' },
      { id: '2', listPrice: '50', currencyCode: 'EUR' },
      { id: '3', listPrice: '25', currencyCode: 'USD' },
    ],
    new Set(['1', '2', '3']),
  );
  assert.deepEqual(totals, [{ currencyCode: 'USD', amount: 125 }, { currencyCode: 'EUR', amount: 50 }]);
  assert.deepEqual(optionalEquipmentTotals([{ id: '1', listPrice: '100', currencyCode: 'USD' }], new Set()), []);
});
