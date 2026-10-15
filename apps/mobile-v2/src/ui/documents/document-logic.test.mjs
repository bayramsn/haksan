import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addressLine,
  canCompleteLink,
  computeDocumentTotals,
  contractSignatureLabel,
  filterLinksForFolder,
  folderCounts,
  folderForDocumentType,
  formatFileSize,
  isStandaloneSnapshot,
  linkRelationLabel,
  mergeStoredPrices,
  paymentIdFromDescription,
  priceRowError,
  pricesChanged,
  quickItemsError,
  quickItemsFromSnapshot,
  quickPartyError,
  quickPartyFromSnapshot,
  quickPartyPayload,
  quoteToPriceRows,
  recordRelationLabel,
  snapshotDiscount,
  snapshotToPriceRows,
} from './document-logic.ts';

const link = (fileId, code, entityType = 'company') => ({ fileId, entityType, documentType: code ? { code } : null });

test('dosya türü web klasörlerine eşlenir', () => {
  assert.equal(folderForDocumentType('external_quote'), 'external_quote');
  assert.equal(folderForDocumentType('accounting_invoice_pdf'), 'accounting_invoice');
  assert.equal(folderForDocumentType('service_document'), 'delivery_form');
  assert.equal(folderForDocumentType('installation_form'), 'installation_form');
  assert.equal(folderForDocumentType(undefined), 'other');
});

test('boyut biçimi web formatDocSize ile aynı', () => {
  assert.equal(formatFileSize(0), '—');
  assert.equal(formatFileSize(512), '512 B');
  assert.equal(formatFileSize(2048), '2.0 KB');
  assert.equal(formatFileSize(3 * 1024 * 1024), '3.0 MB');
});

test('kayda bağlı dosya tekrar listelenmez, klasör sayaçları toplanır', () => {
  const links = [
    link('f1', 'external_quote'),
    link('f2', 'proforma_pdf'),
    link('f3', 'other'),
    link('f3', 'other'),
    link('f4', 'delivery_form'),
  ];
  const recordFileIds = new Set(['f2']);
  assert.deepEqual(filterLinksForFolder(links, 'all', recordFileIds).map((l) => l.fileId), ['f1', 'f3', 'f4']);
  assert.deepEqual(filterLinksForFolder(links, 'other', recordFileIds).map((l) => l.fileId), ['f3']);
  const counts = folderCounts(links, { proforma: 4, contract: 2, invoice: 1 }, recordFileIds);
  assert.equal(counts.proforma, 4);
  assert.equal(counts.external_quote, 1);
  assert.equal(counts.delivery_form, 1);
  assert.equal(counts.all, 4 + 2 + 1 + 3);
});

test('kaynak etiketleri ve kasa referansı', () => {
  assert.equal(linkRelationLabel('company', 'other', 'Kasa hareketi #ABC-1'), 'Kasa hareketine bağlı');
  assert.equal(linkRelationLabel('service_ticket', 'delivery_form'), 'Servis talebine bağlı');
  assert.equal(linkRelationLabel('opportunity', 'proforma'), 'Fırsattan eşleştirildi');
  assert.equal(paymentIdFromDescription('Kasa hareketi #AB12-CD'), 'ab12-cd');
  assert.equal(paymentIdFromDescription(null), null);
  assert.equal(canCompleteLink('proforma', 'opportunity'), true);
  assert.equal(canCompleteLink('proforma', 'quote'), false);
  assert.equal(canCompleteLink('other', 'company'), false);
});

test('sözleşme imza etiketi ve hızlı belge ayrımı', () => {
  assert.equal(contractSignatureLabel({ signedAt: '2026-10-01T10:00:00Z' }), 'İmzalandı · 2026-10-01');
  assert.equal(contractSignatureLabel(null, 'signed'), 'İmzalandı');
  assert.equal(contractSignatureLabel({}), 'İmza durumu bekleniyor');
  assert.equal(isStandaloneSnapshot({ standalone: true }), true);
  assert.equal(isStandaloneSnapshot(null), false);
  assert.equal(recordRelationLabel({ quoteId: null, companyId: null, standalone: true, kind: 'contract' }), 'Teklifsiz hızlı sözleşme');
  assert.equal(recordRelationLabel({ quoteId: 'q', companyId: null, standalone: false, kind: 'proforma' }), 'Teklife doğrudan bağlı');
});

