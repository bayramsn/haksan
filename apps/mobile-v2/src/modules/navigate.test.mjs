import assert from 'node:assert/strict';
import test from 'node:test';
import { routeForIncomingHref, routeForNavigation, routeForPushData, routeForTarget } from './navigate.ts';

test('bildirim fırsat hedefini activity query ile açar', () => {
  assert.equal(
    routeForTarget({ kind: 'opportunity', opportunityId: 'opp-1', activityId: 'act-1' }),
    '/modules/opportunities/opp-1?activityId=act-1'
  );
});

test('şikayet navigasyonu doğrudan complaint detayına çevrilir', () => {
  assert.equal(
    routeForNavigation('service-requests', 'complaint:cmp-1'),
    '/modules/service-complaints/cmp-1'
  );
});

test('web firma haritası navigasyonu native harita modülüne gider', () => {
  assert.equal(routeForNavigation('sales-map'), '/modules/company-map');
});

test('web universal link native kayda çevrilir', () => {
  assert.equal(
    routeForIncomingHref('https://mobile.example/app/companies/company-1', ['mobile.example']),
    '/modules/companies/company-1'
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
    '/modules/companies/company-1'
  );
});

test('custom scheme host tabanlı path firma detayına çevrilir', () => {
  assert.equal(
    routeForIncomingHref('haksan://companies/company-1'),
    '/modules/companies/company-1'
  );
});

test('tüm native detay ekranları universal link kaydını birebir açar', () => {
  const paths = {
    contacts: '/modules/contacts/record-1',
    opportunities: '/modules/opportunities/record-1',
    quotes: '/modules/quotes/record-1',
    products: '/modules/products/record-1',
    inventory: '/modules/inventory/record-1',
    'service-tickets': '/modules/service-tickets/record-1',
    shipments: '/modules/shipments/record-1',
    'sales-orders': '/modules/sales-orders/record-1',
    'purchase-orders': '/modules/purchase-orders/record-1',
    payments: '/modules/payments/record-1',
    receivables: '/modules/receivables/record-1',
    invoices: '/modules/invoices/record-1',
    'accounting-invoices': '/modules/invoices/record-1',
    installations: '/modules/installations/record-1',
    'customer-devices': '/modules/customer-devices/record-1',
    machines: '/modules/customer-devices/record-1',
    'maintenance-plans': '/modules/maintenance-plans/record-1',
    activities: '/modules/activities/record-1',
    proformas: '/modules/documents/proforma/record-1',
    contracts: '/modules/documents/contract/record-1',
    'commercial-invoices': '/modules/documents/invoice/record-1',
    'service-complaints': '/modules/service-complaints/record-1',
    chat: '/chat/record-1',
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
    routeForIncomingHref('/modules/companies?secret=value#fragment'),
    '/modules/companies'
  );
});

test('legacy tab links normalize into shared stack paths without losing record IDs', () => {
  assert.equal(routeForIncomingHref('haksan:///(tabs)/modules/companies/1'), '/modules/companies/1');
  assert.equal(routeForIncomingHref('/(tabs)/(home)/chat/1'), '/chat/1');
  assert.equal(routeForIncomingHref('/chat'), '/chat');
  assert.equal(routeForIncomingHref('/more'), '/more');
});

test('görev ve servis bildirimi kayıt detayına, haftalık rapor ve hedef uyarısı ilgili sekmeye gider', () => {
  assert.equal(routeForTarget({ kind: 'navigate', nav: 'tasks', query: 'task:tsk-1' }), '/modules/tasks/tsk-1');
  assert.equal(routeForTarget({ kind: 'navigate', nav: 'service-requests', query: 'ticket:tkt-1' }), '/modules/service-tickets/tkt-1');
  assert.equal(routeForTarget({ kind: 'navigate', nav: 'reports', query: 'weekly-sales' }), '/modules/reports?mode=analytics');
  assert.equal(routeForTarget({ kind: 'navigate', nav: 'dashboard', focus: 'targets' }), '/(tabs)/(home)?section=rapor&pane=hedefler');
  assert.equal(routeForTarget({ kind: 'navigate', nav: 'tasks' }), '/modules/tasks');
});

test('API push verisi { nav, entityId } kayıt detayına gider', () => {
  assert.equal(routeForPushData({ nav: 'tasks', entityId: 'tsk-9' }), '/modules/tasks/tsk-9');
  assert.equal(routeForPushData({ nav: 'activities', entityId: 'act-9' }), '/modules/activities/act-9');
  assert.equal(routeForPushData({ nav: 'calendar', entityId: 'evt-9' }), '/modules/calendar');
  assert.equal(routeForPushData({ kind: 'navigate', nav: 'dashboard', focus: 'targets' }), '/(tabs)/(home)?section=rapor&pane=hedefler');
});
