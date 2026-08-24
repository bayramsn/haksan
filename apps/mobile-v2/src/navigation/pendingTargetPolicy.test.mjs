import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalPendingRoute } from './pendingTargetPolicy.ts';

test('yalnız tabs ağacını kanonik bekleyen hedef olarak kabul eder', () => {
  assert.equal(
    canonicalPendingRoute('/(tabs)/modules/companies/company-1'),
    '/(tabs)/modules/companies/company-1'
  );
  assert.equal(canonicalPendingRoute('/(auth)/login'), null);
  assert.equal(canonicalPendingRoute('https://mobile.example/app/companies/1'), null);
});

test('query ve hash kalıcı hedeften çıkarılır', () => {
  assert.equal(
    canonicalPendingRoute('/(tabs)/modules/opportunities/opp-1?activityId=secret#frag'),
    '/(tabs)/modules/opportunities/opp-1'
  );
});

test('path traversal ve kodlanmış slash reddedilir', () => {
  assert.equal(canonicalPendingRoute('/(tabs)/modules/../settings'), null);
  assert.equal(canonicalPendingRoute('/(tabs)/modules/company%2Fsecret'), null);
  assert.equal(canonicalPendingRoute('/(tabs)/modules/%E0%A4%A'), null);
});
