import test from 'node:test';
import assert from 'node:assert/strict';
import {
  changeSalesPriceFilter,
  displayPrices,
  emptySalesPriceFilters,
  filterSalesPrices,
  formatPrice,
  priceOverrideMap,
  salesMachines,
  salesPriceCounts,
  salesPriceFilterOptions,
  salesPricePermissions,
  validateCampaign,
} from './sales-price.ts';

const ref = (code, name) => ({ code, name });

const machine = (id, overrides = {}) => ({
  id,
  divisionId: 'div-cnc',
  modelCode: `M-${id}`,
  modelName: null,
  fullName: `Makine ${id}`,
  series: null,
  stockCode: null,
  listPrice: '1000',
  cashPrice: '900',
  compatibleMachineTypeCode: null,
  brand: { id: 'b1', name: 'Haksan' },
  currency: { code: 'USD' },
  productGroup: ref('CNC', 'CNC'),
  category: ref('TEZGAH', 'Tezgah'),
  subcategory: ref('DIK', 'Dik'),
  productType: ref('DIK_ISLEME', 'Dik İşleme'),
  ...overrides,
});

const deps = {
  isMainMachineCategory: (code) => code === 'TEZGAH',
  machineFamilyForType: () => null,
};

test('yalnız ana makineler ve fiyat listesinin bölümü', () => {
  const rows = [
    machine('a'),
    machine('b', { category: ref('YEDEK_PARCA', 'Yedek') }),
    machine('c', { productGroup: ref('UNIVERSAL', 'Üniversal') }),
  ];
  assert.deepEqual(salesMachines(rows, { divisionId: 'div-cnc', divisionCode: 'CNC' }, deps).map((row) => row.id), ['a']);
  assert.deepEqual(salesMachines(rows, { divisionId: undefined, divisionCode: '' }, deps).map((row) => row.id), ['a', 'c']);
});

test('filtre zinciri üst seviye değişince altları sıfırlar; arama aksan duyarsız', () => {
  const next = changeSalesPriceFilter({ ...emptySalesPriceFilters(), category: 'x', type: 'y', brand: 'b1' }, 'group', 'CNC');
  assert.deepEqual(next, { group: 'CNC', category: '', subcategory: '', type: '', brand: 'b1' });
  const rows = [machine('a'), machine('b', { brand: { id: 'b2', name: 'Öztürk' } })];
  assert.deepEqual(filterSalesPrices(rows, { brand: 'b2' }).map((row) => row.id), ['b']);
  assert.deepEqual(filterSalesPrices(rows, {}, 'ozturk').map((row) => row.id), ['b']);
  assert.deepEqual(salesPriceFilterOptions(rows, 'brand').map((option) => option.label), ['Haksan', 'Öztürk']);
});

test('fiyat kalemi ürün fiyatını ezer; kalem yoksa ürün fiyatı yalnız aynı para biriminde', () => {
  const overrides = priceOverrideMap([
    {
      item: { id: 'i1', listPrice: '1200', cashPrice: null, campaignPrice: '1100', campaignValidFrom: '2026-10-01T00:00:00Z', campaignValidUntil: null, campaignIsActive: true },
      product: { id: 'a' },
    },
  ]);
  assert.equal(overrides.a.campaignValidFrom, '2026-10-01');
  assert.deepEqual(displayPrices(machine('a'), overrides.a, 'USD'), { cash: 900, list: 1200, currency: 'USD' });
  assert.deepEqual(displayPrices(machine('b'), undefined, 'EUR'), { cash: undefined, list: undefined, currency: 'EUR' });
  const counts = salesPriceCounts([machine('a'), machine('b', { listPrice: null })], overrides);
  assert.deepEqual(counts, { machines: 2, priced: 1, campaign: 1 });
  assert.equal(formatPrice(0), '—');
  assert.match(formatPrice(1500, 'TRY'), /TL$/);
});

test('kampanya doğrulaması', () => {
  assert.deepEqual(validateCampaign({ price: '', from: '', until: '', active: true }), { ok: false, error: 'Aktif kampanya için fiyat girin' });
  assert.equal(validateCampaign({ price: 'abc', from: '', until: '', active: false }).ok, false);
  assert.equal(validateCampaign({ price: '10', from: '2026-10-10', until: '2026-10-01', active: true }).error, 'Kampanya bitiş tarihi başlangıçtan önce olamaz');
  const ok = validateCampaign({ price: '1.250,5', from: '2026-10-01', until: '', active: true });
  assert.deepEqual(ok, { ok: true, value: { campaignPrice: 1250.5, campaignValidFrom: '2026-10-01', campaignValidUntil: undefined, campaignIsActive: true } });
});

test('izinler: kampanya yalnız super_admin; ürün düzenleme admin veya products.update', () => {
  assert.deepEqual(salesPricePermissions({ roles: ['admin'], permissions: ['price_lists.update'] }), { canManageCampaign: false, canEditProduct: true });
  assert.deepEqual(salesPricePermissions({ roles: ['super_admin'], permissions: [] }), { canManageCampaign: true, canEditProduct: true });
  assert.deepEqual(salesPricePermissions({ roles: ['sales'], permissions: ['products.update'] }), { canManageCampaign: false, canEditProduct: true });
  assert.deepEqual(salesPricePermissions(null), { canManageCampaign: false, canEditProduct: false });
});
