import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLookupCsv,
  canRevertLookupAudit,
  divisionCatalogGroupCode,
  filterLookupRows,
  isCncDivision,
  lookupMenuGroups,
  lookupRevertPlan,
  moveLookupRow,
  resolveSettingsDivision,
  specGroupTypeSummary,
} from './lookup-meta.ts';

const divisions = [
  { id: 'cnc', code: 'CNC', name: 'CNC' },
  { id: 'uni', code: 'ÜNİVERSAL', name: 'Üniversal' },
  { id: 'sac', code: 'SAC_ISLEME', name: 'Sac İşleme' },
  { id: 'x', code: 'GEN', name: 'Genel' },
];

test('division catalog mapping and settings division resolve', () => {
  assert.equal(divisionCatalogGroupCode(divisions, 'uni'), 'UNIVERSAL');
  assert.equal(divisionCatalogGroupCode(divisions, 'sac'), 'SAC_ISLEME');
  assert.equal(divisionCatalogGroupCode(divisions, 'x'), undefined);
  assert.equal(isCncDivision(divisions, 'cnc'), true);
  assert.equal(resolveSettingsDivision(divisions, 'x', 'sac'), 'sac');
  assert.equal(resolveSettingsDivision(divisions, null, null), 'cnc');
});

test('menu groups put unknown lists under Diğer and filter by label', () => {
  const groups = lookupMenuGroups(['units', 'zz-custom', 'brands'], '');
  assert.deepEqual(groups.map((g) => g.label), ['Ürün', 'Diğer']);
  assert.deepEqual(lookupMenuGroups(['units', 'brands'], 'marka').flatMap((g) => g.names), ['brands']);
});

const rows = [
  { id: 'a', code: 'A', name: 'Alfa', isActive: true, divisionId: 'uni', categoryId: 'p1' },
  { id: 'b', code: 'B', name: 'Beta', isActive: false, divisionId: null, categoryId: null },
  { id: 'c', code: 'C', name: 'Gama', isActive: true, divisionId: 'uni', categoryId: 'p2' },
];

test('filterLookupRows honours status, shared, parent and search', () => {
  const base = { query: '', status: 'all', scoped: true, includeShared: true, parentField: 'categoryId', parentFilterId: 'all' };
  assert.equal(filterLookupRows(rows, base).length, 3);
  assert.deepEqual(filterLookupRows(rows, { ...base, includeShared: false }).map((r) => r.id), ['a', 'c']);
  assert.deepEqual(filterLookupRows(rows, { ...base, status: 'passive' }).map((r) => r.id), ['b']);
  assert.deepEqual(filterLookupRows(rows, { ...base, parentFilterId: 'p1' }).map((r) => r.id), ['a', 'b']);
  assert.deepEqual(filterLookupRows(rows, { ...base, query: 'gam' }).map((r) => r.id), ['c']);
});

test('moveLookupRow swaps within visible rows and renumbers', () => {
  const visible = [rows[0], rows[2]];
  const next = moveLookupRow(rows, visible, 'c', -1);
  assert.deepEqual(next.map((r) => r.id), ['c', 'b', 'a']);
  assert.deepEqual(next.map((r) => r.sortOrder), [10, 20, 30]);
  assert.equal(moveLookupRow(rows, visible, 'a', -1), null);
});

test('spec group summary and csv export', () => {
  const names = new Map([['t1', 'Torna'], ['t2', 'Freze'], ['t3', 'Taşlama']]);
  assert.equal(specGroupTypeSummary([], names), 'Tüm tipler');
  assert.equal(specGroupTypeSummary(['t1', 't2', 't3'], names), 'Torna, Freze +1');
  const csv = buildLookupCsv([{ ...rows[0], description: 'a;b', sortOrder: 10 }], {
    isBrand: false,
    parent: { label: 'Ürün Kategorisi', field: 'categoryId' },
    isSpecGroup: false,
    divisionLabel: () => 'Üniversal',
    parentName: () => 'Tezgah',
    productTypeName: () => undefined,
  });
  const [header, line] = csv.replace(/^\uFEFF/, '').split('\n');
  assert.equal(header, 'Ad;Açıklama;Durum;Sıra;İl;Bölüm;Bağlı Olduğu Ürün Kategorisi;Sistem Kodu');
  assert.equal(line, 'Alfa;"a;b";Aktif;10;;Üniversal;Tezgah;A');
});

test('revert plan', () => {
  const ctx = { isTaxOffice: false, scoped: true, parentField: 'categoryId', isSpecGroup: false };
  assert.deepEqual(lookupRevertPlan({ action: 'lookup.created', resourceId: 'r1', oldValues: null }, ctx), { kind: 'delete', id: 'r1' });
  const plan = lookupRevertPlan({ action: 'lookup.updated', resourceId: 'r2', oldValues: { id: 'r2', name: 'Eski', categoryId: 'p1', isActive: false } }, ctx);
  assert.equal(plan.kind, 'update');
  assert.equal(plan.body.parentId, 'p1');
  assert.equal(plan.body.isActive, false);
  assert.equal(lookupRevertPlan({ action: 'lookup.reordered', resourceId: null, oldValues: null }, ctx), null);
  assert.equal(canRevertLookupAudit({ action: 'lookup.reordered', resourceId: null, oldValues: null }), false);
});
