import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_PRODUCT_FORM,
  buildDetailsPayload,
  buildProductBody,
  compactProductCode,
  equipmentFromLines,
  parseMoney,
  taxonomyChildren,
  validateProductForm,
} from './product-form.ts';

const base = { ...EMPTY_PRODUCT_FORM, productGroupCode: 'CNC', categoryCode: 'TEZGAH', productTypeCode: 'DIK', brandId: 'b1', fullName: 'Dik İşleme' };

test('parseMoney TR ve EN biçimlerini okur', () => {
  assert.equal(parseMoney('1.234,50'), 1234.5);
  assert.equal(parseMoney('1234.5'), 1234.5);
  assert.equal(parseMoney(''), undefined);
  assert.equal(parseMoney('abc'), undefined);
});

test('validateProductForm web sırasıyla hata verir', () => {
  assert.deepEqual(validateProductForm({ ...base, productTypeCode: '' }), { ok: false, title: 'Ürün tipi seçin' });
  assert.deepEqual(validateProductForm({ ...base, productGroupCode: '' }), { ok: false, title: 'Ürün grubu seçin' });
  assert.deepEqual(validateProductForm({ ...base, brandId: '' }), { ok: false, title: 'Marka ve ürün adı zorunludur' });
  assert.deepEqual(validateProductForm({ ...base, categoryCode: 'ISCILIK', brandId: '', fullName: '' }), { ok: false, title: 'Ürün adı zorunludur' });
  assert.deepEqual(validateProductForm({ ...base, listPrice: 'x' }), { ok: false, title: 'Liste Fiyatı geçersiz' });
  assert.deepEqual(validateProductForm(base), { ok: true });
});

test('buildProductBody model kodu önceliği, seri ve muadil kuralları', () => {
  const body = buildProductBody({ ...base, series: ' VM ', listPrice: '10,5', muadilProductIds: ['m1'] });
  assert.equal(body.modelCode, 'DIK-ISLEME');
  assert.equal(body.series, 'VM');
  assert.equal(body.listPrice, 10.5);
  assert.equal(body.cashPrice, null);
  assert.equal(body.muadilProductId, 'm1');
  const optional = buildProductBody({ ...base, categoryCode: 'OPSIYONEL_DONANIM', series: 'VM', modelCode: 'X1', muadilProductIds: ['m1'] });
  assert.equal(optional.series, '');
  assert.equal(optional.modelCode, 'X1');
  assert.deepEqual(optional.muadilProductIds, []);
  assert.equal(compactProductCode('Çok Şık ürün'), 'COK-SIK-URUN');
});

test('equipmentFromLines mevcut kalem bilgisini korur', () => {
  const previous = [{ title: 'Soğutma', description: 'detay', isPromotion: true }];
  assert.deepEqual(equipmentFromLines('Soğutma\n\n Konveyör ', previous), [
    previous[0],
    { title: 'Konveyör', description: null, isPromotion: false },
  ]);
});

test('buildDetailsPayload boş anahtarı atlar, boş değere "-" yazar', () => {
  const payload = buildDetailsPayload({
    specs: [
      { key: 'Devir', value: '', unit: 'rpm', groupCode: null },
      { key: ' ', value: 'x', unit: '', groupCode: 'G' },
    ],
    standard: [{ title: 'A', description: null, isPromotion: false }],
    optional: [{ title: 'B', description: 'd', isPromotion: true }],
  });
  assert.deepEqual(payload.specs, [{ specGroupCode: 'GENEL', specKey: 'Devir', specValue: '-', specUnit: 'rpm', sortOrder: 1 }]);
  assert.deepEqual(payload.equipment, [
    { equipmentTypeCode: 'standart', title: 'A', isPromotion: false, sortOrder: 1 },
    { equipmentTypeCode: 'opsiyonel', title: 'B', description: 'd', isPromotion: true, sortOrder: 1 },
  ]);
});

test('taxonomyChildren üst seçime göre süzer', () => {
  const rows = [
    { id: '1', code: 'A', name: 'Bir', parent: 'g1' },
    { id: '2', code: 'B', name: 'Ana', parent: 'g2' },
    { id: '3', code: 'C', name: 'Ortak', parent: null },
  ];
  assert.deepEqual(taxonomyChildren(rows, 'g1', (row) => row.parent).map((row) => row.id), ['1', '3']);
  assert.deepEqual(taxonomyChildren(rows, null, (row) => row.parent).map((row) => row.id), ['2', '1', '3']);
});
