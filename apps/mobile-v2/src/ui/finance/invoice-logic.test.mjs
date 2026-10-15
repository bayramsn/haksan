import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysToDateInput,
  blankInvoiceLine,
  buildInvoicePayload,
  defaultInvoiceForm,
  dueState,
  filterInvoices,
  gridTotals,
  invoiceKpis,
  invoicePrefillFromDetail,
  previewInstallments,
  purchaseInvoicePrefill,
  retargetLines,
  validateInvoice,
  vatAmountFromRate,
} from './invoice-logic.ts';

const row = (invoiceNo, total, currency, companyId, installmentCount = 1) => ({
  invoiceNo,
  grandTotal: String(total),
  installmentCount,
  company: { id: companyId, legalTitle: `Firma ${companyId}`, shortName: null },
  currency: { code: currency },
});

test('KPI para birimi bazında toplar, taksitli ve farklı firma sayar', () => {
  const kpi = invoiceKpis([row('A', 100, 'USD', 'c1', 3), row('B', 50, 'EUR', 'c2'), row('C', 20, 'USD', 'c1')]);
  assert.equal(kpi.count, 3);
  assert.deepEqual(kpi.totals, [{ currencyCode: 'USD', amount: 120 }, { currencyCode: 'EUR', amount: 50 }]);
  assert.equal(kpi.installmented, 1);
  assert.equal(kpi.companies, 2);
  assert.equal(filterInvoices([row('MF-1', 1, 'USD', 'x')], 'firma x').length, 1);
});

test('vade rozeti gecikme, bugün ve yaklaşan vadeyi ayırır', () => {
  const now = new Date(2026, 9, 15, 10);
  assert.equal(dueState({ firstDueDate: null, installmentCount: 1 }, now).label, 'Vade yok');
  assert.equal(dueState({ firstDueDate: new Date(2026, 9, 10).toISOString(), installmentCount: 1 }, now).tone, 'danger');
  assert.equal(dueState({ firstDueDate: new Date(2026, 9, 15).toISOString(), installmentCount: 1 }, now).label, 'Bugün vadeli');
  assert.equal(dueState({ firstDueDate: new Date(2026, 9, 20).toISOString(), installmentCount: 1 }, now).tone, 'warning');
});

test('KDV ve vade günü yardımcıları', () => {
  assert.equal(vatAmountFromRate('1000', '20'), 200);
  assert.equal(vatAmountFromRate('abc', '20'), 0);
  assert.equal(addDaysToDateInput('2026-10-01', 30), '2026-10-31');
  assert.equal(addDaysToDateInput('geçersiz', 30), '');
});

test('taksit önizlemesi kuruş farkını son taksite yazar', () => {
  const rows = previewInstallments(100, { installmentCount: '3', firstDueDate: '2026-01-01', invoiceDate: '2026-01-01', lastDueDate: '' });
  assert.deepEqual(rows.map((item) => item.amount), ['33.33', '33.33', '33.34']);
  assert.equal(rows[1].dueDate, '2026-01-31');
});

test('doğrulama web ile aynı sırada uyarır', () => {
  const form = { ...defaultInvoiceForm('c1'), amount: '100' };
  assert.deepEqual(validateInvoice({ ...form, companyId: '' }, [], true), { ok: false, title: 'Firma seçin' });
  const partial = { ...blankInvoiceLine('commercial'), description: 'Kalem' };
  assert.equal(validateInvoice(form, [partial], true).ok, false);
  const stockLine = { ...blankInvoiceLine('commercial'), kind: 'stock', description: 'Tezgah', unitPrice: '10' };
  assert.equal(validateInvoice(form, [stockLine], true).title, 'Tezgah satışı için seri numarası seçin');
  const fractional = { ...blankInvoiceLine('commercial'), productModelId: 'p1', description: 'Ürün', quantity: '1.5', unitPrice: '10' };
  assert.equal(validateInvoice(form, [fractional], true).title, 'Ürün satışında adet tam sayı olmalı');
  assert.equal(validateInvoice({ ...form, amount: '0' }, [], false).title, 'Geçerli matrah girin');
  assert.deepEqual(validateInvoice(form, [], false), { ok: true });
});

