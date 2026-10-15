import test from 'node:test';
import assert from 'node:assert/strict';
import { activityDescription, buildVisitCallPayloads, validateVisitCall } from './visit-call-logic.ts';

const date = new Date('2026-10-15T09:30:00.000Z');
const base = { companyId: 'c1', contactId: '', opportunityId: null, date, subject: '', location: '', purpose: '', result: '', nextAction: '' };

test('ziyaret: yapısal kayıt ve web biçiminde aktivite üretir', () => {
  const { record, activity } = buildVisitCallPayloads('visit', {
    ...base,
    contactId: 'k1',
    location: ' Konya OSB ',
    purpose: 'Demo',
    result: 'Teklif istendi',
    nextAction: 'Teklif gönder',
  });
  assert.equal(record.kind, 'visit');
  assert.deepEqual(record.body, {
    companyId: 'c1',
    contactId: 'k1',
    opportunityId: undefined,
    visitDate: date.toISOString(),
    visitLocation: 'Konya OSB',
    visitPurpose: 'Demo',
    visitResult: 'Teklif istendi',
    nextAction: 'Teklif gönder',
  });
  assert.equal(activity.activityTypeCode, 'customer_visit');
  assert.equal(activity.subject, 'Müşteri Ziyareti');
  assert.equal(activity.description, 'Amaç: Demo\nTeklif istendi\nSonraki adım: Teklif gönder');
});

test('arama: amaç ve konum gönderilmez, boş açıklama atlanır', () => {
  const { record, activity } = buildVisitCallPayloads('call', { ...base, subject: ' Fiyat ', purpose: 'yok sayılır' });
  assert.equal(record.kind, 'call');
  assert.deepEqual(record.body, {
    companyId: 'c1',
    contactId: undefined,
    opportunityId: undefined,
    callDate: date.toISOString(),
    callResult: undefined,
    nextAction: undefined,
  });
  assert.equal(activity.activityTypeCode, 'outgoing_call');
  assert.equal(activity.subject, 'Fiyat');
  assert.equal(activity.description, undefined);
});

test('açıklama yalnız ziyarette amaç içerir', () => {
  assert.equal(activityDescription('call', { purpose: 'x', result: 'r', nextAction: '' }), 'r');
});

test('doğrulama: firma, tarih ve uzunluk sınırları', () => {
  assert.equal(validateVisitCall('visit', { ...base, companyId: '' }), 'Firma seçin.');
  assert.equal(validateVisitCall('visit', { ...base, date: new Date('x') }), 'Tarih seçin.');
  assert.equal(validateVisitCall('visit', { ...base, purpose: 'a'.repeat(1001) }), 'Amaç en fazla 1000 karakter olabilir.');
  assert.equal(validateVisitCall('call', { ...base, purpose: 'a'.repeat(1001) }), null);
  assert.equal(validateVisitCall('call', { ...base, result: 'a'.repeat(2001) }), 'Sonuç en fazla 2000 karakter olabilir.');
  assert.equal(validateVisitCall('visit', base), null);
});