test('fiyat satırları: canlı teklif + kayıtlı belge fiyatı', () => {
  const quoteRows = quoteToPriceRows([
    { id: 'a', description: ' A ', quantity: '2', unitPrice: '100', discountAmount: '0', vatRate: '20' },
    { id: 'b', description: 'B', quantity: '1', unitPrice: '50', discountAmount: '-5', vatRate: '10' },
  ]);
  assert.equal(quoteRows[0].description, 'A');
  assert.equal(quoteRows[1].discountAmount, 0);
  const stored = snapshotToPriceRows({ items: [{ quoteItemId: 'a', unitPrice: 90, discountAmount: 10 }] });
  const merged = mergeStoredPrices(quoteRows, stored);
  assert.deepEqual([merged[0].unitPrice, merged[0].discountAmount], [90, 10]);
  assert.equal(pricesChanged(merged, quoteRows), true);
  assert.equal(pricesChanged(quoteRows, quoteRows), false);
  assert.equal(priceRowError({ ...quoteRows[0], discountAmount: 1000 }), 'Satır iskontosu brüt tutarı aşıyor');
});

test('toplamlar API snapshot hesabıyla aynı', () => {
  const rows = [
    { quoteItemId: 'a', description: 'A', quantity: 2, unitCode: 'adet', unitPrice: 100, discountAmount: 20, vatRate: 20 },
    { quoteItemId: 'b', description: 'B', quantity: 1, unitCode: 'adet', unitPrice: 20, discountAmount: 0, vatRate: 0 },
  ];
  const totals = computeDocumentTotals(rows, { documentDiscount: { amount: 0, percent: 10 }, customsTotal: 5 });
  assert.deepEqual(totals, { gross: 220, lineDiscount: 20, headerDiscount: 20, subtotal: 180, vat: 32.4, customs: 5, grand: 217.4 });
  assert.deepEqual(snapshotDiscount({ documentDiscount: { amount: '5', percent: -1 } }), { amount: 5, percent: 0 });
});

test('hızlı belge alıcı ve kalem kuralları', () => {
  const party = quickPartyFromSnapshot({
    company: { legalTitle: 'Elle A.Ş.', taxOffice: 'Kadıköy' },
    companyAddresses: [{ street: 'Bağdat Cd.', buildingNumber: '5', district: 'Kadıköy', city: 'İstanbul' }],
    contact: { fullName: 'Ayşe', mobilePhone: '555' },
  });
  assert.equal(party.manualCompany, true);
  assert.equal(party.companyAddress, 'Bağdat Cd. 5 Kadıköy İstanbul');
  assert.deepEqual(quickPartyPayload(party), {
    companyId: undefined,
    companyName: 'Elle A.Ş.',
    companyAddress: 'Bağdat Cd. 5 Kadıköy İstanbul',
    companyTaxOffice: 'Kadıköy',
    companyTaxNumber: undefined,
    contactName: 'Ayşe',
    contactPhone: '555',
  });
  assert.equal(quickPartyError({ ...party, manualCompany: false, companyId: '' }), 'Firma seçin veya elle girişe geçin');
  assert.equal(quickItemsError([]), 'En az bir kalem girin');
  assert.equal(quickItemsError([{ description: '', quantity: 1, unitPrice: 5, discountAmount: 0 }]), 'Her kalemin açıklaması olmalı');
  assert.equal(quickItemsError([{ description: 'X', quantity: 1, unitPrice: 5, discountAmount: 0 }]), null);
  assert.equal(addressLine({ fullAddress: 'Tam adres İstanbul', city: 'İstanbul' }), 'Tam adres İstanbul');
  assert.deepEqual(quickItemsFromSnapshot({ items: [{ description: 'K', quantity: 3, product: { brandName: 'Haas' } }] })[0], {
    description: 'K', quantity: 3, unitCode: 'adet', unitPrice: 0, discountAmount: 0, vatRate: 20, brand: 'Haas', model: '', originCountry: '', hsCode: '',
  });
});

