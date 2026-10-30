import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blankPurchaseLine,
  buildPurchaseHeader,
  buildPurchaseItems,
  defaultPurchaseForm,
  etaState,
  filterPurchaseOrders,
  purchaseKpis,
  purchaseStep,
  purchaseTotals,
  supplierInsights,
  validatePurchase,
} from './purchase-logic.ts';

const order = (orderNo, status, total, currency, supplier, purchaseType = 'commercial') => ({
  orderNo,
  invoiceNo: null,
  purchaseType,
  grandTotal: String(total),
  status: { code: status },
  currency: { code: currency },
  supplier: supplier ? { legalTitle: supplier, shortName: null } : null,
});

test('KPI ve tedarikçi içgörüsü web kurallarıyla hesaplanır', () => {
  const rows = [
    order('PO-1', 'draft', 100, 'USD', 'Acme'),
    order('PO-2', 'received', 50, 'EUR', 'Acme'),
    order('PO-3', 'approved', 10, 'USD', null, 'administrative'),
  ];
  const kpi = purchaseKpis(rows);
  assert.equal(kpi.total, 3);
  assert.equal(kpi.commercial, 2);
  assert.equal(kpi.administrative, 1);
  assert.equal(kpi.pending, 1);
  assert.deepEqual(kpi.totals, [{ currencyCode: 'USD', amount: 110 }, { currencyCode: 'EUR', amount: 50 }]);
  const [first] = supplierInsights(rows);
  assert.deepEqual(first, { name: 'Acme', count: 2, pending: 1 });
  assert.deepEqual(filterPurchaseOrders(rows, 'draft', '').map((row) => row.orderNo), ['PO-1']);
  assert.deepEqual(filterPurchaseOrders(rows, null, 'acme').map((row) => row.orderNo), ['PO-1', 'PO-2']);
});

test('durum yolculuğu ve ETA rozeti', () => {
  assert.equal(purchaseStep('draft'), 0);
  assert.equal(purchaseStep('pending_manager_approval'), 2);
  assert.equal(purchaseStep('received'), 4);
  const now = new Date(2026, 9, 15);
  assert.equal(etaState(null, now).label, 'ETA yok');
  assert.equal(etaState(new Date(2026, 9, 10).toISOString(), now).tone, 'danger');
  assert.equal(etaState(new Date(2026, 9, 18).toISOString(), now).tone, 'warning');
  assert.equal(etaState(new Date(2026, 11, 18).toISOString(), now).tone, 'success');
});

test('ticari siparişte firma zorunlu; geçersiz kalemler ayıklanır', () => {
  const form = defaultPurchaseForm(new Date(2026, 9, 15));
  assert.equal(validatePurchase(form, [], true).title, 'Ticari satın alma için firma seçimi zorunludur');
  const withSupplier = { ...form, supplierCompanyId: 's1' };
  assert.equal(validatePurchase(withSupplier, [blankPurchaseLine('commercial')], true).ok, false);
  const line = { ...blankPurchaseLine('commercial'), description: 'Rulman', quantity: '2', unitPrice: '10', discountAmount: '30' };
  assert.equal(validatePurchase(withSupplier, [line], true).title, 'İndirim kalem tutarını aşamaz');
  assert.equal(validatePurchase({ ...form, purchaseType: 'administrative' }, [], false).ok, true);
});

test('başlık ve kalem gövdeleri web ile aynı alanları taşır', () => {
  const form = { ...defaultPurchaseForm(new Date(2026, 9, 15)), supplierCompanyId: 's1', incoterm: 'FOB', expectedDate: '2026-11-01' };
  const header = buildPurchaseHeader(form);
  assert.equal(header.incoterm, 'FOB');
  assert.equal(header.paymentTermDays, 0);
  assert.equal(buildPurchaseHeader({ ...form, purchaseType: 'administrative' }).incoterm, undefined);

  const lines = [
    { ...blankPurchaseLine('commercial'), productModelId: 'p1', description: 'Rulman', quantity: '2', unitPrice: '10', vatRate: '20' },
    { ...blankPurchaseLine('commercial'), description: '' },
  ];
  const items = buildPurchaseItems(form, lines);
  assert.equal(items.length, 1);
  assert.equal(items[0].approvedPrice, 10);
  assert.equal(items[0].productModelId, 'p1');
  assert.ok(items[0].expectedDate.startsWith('2026-11-01'));
  const adminItems = buildPurchaseItems({ ...form, purchaseType: 'administrative' }, [{ ...lines[0], productModelId: 'Ofis' }]);
  assert.equal(adminItems[0].productModelId, undefined);
  assert.equal(adminItems[0].description, 'Ofis - Rulman');
  assert.deepEqual(purchaseTotals(lines), { subtotal: 20, discount: 0, vat: 4, total: 24 });
});
