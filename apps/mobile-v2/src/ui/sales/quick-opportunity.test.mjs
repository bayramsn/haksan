import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuickOpportunityBody, quickOpportunityTitle, validateQuickOpportunity } from './quick-opportunity.ts';

const base = {
  companyId: '',
  companyTitle: '',
  contactId: '',
  contactName: '',
  phone: '',
  email: '',
  city: '',
  district: '',
  contactMethod: '',
  productModelId: '',
  product: '',
  quantity: '1',
  title: '',
  estimatedValue: '',
  currencyCode: 'USD',
  probability: '50',
  expectedCloseDate: null,
  nextAction: '',
  nextActionAt: null,
  description: '',
  divisionId: '',
  ownerUserId: '',
};

test('web ile aynı zorunlu alanlar', () => {
  const errors = validateQuickOpportunity(base, true);
  assert.ok(errors.contactName);
  assert.ok(errors.product);
  assert.ok(errors.city);
  assert.ok(errors.phone);
  assert.ok(errors.divisionId);
});

test('kayıtlı firma seçiliyse kontak adı gerekmez; telefon ya da e-posta yeter', () => {
  const errors = validateQuickOpportunity(
    { ...base, companyId: 'c1', product: 'CNC', city: 'Bursa', email: 'a@b.co', divisionId: 'd1' },
    true
  );
  assert.deepEqual(errors, {});
});

test('kısa telefon, hatalı e-posta ve aksiyonsuz takip zamanı reddedilir', () => {
  const errors = validateQuickOpportunity(
    { ...base, contactName: 'Ali', product: 'CNC', city: 'Bursa', phone: '123', email: 'x@', nextActionAt: new Date() },
    false
  );
  assert.ok(errors.phone);
  assert.ok(errors.email);
  assert.ok(errors.nextAction);
});

test('başlık boşsa ürün ve adetten üretilir', () => {
  assert.equal(quickOpportunityTitle({ title: '', product: 'Lazer Kesim', quantity: '2' }), 'Lazer Kesim (2 adet)');
  assert.equal(quickOpportunityTitle({ title: ' Özel ', product: 'X', quantity: '2' }), 'Özel');
});

test('katalog ürünü kimliğiyle, kayıtlı kontak firmaya bağlı gönderilir', () => {
  const body = buildQuickOpportunityBody({
    ...base,
    companyId: 'c1',
    contactId: 'k1',
    contactName: 'Ayşe',
    phone: '0532 000 00 00',
    city: 'İstanbul',
    district: 'Kadıköy',
    productModelId: 'p1',
    product: 'HX-500',
    quantity: '3',
    estimatedValue: '12.500,50',
  });
  assert.equal(body.companyId, 'c1');
  assert.equal(body.primaryContactId, 'k1');
  assert.deepEqual(body.products, [{ productModelId: 'p1', machineName: 'HX-500', quantity: 3 }]);
  assert.equal(body.leadContactValue, '0532 000 00 00');
  assert.equal(body.estimatedValue, 12500.5);
  assert.match(body.description, /Şehir: İstanbul \/ Kadıköy/);
});

test('firma seçilmediyse kontak kimliği gönderilmez, katalog dışı ürün adla gider', () => {
  const body = buildQuickOpportunityBody({ ...base, contactId: 'k1', contactName: 'Ali', product: 'Özel Pres', city: 'Bursa' });
  assert.equal(body.companyId, undefined);
  assert.equal(body.primaryContactId, undefined);
  assert.deepEqual(body.products, [{ machineName: 'Özel Pres', quantity: 1 }]);
});
