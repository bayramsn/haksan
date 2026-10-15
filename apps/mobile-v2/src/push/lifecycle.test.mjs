import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canRetryPending,
  createPendingUnregistration,
  isPendingPushUnregistration,
  markPendingAttemptFailed,
  ownerFromAccessToken,
  retryDelayMs,
  samePushRegistration,
} from './lifecycle.ts';

function accessToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encoded}.signature`;
}

test('access token yalnız yerel user/tenant scope anahtarına çevrilir', () => {
  assert.deepEqual(ownerFromAccessToken(accessToken({ sub: 'user-1', tid: 'tenant-1' }), 'https://api.example'), {
    apiOrigin: 'https://api.example',
    tenantId: 'tenant-1',
    userId: 'user-1',
  });
  assert.equal(ownerFromAccessToken('bozuk-token', 'https://api.example'), null);
  assert.equal(ownerFromAccessToken(accessToken({ sub: 'user-1', tid: 'tenant-1' }), 'unknown'), null);
  assert.equal(ownerFromAccessToken(accessToken({ sub: '../user', tid: 'tenant-1' }), 'https://api.example'), null);
});

test('registration dedupe tenant, kullanıcı, origin ve tokenın tamamını karşılaştırır', () => {
  const base = { apiOrigin: 'https://api.example', tenantId: 'tenant-1', userId: 'user-1', token: 'push-a' };
  assert.equal(samePushRegistration(base, { ...base }), true);
  assert.equal(samePushRegistration(base, { ...base, userId: 'user-2' }), false);
  assert.equal(samePushRegistration(base, { ...base, token: 'push-b' }), false);
});

test('pending silme yalnız aynı authenticated scope içinde retry edilir', () => {
  const registration = {
    apiOrigin: 'https://api.example',
    tenantId: 'tenant-1',
    userId: 'user-1',
    token: 'push-a',
  };
  const pending = createPendingUnregistration(registration, 'pending-1', 1_000);
  assert.equal(canRetryPending(pending, registration, 1_000), true);
  assert.equal(canRetryPending(pending, { ...registration, userId: 'user-2' }, 1_000), false);
  assert.equal(canRetryPending(pending, { ...registration, apiOrigin: 'https://other.example' }, 1_000), false);
});

test('retry başarısızlığı kalıcı kaydı silmez ve bounded backoff uygular', () => {
  const pending = createPendingUnregistration(
    { apiOrigin: 'https://api.example', tenantId: 'tenant-1', userId: 'user-1', token: 'push-a' },
    'pending-1',
    1_000
  );
  const retried = markPendingAttemptFailed(pending, 2_000);
  assert.equal(retried.attempts, 1);
  assert.equal(retried.nextAttemptAt, 2_000 + retryDelayMs(1));
  assert.equal(isPendingPushUnregistration(retried), true);
  assert.equal(retryDelayMs(100), 6 * 60 * 60 * 1_000);
  assert.equal(retryDelayMs(Number.NaN), 30_000);
});

test('bozuk veya eksik pending kayıtları fail-closed reddedilir', () => {
  assert.equal(isPendingPushUnregistration({ token: 'push-a' }), false);
  assert.equal(
    isPendingPushUnregistration({
      id: 'pending-1',
      apiOrigin: 'https://api.example',
      tenantId: 'tenant-1',
      userId: 'user-1',
      token: 'push-a',
      attempts: -1,
      createdAt: 0,
      nextAttemptAt: 0,
    }),
    false
  );
});