test('upload types mirror the web dialog and validate files', async () => {
  const { UPLOAD_TYPES, uploadTypeFor, uploadFileError } = await import('./document-logic.ts');
  assert.equal(UPLOAD_TYPES.length, 8);
  assert.equal(uploadTypeFor('contract').bucket, 'erp-contract-documents');
  assert.equal(uploadTypeFor('invoice').documentTypeCode, 'commercial_invoice_pdf');
  assert.equal(uploadTypeFor('unknown').folder, 'other');
  assert.equal(uploadFileError('external_quote', { extension: 'png', sizeBytes: 10 }), 'Dış teklif için PDF, DOCX veya XLSX yükleyebilirsiniz.');
  assert.equal(uploadFileError('external_quote', { extension: 'PDF', sizeBytes: 10 }), null);
  assert.equal(uploadFileError('other', { extension: 'png', sizeBytes: 26 * 1024 * 1024 }), "Dosya boyutu 25 MB'ı aşamaz");
});

test('accounting invoice prefill mirrors the web order rule and falls back to the quote', async () => {
  const { invoicePrefill, invoiceTotals } = await import('./document-logic.ts');
  const order = { id: 'o1', orderNo: 'SO-7', companyId: 'c1', quoteId: 'q1', subtotal: '1000.00', vatAmount: '200.00', grandTotal: '1200.00' };
  const fromOrder = invoicePrefill({ order });
  assert.equal(fromOrder.invoiceNo, 'MF-SO-7');
  assert.equal(fromOrder.amount, 1000);
  assert.equal(fromOrder.vatRate, 20);
  assert.equal(fromOrder.salesOrderId, 'o1');
  assert.equal(fromOrder.notes, 'Satış siparişi SO-7 kaynaklı');
  const quote = { id: 'q1', documentNo: 'CNC-TKL-1', companyId: 'c1', subtotal: '0', vatAmount: '100', grandTotal: '1100' };
  const fromQuote = invoicePrefill({ quote });
  assert.equal(fromQuote.invoiceNo, 'MF-CNC-TKL-1');
  assert.equal(fromQuote.amount, 1000);
  assert.equal(fromQuote.vatRate, 10);
  assert.equal(invoicePrefill({ order, quote }).notes, 'Satış siparişi SO-7 / teklif CNC-TKL-1');
  assert.equal(invoicePrefill({}), null);
  assert.deepEqual(invoiceTotals(1000, 20), { vatAmount: 200, grandTotal: 1200 });
  assert.deepEqual(invoiceTotals(99.99, 18), { vatAmount: 18, grandTotal: 117.99 });
});

test('document center stats follow the web hero counters', async () => {
  const { documentCenterStats } = await import('./document-logic.ts');
  const records = [
    { quoteId: 'q1', companyId: 'c1', standalone: false },
    { quoteId: null, companyId: 'c2', standalone: true },
    { quoteId: null, companyId: null, standalone: false },
  ];
  const links = [
    { fileId: 'f1', entityType: 'quote', documentType: { code: 'external_quote' } },
    { fileId: 'f2', entityType: 'company', documentType: { code: 'proforma_pdf' } },
    { fileId: 'f3', entityType: 'company', documentType: { code: 'commercial_invoice_pdf' }, description: 'Kasa hareketi #ABC-1' },
  ];
  assert.deepEqual(documentCenterStats(records, links), { total: 6, linked: 5, quoteLinked: 2, review: 2 });
});
