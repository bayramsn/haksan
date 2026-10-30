import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STOCK_STATUS_ACTIONS,
  brandDistribution,
  criticalMachines,
  filterStock,
  optionsByParent,
  scopeByCategory,
  specValue,
  stockCounts,
  stockExportParams,
  stockStatusLabel,
  validateStockForm,
  warehouseDistribution,
  SPINDLE_SPEED_KEYS,
  TOOL_COUNT_KEYS,
} from './stock-logic.ts';

const row = (id, overrides = {}) => ({
  id,
  serialNumber: `SN-${id}`,
  productModelId: 'p1',
  parentInventoryItemId: null,
  product: { id: 'p1', modelCode: 'VM-850', fullName: 'Dik İşleme', stockCode: 'STK-1' },
  brand: { name: 'Haksan' },
  category: { code: 'TEZGAH' },
  status: { code: 'available' },
  warehouse: { name: 'Ana Depo' },
  reservedCompany: null,
  ...overrides,
});

test('satıldı elle seçilemez; hasarlı "Pasif" olarak görünür', () => {
  assert.equal(STOCK_STATUS_ACTIONS.includes('sold'), false);
  assert.equal(stockStatusLabel('damaged', 'Hasarlı'), 'Pasif');
  assert.equal(stockStatusLabel(null), '—');
});

test('kategori kapsamı, sayaçlar ve bağlı donanım satırları', () => {
  const rows = [
    row('a'),
    row('b', { status: { code: 'reserved' }, reservedCompany: { legalTitle: 'Acme A.Ş.', shortName: 'Acme' } }),
    row('o', { category: { code: 'OPSIYONEL_DONANIM' }, parentInventoryItemId: 'a' }),
    row('n', { category: null, status: { code: 'damaged' } }),
  ];
  assert.equal(scopeByCategory(rows, 'TEZGAH').length, 3);
  assert.deepEqual(stockCounts(rows), { available: 2, reserved: 1, in_transit: 0, sold: 0, damaged: 1 });
  assert.deepEqual(filterStock(rows, { category: null, status: null, query: '' }).map((item) => item.id), ['a', 'b', 'n']);
  assert.deepEqual(
    filterStock(scopeByCategory(rows, 'OPSIYONEL_DONANIM'), { category: 'OPSIYONEL_DONANIM', status: null, query: '' }).map((item) => item.id),
    ['o'],
  );
  assert.deepEqual(filterStock(rows, { category: null, status: null, query: 'acme' }).map((item) => item.id), ['b']);
  assert.deepEqual(optionsByParent(rows).get('a').map((item) => item.id), ['o']);
});

test('kritik makine stoku: hazır ≤ 2, en az hazır önce', () => {
  const rows = [
    row('a'),
    row('b', { status: { code: 'reserved' } }),
    row('c', { productModelId: 'p2', product: { id: 'p2', modelCode: 'MT-1', fullName: 'Torna', stockCode: null }, status: { code: 'sold' } }),
    ...['d', 'e', 'f'].map((id) => row(id, { productModelId: 'p3', product: { id: 'p3', modelCode: 'X', fullName: 'X', stockCode: null } })),
  ];
  const critical = criticalMachines(rows);
  assert.deepEqual(critical.map((item) => item.productId), ['p2', 'p1']);
  assert.equal(critical[0].out, true);
  assert.equal(critical[1].reserved, 1);
});

test('depo ve marka dağılımı', () => {
  const rows = [row('a'), row('b', { warehouse: { name: 'Şube' }, brand: { name: 'Doosan' } }), row('c')];
  assert.deepEqual(warehouseDistribution(rows), [{ name: 'Ana Depo', count: 2 }, { name: 'Şube', count: 1 }]);
  assert.equal(brandDistribution(rows)[0].name, 'Haksan');
  assert.equal(brandDistribution(rows)[0].count, 2);
});

test('teknik özellik anahtar kelimeyle bulunur', () => {
  const specs = [
    { key: 'Fener Mili Devri', value: '12.000 dev/dk' },
    { key: 'Takım Kapasitesi', value: '24' },
  ];
  assert.equal(specValue(specs, SPINDLE_SPEED_KEYS), '12.000 dev/dk');
  assert.equal(specValue(specs, TOOL_COUNT_KEYS), '24');
  assert.equal(specValue(undefined, TOOL_COUNT_KEYS), '—');
});

test('form doğrulaması ve dışa aktarım parametreleri', () => {
  const base = {
    categoryCode: 'TEZGAH',
    productModelId: 'p1',
    serialNumber: 'SN-1',
    controlUnit: '',
    warehouseId: 'w1',
    loadingDate: '',
    receivedDate: '',
    arrivalDate: '',
  };
  const taken = new Set(['SN-2']);
  assert.equal(validateStockForm(base, { mode: 'create', takenSerials: taken }).title, 'Tezgah için kontrol ünitesi zorunludur');
  assert.equal(validateStockForm({ ...base, controlUnit: 'Fanuc', warehouseId: '' }, { mode: 'create', takenSerials: taken }).title, 'Ürünün bulunduğu depoyu seçiniz');
  assert.equal(validateStockForm({ ...base, controlUnit: 'Fanuc', serialNumber: 'SN-2' }, { mode: 'create', takenSerials: taken }).title, 'Bu seri numarası zaten kayıtlı');
  assert.equal(validateStockForm(base, { mode: 'edit', existingControlUnit: 'Fanuc', takenSerials: taken }).title, 'Tezgahın kontrol ünitesi boş bırakılamaz');
  assert.deepEqual(validateStockForm({ ...base, warehouseId: '' }, { mode: 'edit', existingControlUnit: null, takenSerials: taken }), { ok: true });
  assert.deepEqual(stockExportParams({ category: 'TEZGAH', status: 'damaged', query: 'vm' }), { search: 'vm', statusCode: 'damaged', categoryCode: 'TEZGAH' });
  assert.deepEqual(stockExportParams({ category: null, status: null, query: '' }), {});
});

import { bulkSerials, stockConditionLabel, stockExtraNotes } from './stock-logic.ts';

test('bulkSerials: model önekinden çakışmasız seri no üretir', () => {
  assert.deepEqual(bulkSerials('VM-850 / S', 3, new Set(['VM850S-002'])), ['VM850S-001', 'VM850S-003', 'VM850S-004']);
  assert.deepEqual(bulkSerials('', 1, new Set()), ['URUN-001']);
});

test('stockExtraNotes ve kondisyon etiketi web ile aynı', () => {
  assert.equal(stockExtraNotes(' Döner tabla ', ''), 'Opsiyon Donanım: Döner tabla');
  assert.equal(stockExtraNotes('A', 'B'), 'Opsiyon Donanım: A\nYedek Parça: B');
  assert.equal(stockConditionLabel(null), 'Yeni');
  assert.equal(stockConditionLabel('used'), 'Kullanılmış');
});
