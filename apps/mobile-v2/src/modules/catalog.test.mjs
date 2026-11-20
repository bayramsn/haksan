import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessModule, childPages, moduleForPath, modules, webMenu, mobileMenu } from './catalog.ts';

test('module routes and cards use the same permission and tenant visibility', () => {
  const user = { roles: ['sales'], permissions: ['companies.read'] };
  const entry = modules.find((item) => item.key === 'companies');
  assert.equal(canAccessModule(user, { hiddenNavigationKeys: [] }, entry), true);
  assert.equal(canAccessModule(user, { hiddenNavigationKeys: ['customers'] }, entry), false);
  assert.equal(canAccessModule({ ...user, permissions: [] }, null, entry), false);
  assert.equal(canAccessModule(null, null, entry), false);
  assert.equal(moduleForPath('/modules/companies/record'), entry);
  assert.equal(moduleForPath('/(tabs)/modules/companies/record'), entry);
});
test('Modüller ekranı web menüsüyle aynı grup ve sırada', () => {
  const admin = { roles: ['super_admin'], permissions: [] };
  const menu = webMenu(admin, { hiddenNavigationKeys: [] });
  assert.deepEqual(menu.map((group) => group.title), ['Genel', 'Satış', 'Satış Operasyonu', 'Operasyon', 'Servis', 'Raporlar']);
  assert.deepEqual(menu[1].items.map((item) => item.title), ['Firmalar', 'Fırsat', 'Referanslar']);
  assert.deepEqual(menu[4].items.map((item) => item.key), ['machines', 'installations', 'service-requests', 'service-kanban', 'service-price-list']);
  assert.equal(menu[4].items[3].route, '/modules/service-tickets?view=board');
});
test('Modüller satırı yetki ve tenant gizlemesine uyar', () => {
  const sales = { roles: ['sales'], permissions: ['companies.read', 'quotes.read'] };
  const titles = webMenu(sales, { hiddenNavigationKeys: ['offers'] }).flatMap((group) => group.items.map((item) => item.key));
  assert.ok(titles.includes('customers'));
  assert.ok(!titles.includes('offers'));
  assert.ok(!titles.includes('stock'));
});
test('menüde satırı olmayan sayfalar ana sayfalarının içinden açılır', () => {
  const admin = { roles: ['super_admin'], permissions: [] };
  assert.deepEqual(childPages('payments', admin, null).map((entry) => entry.key), ['receivables']);
  assert.deepEqual(childPages('service-tickets', admin, null).map((entry) => entry.key), ['service-complaints']);
  const menuKeys = new Set(webMenu(admin, null).flatMap((group) => group.items.map((item) => item.route.split('?')[0])));
  for (const entry of modules) assert.ok(entry.parent || menuKeys.has(entry.route), `${entry.key} ne menüde ne bir ana sayfada`);
});
test('service price lists remain reachable when only sales prices are hidden', () => {
  const user = { roles: [], permissions: ['price_lists.read'] };
  const entry = modules.find((item) => item.key === 'price-lists');
  assert.equal(canAccessModule(user, { hiddenNavigationKeys: ['sales-price-list'] }, entry), true);
  assert.equal(canAccessModule(user, { hiddenNavigationKeys: ['sales-price-list', 'service-price-list'] }, entry), false);
});
test('Servis Talepleri gizliyken Servis Kanban görünür kalır (webdeki gibi ayrı anahtarlar)', () => {
  const admin = { roles: ['super_admin'], permissions: [] };
  const keys = webMenu(admin, { hiddenNavigationKeys: ['service-requests'] }).flatMap((group) => group.items.map((item) => item.key));
  assert.ok(keys.includes('service-kanban'));
  assert.ok(!keys.includes('service-requests'));
  const tickets = modules.find((item) => item.key === 'service-tickets');
  assert.equal(canAccessModule(admin, { hiddenNavigationKeys: ['service-requests'] }, tickets), true);
  assert.equal(canAccessModule(admin, { hiddenNavigationKeys: ['service-requests', 'service-kanban'] }, tickets), false);
});
test('alt sayfa, tenant ana sayfayı gizleyince onunla gizlenir', () => {
  const admin = { roles: ['super_admin'], permissions: [] };
  const purchase = modules.find((item) => item.key === 'purchase-orders');
  assert.equal(canAccessModule(admin, { hiddenNavigationKeys: [] }, purchase), true);
  assert.equal(canAccessModule(admin, { hiddenNavigationKeys: ['stock'] }, purchase), false);
  assert.deepEqual(childPages('inventory', admin, { hiddenNavigationKeys: ['stock'] }), []);
});


test('mobile groups preserve every authorized web destination exactly once', () => {
  for (const user of [null, { roles: ['super_admin'], permissions: [] }, { roles: [], permissions: ['companies.read', 'price_lists.read'] }]) {
    for (const hiddenNavigationKeys of [[], ['service-requests', 'sales-price-list'], ['customers', 'stock']]) {
      const tenant = { hiddenNavigationKeys };
      const expected = webMenu(user, tenant).flatMap(group => group.items);
      const actual = mobileMenu(user, tenant).flatMap(group => group.items);
      assert.equal(new Set(actual.map(item => item.key)).size, actual.length);
      assert.deepEqual([...actual].sort((a,b) => a.key.localeCompare(b.key)), [...expected].sort((a,b) => a.key.localeCompare(b.key)));
    }
  }
});

test('mobile groups have stable workflow order and preserve service view links', () => {
  const menu = mobileMenu({ roles: ['super_admin'], permissions: [] }, null);
  assert.deepEqual(menu.map(group => group.title), ['Satış ve Müşteriler', 'Saha ve Servis', 'Operasyon ve Stok', 'Finans', 'Yönetim ve Raporlar']);
  assert.ok(menu[1].items.some(item => item.route === '/modules/service-tickets?view=board'));
  assert.ok(menu[1].items.some(item => item.route === '/modules/service-tickets?view=list'));
});
