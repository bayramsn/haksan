import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLookupCsv, previewLookupCsv } from './lookup-import.ts';

test('parses semicolon CSV with quotes and Turkish headers', () => {
  const drafts = parseLookupCsv('\uFEFFAd;Sistem Kodu;Durum;Sıra;Bağlı Olduğu Ürün Grubu\n"Tezgah; ana";TEZGAH;Pasif;10;CNC\n;\n');
  assert.equal(drafts.length, 1);
  assert.deepEqual(
    { name: drafts[0].name, code: drafts[0].code, isActive: drafts[0].isActive, sortOrder: drafts[0].sortOrder, parent: drafts[0].parent },
    { name: 'Tezgah; ana', code: 'TEZGAH', isActive: false, sortOrder: 10, parent: 'CNC' }
  );
});

test('rejects missing name column and unclosed quotes', () => {
  assert.throws(() => parseLookupCsv('Kod\nA'), /Ad sütunu/);
  assert.throws(() => parseLookupCsv('Ad\n"abc'), /kapanmamış/);
});

test('preview resolves existing, parent and errors', () => {
  const context = {
    divisionId: 'd1',
    divisions: [{ id: 'd1', code: 'UNI', name: 'Üniversal' }],
    scoped: true,
    existing: [{ id: 'e1', code: 'TORNA', name: 'Torna', divisionId: 'd1' }],
    parents: [{ id: 'p1', code: 'TEZGAH', name: 'Tezgah', divisionId: 'd1' }],
    productTypes: [],
    parentField: 'categoryId',
    isSpecGroup: false,
  };
  const drafts = parseLookupCsv('Ad,Kod,Bölüm,Üst Kayıt\nTorna,TORNA,UNI,Tezgah\nFreze,,UNI,Yok\nYeni,YENI,CNC,Tezgah');
  const [update, missingParent, wrongDivision] = previewLookupCsv(drafts, context);
  assert.equal(update.action, 'update');
  assert.equal(update.existingId, 'e1');
  assert.equal(update.body.parentId, 'p1');
  assert.equal(update.errors.length, 0);
  assert.match(missingParent.errors.join(' '), /Üst kayıt bulunamadı: Yok/);
  assert.match(wrongDivision.errors.join(' '), /Bilinmeyen bölüm: CNC/);
});
