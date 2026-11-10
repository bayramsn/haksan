import assert from 'node:assert/strict';
import test from 'node:test';
import {
  companySearchHit,
  contactSearchHit,
  fieldSearchQuery,
  opportunitySearchHit,
  quoteSearchHit,
  serviceSearchHit,
  stockSearchHit,
} from './field-search.ts';

test('arama en az iki karakterde sunucuya gider', () => {
  assert.equal(fieldSearchQuery(' a '), null);
  assert.equal(fieldSearchQuery('  ab '), 'ab');
});

test('firma kısa adını başlık, ünvanı alt satır yapar', () => {
  const hit = companySearchHit({
    id: 'c1',
    legalTitle: 'ABC Makina Sanayi A.Ş.',
    shortName: 'ABC',
    primaryPhone: '0212 000 00 00',
    primaryAddress: { district: 'Hadımköy', province: 'İstanbul' },
  });
  assert.equal(hit.title, 'ABC');
  assert.equal(hit.subtitle, 'ABC Makina Sanayi A.Ş. · Hadımköy / İstanbul · 0212 000 00 00');
  assert.equal(hit.href, '/modules/companies/c1');
});

test('kontak, fırsat, teklif, stok ve servis aynı kart biçimine düşer', () => {
  assert.equal(contactSearchHit({ id: 'k1', fullName: 'Ayşe Yılmaz', title: 'Satın alma', mobilePhone: '555', workPhone: null, company: { legalTitle: 'Uzun', shortName: 'Kısa' } }).subtitle, 'Kısa · Satın alma · 555');
  assert.match(opportunitySearchHit({ id: 'f1', title: 'CNC hattı', requestedMachine: 'HEX', company: { legalTitle: 'Firma', shortName: null }, stage: { name: 'Teklif' } }).href, /opportunities\/f1$/);
  assert.equal(quoteSearchHit({ id: 't1', documentNo: 'TKL-1', revisionNo: 2, productName: 'HEX', company: null, status: { name: 'Taslak' } }).title, 'TKL-1 R2');
  assert.equal(stockSearchHit({ id: 's1', serialNumber: 'SN-9', product: { fullName: 'HEX 3015', modelCode: 'HEX' }, brand: { name: 'Haksan' }, status: { name: 'Müsait' }, warehouse: { name: 'Antrepo' } }).title, 'SN-9');
  assert.match(serviceSearchHit({ id: 'sv1', ticketNo: 'SRV-1', subject: 'Eksen', company: { legalTitle: 'Firma', shortName: null }, customerDevice: { brand: 'Haksan', model: 'HEX', serialNumber: 'SN-9' } }).subtitle, /SN-9/);
});
