import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeTermsTemplate, encodeTermsTemplate } from './terms-template.ts';
test('web şart şablonlarının mevcut ve eski alanları mobilde kayıpsız okunur', () => {
  const value = { payment: '30 gün', delivery: 'Fabrikada teslim', warranty: '2 yıl\nServis dahil' };
  assert.deepEqual(decodeTermsTemplate(encodeTermsTemplate(value)), value);
  assert.deepEqual(decodeTermsTemplate(JSON.stringify({ paymentTerms: 'Peşin', deliveryTerms: 'EXW', warrantyTerms: '1 yıl' })), { payment: 'Peşin', delivery: 'EXW', warranty: '1 yıl' });
  assert.equal(decodeTermsTemplate('bozuk'), null);
  assert.equal(decodeTermsTemplate('null'), null);
  assert.equal(decodeTermsTemplate('[]'), null);
});
