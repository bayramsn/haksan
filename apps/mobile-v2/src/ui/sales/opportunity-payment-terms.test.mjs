import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaymentTermsPatch } from './opportunity-payment-terms.ts';

const baseline = { id: 'opp-1', paymentMethod: 'term', paymentTermDays: 30, paymentTerms: 'Mevcut koşullar' };
const input = { baseline, opportunityId: 'opp-1', method: 'term', days: '30', terms: 'Mevcut koşullar' };

test('sadece değişen alanları PATCH eder, mevcut alanları üzerine yazmaz', () => {
  assert.deepEqual(buildPaymentTermsPatch(input), { ok: true, patch: {} });
  assert.deepEqual(buildPaymentTermsPatch({ ...input, days: '60' }), { ok: true, patch: { paymentTermDays: 60 } });
  assert.deepEqual(buildPaymentTermsPatch({ ...input, method: 'cash', terms: 'Yeni koşullar' }), {
    ok: true, patch: { paymentMethod: 'cash', paymentTerms: 'Yeni koşullar' },
  });
});

test('vade sıfır ve 3650 dahil tamsayı kabul eder, boş vade null olur', () => {
  for (const [days, expected] of [['0', 0], ['3650', 3650], [' 60 ', 60], ['', null], ['  ', null]]) {
    assert.deepEqual(buildPaymentTermsPatch({ ...input, days }), { ok: true, patch: { paymentTermDays: expected } });
  }
  for (const days of ['-1', '3651', '1.5', '1.0', '1e2', '0x10', 'NaN', 'Infinity', 'abc']) {
    assert.equal(buildPaymentTermsPatch({ ...input, days }).ok, false, days);
  }
});

test('ödeme koşulları 4000 karakterle sınırlı ve bilinçli temizleme korunur', () => {
  assert.deepEqual(buildPaymentTermsPatch({ ...input, terms: 'x'.repeat(4000) }), { ok: true, patch: { paymentTerms: 'x'.repeat(4000) } });
  assert.equal(buildPaymentTermsPatch({ ...input, terms: 'x'.repeat(4001) }).ok, false);
  assert.deepEqual(buildPaymentTermsPatch({ ...input, terms: '' }), { ok: true, patch: { paymentTerms: '' } });
});

test('başka fırsata geçildiğinde eski formdan PATCH gönderilmez', () => {
  assert.equal(buildPaymentTermsPatch({ ...input, opportunityId: 'opp-2' }).ok, false);
  assert.equal(buildPaymentTermsPatch({ ...input, opportunityId: 'opp-2', days: '60' }).ok, false);
});

test('dokunulmayan bilinmeyen ödeme biçimi ve null alanlar gönderilmez', () => {
  const legacy = { ...baseline, paymentMethod: 'legacy_method', paymentTermDays: null, paymentTerms: null };
  assert.deepEqual(buildPaymentTermsPatch({ ...input, baseline: legacy, method: 'legacy_method', days: '', terms: '' }), { ok: true, patch: {} });
  assert.deepEqual(buildPaymentTermsPatch({ ...input, baseline: legacy, method: 'legacy_method', days: '', terms: 'Yeni' }), { ok: true, patch: { paymentTerms: 'Yeni' } });
  assert.deepEqual(buildPaymentTermsPatch({ ...input, method: null }), { ok: true, patch: { paymentMethod: null } });
});
