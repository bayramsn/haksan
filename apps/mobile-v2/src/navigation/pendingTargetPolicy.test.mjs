import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalPendingRoute } from './pendingTargetPolicy.ts';

test('yalnız tabs ağacını kanonik bekleyen hedef olarak kabul eder', () => {
  assert.equal(
    canonicalPendingRoute('/modules/companies/company-1'),
    '/modules/companies/company-1'
  );
  assert.equal(canonicalPendingRoute('/(auth)/login'), null);
  assert.equal(canonicalPendingRoute('https://mobile.example/app/companies/1'), null);
});

test('query ve hash kalıcı hedeften çıkarılır', () => {
  assert.equal(
    canonicalPendingRoute('/modules/opportunities/opp-1?activityId=secret#frag'),
    '/modules/opportunities/opp-1'
  );
});

test('path traversal ve kodlanmış slash reddedilir', () => {
  assert.equal(canonicalPendingRoute('/modules/../settings'), null);
  assert.equal(canonicalPendingRoute('/modules/company%2Fsecret'), null);
  assert.equal(canonicalPendingRoute('/modules/%E0%A4%A'), null);
});

test('legacy and explicitly grouped links remain valid after shared tab migration', () => {
  assert.equal(canonicalPendingRoute('/(tabs)/modules/companies/1'), '/modules/companies/1');
  assert.equal(canonicalPendingRoute('/(tabs)/(companies)/modules/companies/1'), '/modules/companies/1');
  assert.equal(canonicalPendingRoute('/(tabs)'), '/(tabs)/(home)');
  assert.equal(canonicalPendingRoute('/(tabs)/(home)'), '/(tabs)/(home)');
  assert.equal(canonicalPendingRoute('/more/profile'), '/more/profile');
  assert.equal(canonicalPendingRoute('/chat/1'), '/chat/1');
});
