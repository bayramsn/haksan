import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoRows,
  emptyReferenceForm,
  filterReferenceRows,
  formatReferenceDate,
  importFileProblem,
  manualRows,
  referenceFormFromRecord,
  referenceLocation,
  referencePayload,
  referenceStats,
  referenceTemplateCsv,
} from './referenceLogic.ts';

const record = {
  id: 'r1',
  firm: 'Acme Makina',
  contact: null,
  district: 'Nilüfer',
  city: 'Bursa',
  brand: 'AORE',
  model: 'PG3015',
  deliveryDate: '2026-09-11',
  notes: null,
};

const devices = [
  { id: 'd1', opportunityId: 'o1', deliveryDate: null, installationDate: '2026-02-01', company: { legalTitle: 'Beta A.Ş.', shortName: null }, brandName: 'HEX', model: null, productModelName: 'F3015' },
  { id: 'd2', opportunityId: 'o2', deliveryDate: '2026-01-01', installationDate: null, company: null, brandName: null, model: 'X', productModelName: null },
  { id: 'd3', opportunityId: null, deliveryDate: null, installationDate: null, company: null, brandName: null, model: null, productModelName: null },
];

test('manual and automatic rows merge like web', () => {
  const rows = [...manualRows([record]), ...autoRows(devices, new Set(['o1']))];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].contact, '—');
  assert.equal(rows[1].record, null);
  assert.equal(rows[1].firm, 'Beta A.Ş.');
  assert.equal(rows[1].model, 'F3015');
  assert.equal(rows[1].deliveryDate, '2026-02-01');
});

test('search covers firm, location, brand and model (Turkish case)', () => {
  const rows = manualRows([record, { ...record, id: 'r2', firm: 'İzmir Kesim', city: 'İzmir', brand: 'HEX' }]);
  assert.equal(filterReferenceRows(rows, 'izmir').length, 1);
  assert.equal(filterReferenceRows(rows, 'aore').length, 1);
  assert.equal(filterReferenceRows(rows, '  ').length, 2);
});

test('stats ignore dash placeholders', () => {
  const rows = [...manualRows([record]), ...autoRows(devices, new Set(['o1', 'o2']))];
  assert.deepEqual(referenceStats(rows), { delivered: 3, firms: 3, cities: 1, brands: 2 });
});

test('location and date formatting', () => {
  assert.equal(referenceLocation({ district: 'Nilüfer', city: 'Bursa' }), 'Nilüfer / Bursa');
  assert.equal(referenceLocation({ district: '—', city: '—' }), 'Konum belirtilmedi');
  assert.equal(formatReferenceDate(undefined), '—');
  assert.equal(formatReferenceDate('2026-09-11', 'short'), '11.09.2026');
});

test('payload trims, drops blanks and validates', () => {
  assert.deepEqual(referencePayload(emptyReferenceForm()), { ok: false, error: 'Firma adı zorunludur' });
  const bad = referencePayload({ ...emptyReferenceForm(), firm: 'A', deliveryDate: '11.09.2026' });
  assert.equal(bad.ok, false);
  const ok = referencePayload({ ...referenceFormFromRecord(record), contact: '  ' });
  assert.equal(ok.ok, true);
  assert.equal(ok.body.contact, undefined);
  assert.equal(ok.body.deliveryDate, '2026-09-11');
});

test('template CSV and import file checks', () => {
  const csv = referenceTemplateCsv();
  assert.ok(csv.startsWith('\uFEFF"Firma";"İlgili"'));
  assert.equal(csv.split('\n').length, 2);
  assert.equal(importFileProblem({ name: 'a.xlsx', size: 1000 }), null);
  assert.equal(importFileProblem({ name: 'a.CSV', size: null }), null);
  assert.match(importFileProblem({ name: 'a.pdf', size: 1 }) ?? '', /xlsx/);
  assert.match(importFileProblem({ name: 'a.xlsx', size: 20_000_000 }) ?? '', /9 MB/);
});
