import test from 'node:test';
import assert from 'node:assert/strict';
import { receivableCreateSchema, OPPORTUNITY_PAYMENT_METHODS } from '@haksan/shared';
import { buildReceivableDraft, RECEIVABLE_METHOD_OPTIONS } from './receivable-form.ts';

const base = { companyId: 'company-1', amount: '100,25', currencyCode: 'EUR', dueDate: '2026-11-15', invoiceNo: ' F-42 ', paymentMethod: 'cheque', documentRef: ' CK-2026-5 ', notes: ' vadeli çek ' };

test('single receivable retains payment instrument method and document reference accepted by server', () => {
  const result = buildReceivableDraft(base);
  assert.equal(result.ok, true);
  assert.equal(result.body.paymentMethod, 'cheque');
  assert.equal(result.body.documentRef, 'CK-2026-5');
  assert.equal(result.body.amount, 100.25);
  assert.equal(result.body.invoiceNo, 'F-42');
  assert.equal(result.body.currencyCode, 'EUR');
  assert.equal(receivableCreateSchema.safeParse(result.body).success, true);
});

test('invalid calendar dates, infinity and negative amount cannot create financial records', () => {
  for (const dueDate of ['2026-02-30', '2026-13-01', '2026-00-01', '2026-01-00', 'not-a-date']) assert.equal(buildReceivableDraft({ ...base, dueDate }).errors.dueDate, 'Geçerli bir vade tarihi seçin.');
  for (const amount of ['Infinity', '-10', '0', 'x', '']) assert.equal(buildReceivableDraft({ ...base, amount }).ok, false);
});

test('server method enum and length validation retained without silently truncating entered data', () => {
  assert.deepEqual(RECEIVABLE_METHOD_OPTIONS.map((row) => row.value), [...OPPORTUNITY_PAYMENT_METHODS]);
  for (const field of ['documentRef', 'invoiceNo', 'notes']) {
    const limit = { documentRef: 128, invoiceNo: 64, notes: 2000 }[field];
    const result = buildReceivableDraft({ ...base, [field]: 'x'.repeat(limit + 1) });
    assert.equal(result.ok, false);
    assert.ok(result.errors[field]);
  }
  assert.equal(buildReceivableDraft({ ...base, paymentMethod: 'not-a-method' }).ok, false);
});

test('empty optional identifiers are omitted and leap date is preserved', () => {
  const result = buildReceivableDraft({ ...base, dueDate: '2028-02-29', invoiceNo: ' ', documentRef: ' ', notes: '' });
  assert.equal(result.ok, true);
  assert.equal(result.body.dueDate.getDate(), 29);
  assert.equal(result.body.dueDate.getMonth(), 1);
  assert.equal(result.body.documentRef, undefined);
  assert.equal(result.body.invoiceNo, undefined);
});

test('cheque details are required before any plan writes and are serialized like web', async () => {
  const { buildPlanReceivable, EMPTY_INSTRUMENT } = await import('./receivable-form.ts');
  const input = { row: { ...EMPTY_INSTRUMENT, amount: '25', dueDate: '2026-11-05' }, method: 'cheque', companyId: 'c1', currencyCode: 'TRY', baseNote: 'Çek 1/2', quoteId: 'q1' };
  assert.deepEqual(Object.keys(buildPlanReceivable(input).errors), ['documentNo', 'bankName', 'issuer']);
  const ready = buildPlanReceivable({ ...input, row: { ...input.row, documentNo: ' C-1 ', bankName: ' Banka ', branchName: ' Merkez ', issuer: ' Firma ' } });
  assert.equal(ready.ok, true);
  assert.equal(ready.body.documentRef, 'C-1');
  assert.equal(ready.body.quoteId, 'q1');
  assert.equal(ready.body.notes, 'Çek 1/2 · Çek No: C-1 · Banka: Banka · Şube: Merkez · Hesap Sahibi: Firma');
});

test('senet requires document number and issuer; other methods do not leak hidden cheque details', async () => {
  const { buildPlanReceivable, EMPTY_INSTRUMENT } = await import('./receivable-form.ts');
  const input = { row: { ...EMPTY_INSTRUMENT, amount: '10', dueDate: '2026-11-05', documentNo: 'S1', issuer: 'Borçlu' }, method: 'promissory_note', companyId: 'c1', currencyCode: 'EUR', baseNote: 'Senet' };
  assert.equal(buildPlanReceivable(input).body.notes, 'Senet · Senet No: S1 · Borçlu: Borçlu');
  const plain = buildPlanReceivable({ ...input, method: 'term' });
  assert.equal(plain.body.documentRef, undefined);
  assert.equal(plain.body.notes, 'Senet');
  assert.equal(buildPlanReceivable({ ...input, row: { ...input.row, issuer: '' } }).ok, false);
});

test('recalculation keeps instrument data while applying new amounts/dates', async () => {
  const { recalculatePlanRows, EMPTY_INSTRUMENT } = await import('./receivable-form.ts');
  const old = [{ ...EMPTY_INSTRUMENT, documentNo: 'CK1', bankName: 'B', issuer: 'I', amount: '10', dueDate: '2026-11-01' }];
  const next = recalculatePlanRows(old, [{ ...EMPTY_INSTRUMENT, amount: '20', dueDate: '2026-12-01' }, { amount: '20', dueDate: '2027-01-01' }]);
  assert.equal(next[0].documentNo, 'CK1');
  assert.equal(next[0].amount, '20');
  assert.equal(next[0].dueDate, '2026-12-01');
  assert.equal(next[1].documentNo, '');
});
