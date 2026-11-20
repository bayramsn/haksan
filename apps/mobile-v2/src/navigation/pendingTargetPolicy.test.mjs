import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalPendingRoute } from './pendingTargetPolicy.ts';

test('yalnız tabs ağacını kanonik bekleyen hedef olarak kabul eder', () => {
  assert.equal(
    canonicalPendingRoute('/modules/companies/company-1'),
    '/modules/companies/company-1'
  );
  assert.equal(canonicalPendingRoute('/'), '/');
  assert.equal(canonicalPendingRoute('/(auth)/login'), null);
  assert.equal(canonicalPendingRoute('/reset-password'), null);
  assert.equal(canonicalPendingRoute('/modal/task'), null);
  assert.equal(canonicalPendingRoute('/onboarding'), null);
  assert.equal(canonicalPendingRoute('/modulesX/1'), null);
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

test('bekleyen sohbet hedefi yalnız doğrulanmış mesaj kimliğini korur', () => {
  const path = '/chat/conversation-1';
  const target = `${path}?messageId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`;
  assert.equal(canonicalPendingRoute(target), target);
  assert.equal(canonicalPendingRoute(`${target}&other=secret`), path);
  assert.equal(canonicalPendingRoute(`${path}?messageId=../bad`), path);
});
