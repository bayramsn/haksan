import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completionCloseMissing,
  completionPayload,
  defaultCompletionForm,
  defaultServiceQuote,
  joinedNotes,
  mergeCompletionForm,
  normalizeServiceQuote,
  quoteTotals,
  readServiceQuote,
  serviceQuoteMissingFields,
  withDefaultChecks,
} from './serviceForms.ts';

const now = new Date('2026-03-10T09:00:00Z');

const context = {
  ticket: {
    id: 't1',
    ticketNo: 'CNC-SRV-2026/0042',
    description: 'Periyodik bakım talebi',
    resolutionNote: null,
    warrantyApproved: false,
    metadata: {
      serviceHourlyRate: 100,
      serviceCurrency: 'EUR',
      timerElapsedSeconds: 5400,
      operations: [
        { id: 'srv-op-1', description: 'Eksen ayarı', quantity: 1, unitPrice: 0, kind: 'labor' },
        { id: 'srv-part-2', description: 'Parça kullanımı: Rulman (RL-1)', quantity: 2, unitPrice: 15, kind: 'part' },
      ],
    },
  },
  company: { name: 'Acme', address: 'Cad. 1', district: 'Kadıköy', city: 'İstanbul', phone: '0212' },
  contact: { name: 'Ali Veli', mobile: '0555' },
  machine: { brand: 'Haas', type: 'Dik', model: 'VF-2', serialNumber: 'SN1', controlUnit: 'Fanuc 0i-MF', controlUnitSerial: 'C1' },
  assigneeName: 'Teknisyen',
};

test('defaultCompletionForm web varsayılanlarını üretir', () => {
  const form = defaultCompletionForm(context, now);
  assert.equal(form.formNo, 'CNC-SRV-2026/0042');
  assert.equal(form.kurulumTarihi, '2026-03-10');
  assert.equal(form.serviceType, 'periyodik');
  assert.equal(form.responsibility, 'ucretli');
  assert.deepEqual(form.cnc, { marka: 'Fanuc', model: '0i-MF', seriNo: 'C1', mainSw: '' });
  assert.equal(form.kullanici.adres, 'Cad. 1 Kadıköy İstanbul');
  assert.equal(form.yapilanIsler, 'Eksen ayarı');
  assert.deepEqual(form.degisenParcalar, [{ id: 'srv-part-2', description: 'Rulman (RL-1)', quantity: 2, unitPrice: 15 }]);
  assert.equal(form.servisUcreti, 150);
  assert.equal(form.currency, 'EUR');
  assert.equal(form.teslimAlan, 'Ali Veli');
});

test('mergeCompletionForm kayıtlı alanları korur, eksikleri varsayılandan alır', () => {
  const fallback = defaultCompletionForm(context, now);
  const merged = mergeCompletionForm(
    { yapilanIsler: 'Kayıtlı iş', tezgah: { seriNo: 'X9' }, checks: [{ id: 'a', label: 'Özel', status: 'done', custom: true }] },
    fallback,
  );
  assert.equal(merged.yapilanIsler, 'Kayıtlı iş');
  assert.equal(merged.tezgah.seriNo, 'X9');
  assert.equal(merged.tezgah.marka, 'Haas');
  assert.equal(merged.checks.length, 1);
  assert.equal(mergeCompletionForm(null, fallback), fallback);
});

test('withDefaultChecks özel satırları korur ve eksik varsayılanları ekler', () => {
  const checks = withDefaultChecks([{ id: 'tezgah-montaji', label: 'Tezgah Montajı', status: 'done' }]);
  assert.equal(checks[0].status, 'done');
  assert.equal(checks.length, 9);
});

test('completionPayload kırpar ve kapatma eksiklerini bildirir', () => {
  const form = { ...defaultCompletionForm(context, now), yapilanIsler: '  ', kurulumuYapan: ' T ', teslimAlan: '' };
  form.degisenParcalar = [...form.degisenParcalar, { id: 'p', description: '  ', quantity: 1, unitPrice: 1 }];
  const payload = completionPayload(form);
  assert.equal(payload.kurulumuYapan, 'T');
  assert.equal(payload.degisenParcalar.length, 1);
  assert.deepEqual(completionCloseMissing(form), ['Yapılan işlemler', 'Firma yetkilisi']);
});

test('servis teklifi taslağı, doğrulama ve normalizasyon', () => {
  const draft = defaultServiceQuote(
    { ticketNo: 'UNI-SRV-2026/0007', issue: 'Spindle arızası', metadataCurrency: undefined, machine: context.machine, company: { name: 'Acme' }, writer: { name: 'Ayşe' } },
    now,
    1,
  );
  assert.equal(draft.quoteNo, 'UNI-SRVTEK-2026/0007');
  assert.equal(draft.subject, 'Teklifimiz SN1 Seri Numaralı Haas VF-2 Dik Spindle arızası kapsamaktadır.');
  assert.equal(draft.currency, 'USD');
  assert.deepEqual(serviceQuoteMissingFields(draft), ['en az bir ürün/hizmet kalemi']);
  const filled = { ...draft, quoteNo: 'SRVTEK-1', items: [{ ...draft.items[0], description: ' Bakım ', quantity: 2, unitPrice: 50 }] };
  const normalized = normalizeServiceQuote(filled, 'UNI-SRV-2026/0007', now);
  assert.equal(normalized.quoteNo, 'UNI-SRVTEK-1');
  assert.equal(normalized.items[0].description, 'Bakım');
  assert.deepEqual(serviceQuoteMissingFields(normalized), []);
  assert.deepEqual(quoteTotals(normalized), { subtotal: 100, vat: 20, total: 120 });
  assert.equal(readServiceQuote(normalized).quoteNo, 'UNI-SRVTEK-1');
  assert.equal(readServiceQuote(null), null);
});

test('joinedNotes boş notları atar', () => {
  assert.equal(joinedNotes([{ text: ' a ' }, { text: '' }, { text: 'b' }]), 'a\n\nb');
});
