import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bindNavigationContext, createNavigationContext, consumeNavigationContext, navigationMonth } from './navigationContext.ts';
import { routeForNavigation } from './navigate.ts';
beforeEach(() => { bindNavigationContext(null); bindNavigationContext('tenant:user:department:division'); });
test('opaque URL handoff consumes private search exactly once', () => {
  const route = routeForNavigation('products', 'Ahmet +905551112233');
  assert.match(route, /^\/modules\/products\?navigationAction=[a-f0-9]{32}$/);
  assert.equal(route.includes('Ahmet'), false);
  const id = route.split('=')[1];
  assert.deepEqual(consumeNavigationContext(id, 'products'), { nav: 'products', query: 'Ahmet +905551112233' });
  assert.equal(consumeNavigationContext(id, 'products'), null);
});
test('same-screen successive notifications carry independent filters', () => {
  const one = createNavigationContext('payments', 'first', 'overdue'), two = createNavigationContext('payments', 'second', 'paid');
  assert.notEqual(one, two);
  assert.equal(consumeNavigationContext(one, 'payments').focus, 'overdue');
  assert.equal(consumeNavigationContext(two, 'payments').focus, 'paid');
});
test('account, scope and authorization changes invalidate pending text', () => {
  for (const changed of ['other-user', 'other-division', 'new-permissions']) {
    bindNavigationContext('original'); const id = createNavigationContext('stock', 'private', 'reserved');
    bindNavigationContext(changed); assert.equal(consumeNavigationContext(id, 'stock'), null);
  }
  let rev = 'a'; bindNavigationContext('user', () => rev); const id = createNavigationContext('products', 'private'); rev = 'b';
  assert.equal(consumeNavigationContext(id, 'products'), null);
});
test('expired wrong-screen and cold-restored action IDs fail closed', () => {
  const clock = Date.now, now = clock();
  try { Date.now = () => now; const id = createNavigationContext('stock', 'private'); Date.now = () => now + 30 * 60000; assert.equal(consumeNavigationContext(id, 'stock'), null); } finally { Date.now = clock; }
  const id = createNavigationContext('offers', 'private'); assert.equal(consumeNavigationContext(id, 'products'), null); assert.equal(consumeNavigationContext(id, 'offers'), null);
  assert.equal(consumeNavigationContext('restored', 'offers'), null);
});
test('unknown focus unsafe text rejected and record navigation unchanged', () => {
  assert.equal(createNavigationContext('payments', undefined, 'delete'), null);
  assert.equal(createNavigationContext('products', 'x\u0000'), null);
  assert.equal(routeForNavigation('service-requests', 'ticket:123'), '/modules/service-tickets/123');
});
test('month/year drilldown uses complete calendar bounds', () => {
  assert.deepEqual(navigationMonth('month:2024-02'), { search: '', from: '2024-02-01', to: '2024-02-29' });
  assert.deepEqual(navigationMonth('month:2026'), { search: '', from: '2026-01-01', to: '2026-12-31' });
  assert.deepEqual(navigationMonth('month:2026-19'), { search: '' }); assert.deepEqual(navigationMonth('Torna'), { search: 'Torna' });
});
test('web operation focus maps into native status filters without broadening statuses', async () => {
  const { navigationPreset } = await import('./navigationContext.ts');
  for (const [nav, focus, expected] of [['offers','won','approved'],['offers','lost','closed'],['offers','expired','sent'],['stock','reserved','reserved'],['payments','overdue','Overdue'],['payments','upcoming','Pending'],['shipments','delivered','delivered']]) assert.equal(navigationPreset(nav, focus), expected);
  assert.equal(navigationPreset('payments','unknown'), null);
  assert.equal(navigationPreset('stock','low'), null);
});
