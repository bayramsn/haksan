import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSpecDraft,
  filterImportRows,
  groupSpecRows,
  importCounts,
  isTechnicalImportFile,
  retargetImportRow,
  moveSpecRow,
  parseSpecOptions,
  specDraftToBatch,
  specTemplateStats,
  typeCodeFromName,
  validateSpecDraft,
} from './spec-template-model.ts';

const row = (id, specKey, extra = {}) => ({
  id,
  productTypeCode: 'CNC_TORNA',
  specKey,
  specGroupCode: 'GENEL',
  defaultValue: null,
  specUnit: null,
  specOptions: null,
  divisionId: null,
  sortOrder: 0,
  isActive: true,
  isDeleted: false,
  ...extra,
});

test('division row overrides shared row with same key and sorts', () => {
  const draft = buildSpecDraft('cnc torna', [
    row('a', 'Mil Devri', { sortOrder: 2 }),
    row('b', 'mil devri', { divisionId: 'd1', sortOrder: 2, defaultValue: '6000' }),
    row('c', 'Tabla', { sortOrder: 1 }),
    row('x', 'Başka', { productTypeCode: 'FREZE' }),
  ]);
  assert.deepEqual(draft.map((r) => r.id), ['c', 'b']);
  assert.equal(draft[1].defaultValue, '6000');
});

test('stats, validation and batch body', () => {
  const rows = [row('a', 'A'), row('b', 'B', { isActive: false, specGroupCode: 'EKSEN' }), row('c', 'C', { isDeleted: true })];
  assert.deepEqual(specTemplateStats('CNC_TORNA', rows), { total: 2, active: 1, groups: 2 });
  const draft = buildSpecDraft('CNC_TORNA', rows);
  assert.equal(validateSpecDraft(draft), null);
  assert.match(validateSpecDraft([...draft, { ...draft[0], clientId: 'n', id: undefined, specKey: ' a ' }]), /birden fazla/);
  assert.match(validateSpecDraft([{ ...draft[0], specKey: ' ' }]), /boş/);
  const body = specDraftToBatch('CNC_TORNA', 'd1', [{ ...draft[0], defaultValue: '  ', unit: 'mm' }]);
  assert.equal(body.pruneMissing, true);
  assert.equal(body.items[0].defaultValue, null);
  assert.equal(body.items[0].specUnit, 'mm');
  assert.equal(body.items[0].divisionId, 'd1');
});

test('move takes target group and grouping', () => {
  const draft = buildSpecDraft('CNC_TORNA', [
    row('a', 'A', { sortOrder: 0 }),
    row('b', 'B', { sortOrder: 1, specGroupCode: 'EKSEN' }),
    row('c', 'C', { sortOrder: 2, specGroupCode: 'EKSEN' }),
  ]);
  const moved = moveSpecRow(draft, 'a', 1);
  assert.deepEqual(moved.map((r) => `${r.clientId}:${r.groupCode}`), ['b:EKSEN', 'a:EKSEN', 'c:EKSEN']);
  assert.equal(moveSpecRow(draft, 'a', -1), draft);
  assert.deepEqual(groupSpecRows(draft).map((g) => g.rows.length), [1, 2]);
});

test('technical import filter, counts and retarget', () => {
  const base = { sheetName: 'S1', section: 'GENEL', sourceValue: '', sourceUnit: 'mm', targetGroupCode: 'GENEL', targetUnit: '' };
  const rows = [
    { ...base, rowNumber: 1, sourceKey: 'Strok', targetKey: 'Strok', matchStatus: 'exact', include: true },
    { ...base, rowNumber: 2, sourceKey: 'Mil', targetKey: 'Mil Devri', matchStatus: 'review', include: true },
    { ...base, rowNumber: 3, sourceKey: 'Xyz', targetKey: '', matchStatus: 'unmatched', include: false },
  ];
  assert.deepEqual(importCounts(rows), { total: 3, ready: 2, review: 1, unmatched: 1 });
  assert.equal(filterImportRows(rows, 'review', '').length, 1);
  assert.equal(filterImportRows(rows, 'all', 'mil devri').length, 1);
  const patched = retargetImportRow(rows[2], 'Tabla', [{ key: 'Tabla', groupCode: 'EKSEN' }]);
  assert.equal(patched.matchStatus, 'review');
  assert.equal(patched.include, true);
  assert.equal(patched.targetGroupCode, 'EKSEN');
  assert.equal(patched.targetUnit, 'mm');
  const cleared = retargetImportRow(rows[0], '', []);
  assert.equal(cleared.include, false);
  assert.equal(cleared.matchStatus, 'unmatched');
  assert.equal(isTechnicalImportFile('Föy.XLSX'), true);
  assert.equal(isTechnicalImportFile('a.pdf'), false);
});

test('options parsing and type code', () => {
  assert.deepEqual(parseSpecOptions('BT-40, BT-50;BT-40\n'), ['BT-40', 'BT-50']);
  assert.equal(typeCodeFromName('CNC Dik İşleme Merkezi'), 'CNC_DIK_ISLEME_MERKEZI');
});
