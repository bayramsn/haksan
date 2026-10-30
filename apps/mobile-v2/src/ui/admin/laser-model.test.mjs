import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addLaserSpec,
  changeLaserSelection,
  completeLaserSelection,
  editLaserSpec,
  isLaserCatalogBrand,
  isLaserImportFile,
  laserCabinHint,
  laserCounts,
  laserSeriesOptions,
  moveLaserSpec,
  powerLabel,
  removeLaserSpec,
  resetLaserSpec,
} from './laser-model.ts';

test('brand filter matches catalog code or AORE/HEX name', () => {
  assert.equal(isLaserCatalogBrand({ name: 'X', technicalCatalogCode: 'AORE_LASER' }), true);
  assert.equal(isLaserCatalogBrand({ name: 'Hex Laser' }), true);
  assert.equal(isLaserCatalogBrand({ name: 'AORE' }), true);
  assert.equal(isLaserCatalogBrand({ name: 'AORE', isActive: false }), false);
  assert.equal(isLaserCatalogBrand({ name: 'Bodor' }), false);
});

test('selection cascade drops descendants and completes', () => {
  const full = { productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', cabinType: 'open', powerKw: 3, sourceModelCode: 'F3015' };
  assert.deepEqual(changeLaserSelection(full, 'cabinType', 'closed'), { productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', cabinType: 'closed' });
  assert.equal(changeLaserSelection(full, 'powerKw', '1.5').powerKw, 1.5);
  assert.equal(completeLaserSelection(full), full);
  assert.equal(completeLaserSelection({ ...full, sourceModelCode: undefined }), null);
});

test('spec edit, reset, move, add, remove and counts', () => {
  const spec = { key: 'Tabla', value: '3000', unit: 'mm', groupCode: 'GENEL' };
  const edited = editLaserSpec(spec, '3100');
  assert.equal(edited.isManual, true);
  assert.equal(edited.sourceValue, '3000');
  assert.deepEqual(resetLaserSpec(edited).value, '3000');
  assert.equal(editLaserSpec(edited, '3000').isManual, false);
  const specs = [spec, { key: 'Lazer Gücü', value: '3', unit: 'kW' }, { key: 'Boş', value: '' }];
  assert.deepEqual(moveLaserSpec(specs, 0, 1).map((s) => s.key), ['Lazer Gücü', 'Tabla', 'Boş']);
  assert.equal(moveLaserSpec(specs, 0, -1), specs);
  assert.equal(removeLaserSpec(specs, 1), specs);
  assert.equal(removeLaserSpec(specs, 2).length, 2);
  assert.equal(addLaserSpec(specs).at(-1).key, 'Yeni teknik bilgi 1');
  assert.deepEqual(laserCounts({ specs: [edited, ...specs.slice(1)] }), { source: 1, manual: 1, missing: 1 });
});

test('hints, series options and helpers', () => {
  assert.match(laserCabinHint({ series: 'F' }, []), /tek tabla/);
  assert.match(laserCabinHint({ series: 'X' }, [{ standardCabin: 'closed' }]), /Kaynak: kapalı/);
  assert.deepEqual(
    laserSeriesOptions([{ series: 'F', productTypeCode: 'A' }, { series: 'F', productTypeCode: 'A' }, { series: 'T', productTypeCode: 'B' }], 'A'),
    ['F']
  );
  assert.equal(powerLabel(1.5), '1,5 kW');
  assert.equal(isLaserImportFile('a.XLSX'), true);
  assert.equal(isLaserImportFile('a.csv'), false);
});
