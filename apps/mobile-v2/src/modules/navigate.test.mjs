import assert from 'node:assert/strict';
import test from 'node:test';
import { routeForIncomingHref, routeForNavigation, routeForPushData, routeForTarget } from './navigate.ts';

test('bildirim fırsat hedefini activity query ile açar', () => {
  assert.equal(
    routeForTarget({ kind: 'opportunity', opportunityId: 'opp-1', activityId: 'act-1' }),
    '/(tabs)/modules/opportunities/opp-1?activityId=act-1'
  );
});

test('şikayet navigasyonu doğrudan complaint detayına çevrilir', () => {
  assert.equal(
    routeForNavigation('service-requests', 'complaint:cmp-1'),
    '/(tabs)/modules/service-complaints/cmp-1'
  );
});

test('web firma haritası navigasyonu native harita modülüne gider', () => {
  assert.equal(routeForNavigation('sales-map'), '/(tabs)/modules/company-map');
});

test('web universal link native kayda çevrilir', () => {
  assert.equal(
    routeForIncomingHref('https://mobile.example/app/companies/company-1', ['mobile.example']),
    '/(tabs)/modules/companies/company-1'
  );
});

test('allowlist dışı dış URL reddedilir', () => {
  assert.equal(routeForIncomingHref('https://evil.example/phishing'), null);
});

test('desteklenen path taşısa bile allowlist dışı universal link reddedilir', () => {
  assert.equal(routeForIncomingHref('https://evil.example/app/companies/company-1', ['mobile.example']), null);
});

test('sunucunun kind tabanlı push kontratı firma detayına gider', () => {
  assert.equal(
    routeForPushData({ kind: 'company', companyId: 'company-1' }),
    '/(tabs)/modules/companies/company-1'
  );
});

test('custom scheme host tabanlı path firma detayına çevrilir', () => {
  assert.equal(
    routeForIncomingHref('haksan://companies/company-1'),
    '/(tabs)/modules/companies/company-1'
  );
});

test('tüm native detay ekranları universal link kaydını birebir açar', () => {
  const paths = {
    contacts: '/(tabs)/modules/contacts/record-1',
    opportunities: '/(tabs)/modules/opportunities/record-1',
    quotes: '/(tabs)/modules/quotes/record-1',
    products: '/(tabs)/modules/products/record-1',
    inventory: '/(tabs)/modules/inventory/record-1',
    'service-tickets': '/(tabs)/modules/service-tickets/record-1',
    shipments: '/(tabs)/modules/shipments/record-1',
    'sales-orders': '/(tabs)/modules/sales-orders/record-1',
    'purchase-orders': '/(tabs)/modules/purchase-orders/record-1',
    payments: '/(tabs)/modules/payments/record-1',
    receivables: '/(tabs)/modules/receivables/record-1',
    invoices: '/(tabs)/modules/invoices/record-1',
    'accounting-invoices': '/(tabs)/modules/invoices/record-1',
    installations: '/(tabs)/modules/installations/record-1',
    'customer-devices': '/(tabs)/modules/customer-devices/record-1',
    machines: '/(tabs)/modules/customer-devices/record-1',
    'maintenance-plans': '/(tabs)/modules/maintenance-plans/record-1',
    activities: '/(tabs)/modules/activities/record-1',
    proformas: '/(tabs)/modules/documents/proforma/record-1',
    contracts: '/(tabs)/modules/documents/contract/record-1',
    'commercial-invoices': '/(tabs)/modules/documents/invoice/record-1',
    'service-complaints': '/(tabs)/modules/service-complaints/record-1',
    chat: '/(tabs)/chat/record-1',
  };
  for (const [resource, expected] of Object.entries(paths)) {
    assert.equal(
      routeForIncomingHref(`https://mobile.example/app/${resource}/record-1`, ['mobile.example']),
      expected
    );
  }
});

test('detay kimliğinde kodlanmış slash ve path traversal reddedilir', () => {
  assert.equal(routeForIncomingHref('/companies/%2Fmore'), null);
  assert.equal(routeForIncomingHref('/companies/..'), null);
});

test('reset-password yalnız tek token query ile auth rotasına gider', () => {
  assert.equal(
    routeForIncomingHref('https://mobile.example/app/reset-password?token=safe-token_123', ['mobile.example']),
    '/(auth)/reset-password?token=safe-token_123'
  );
  assert.equal(
    routeForIncomingHref('https://mobile.example/app/reset-password?token=one&next=https://evil.example', [
      'mobile.example',
    ]),
    null
  );
  assert.equal(routeForIncomingHref('/reset-password?token=one&token=two'), null);
  assert.equal(
    routeForIncomingHref('haksan://reset-password?resetToken=mail-token'),
    '/(auth)/reset-password?token=mail-token'
  );
  assert.equal(routeForIncomingHref('/reset-password?token=one&resetToken=two'), null);
});

test('native prefix üzerinden gelen serbest query ve hash taşınmaz', () => {
  assert.equal(
    routeForIncomingHref('/(tabs)/modules/companies?secret=value#fragment'),
    '/(tabs)/modules/companies'
  );
});