test('payload: peşinde vade 0, idaride incoterm gönderilmez, kalemler tezgah olarak etiketlenir', () => {
  const form = {
    ...defaultInvoiceForm('c1'),
    invoiceNo: 'MF-1',
    invoiceDate: '2026-10-01',
    amount: '1000',
    vatAmount: '200',
    incoterm: 'EXW',
  };
  const line = { ...blankInvoiceLine('commercial'), kind: 'stock', inventoryItemId: 'inv1', description: 'Tezgah — SN1', unitPrice: '1000' };
  const payload = buildInvoicePayload({ form, lines: [line], installments: [], gridVisible: true, isEditing: false });
  assert.equal(payload.paymentTermDays, 0);
  assert.equal(payload.grandTotal, 1200);
  assert.equal(payload.incoterm, 'EXW');
  assert.equal(payload.lineItems[0].saleType, 'tezgah');
  assert.equal(payload.lineItems[0].categoryCode, 'TEZGAH');
  const admin = buildInvoicePayload({
    form: { ...form, invoiceCategory: 'administrative' },
    lines: [],
    installments: [],
    gridVisible: false,
    isEditing: true,
  });
  assert.equal(admin.incoterm, '');
  assert.equal(admin.lineItems, undefined);
});

test('idariye geçişte ürün ve seri bağları düşer; ızgara toplamı indirimi uygular', () => {
  const line = { ...blankInvoiceLine('commercial'), productModelId: 'p1', inventoryItemId: 'i1', kind: 'stock' };
  const [admin] = retargetLines([line], 'sales', 'administrative');
  assert.equal(admin.kind, 'expense');
  assert.equal(admin.productModelId, '');
  assert.equal(admin.inventoryItemId, undefined);
  const totals = gridTotals([{ ...line, quantity: '2', unitPrice: '100', discountAmount: '20', vatRate: '10' }]);
  assert.equal(totals.subtotal, 180);
  assert.equal(totals.vat, 18);
});

test('düzenleme ve satın alma ön dolumu', () => {
  const prefill = invoicePrefillFromDetail({
    type: 'purchase',
    invoiceCategory: 'administrative',
    invoiceNo: 'MF-9',
    invoiceDate: '2026-10-01T00:00:00.000Z',
    amount: '1000',
    vatAmount: '200',
    grandTotal: '1200',
    paymentType: 'term',
    paymentTermDays: 30,
    previousPaymentTermDays: null,
    termChangeReason: null,
    incoterm: null,
    shipmentReference: 'R-1',
    orderNo: null,
    expectedDate: null,
    firstDueDate: '2026-10-31T00:00:00.000Z',
    lastDueDate: null,
    installmentCount: 1,
    company: { id: 'c9' },
    companyId: 'c9',
    currency: { code: 'EUR' },
    installments: [{ installmentNo: 1, dueDate: '2026-10-31T00:00:00.000Z', amount: '1200' }],
  });
  assert.equal(prefill.form.vatRate, '20');
  assert.equal(prefill.form.companyId, 'c9');
  assert.equal(prefill.form.firstDueDate, '2026-10-31');

  const purchase = purchaseInvoicePrefill({
    orderNo: 'PO-1',
    orderDate: '2026-10-01T00:00:00.000Z',
    supplierCompanyId: 's1',
    purchaseType: 'commercial',
    paymentType: 'cash',
    paymentTermDays: null,
    previousPaymentTermDays: null,
    termChangeReason: null,
    incoterm: 'FOB',
    shipmentReference: null,
    invoiceNo: null,
    expectedDate: null,
    subtotal: '500',
    vatAmount: '100',
    grandTotal: '600',
    currencyCode: 'USD',
    items: [{ productModelId: 'p1', description: 'Parça', quantity: '2', unitPrice: '250', discountAmount: '0', vatRate: '20' }],
  });
  assert.equal(purchase.form.type, 'purchase');
  assert.equal(purchase.form.invoiceNo, 'MF-PO-1');
  assert.equal(purchase.form.vatRate, '20');
  assert.equal(purchase.lines[0].productModelId, 'p1');
});
