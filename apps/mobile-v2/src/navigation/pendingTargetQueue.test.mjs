import assert from 'node:assert/strict';
import test from 'node:test';
import { createPendingTargetQueue } from './pendingTargetPolicy.ts';

function memoryStorage() {
  let value = null;
  return {
    storage: {
      get: async () => value,
      set: async (next) => {
        value = next;
      },
      delete: async () => {
        value = null;
      },
    },
    value: () => value,
  };
}

test('querysiz kanonik hedefi saklar ve yalnız bir kez tüketir', async () => {
  const backend = memoryStorage();
  const queue = createPendingTargetQueue(backend.storage, () => 1_000);
  assert.equal(await queue.queue('/(tabs)/modules/opportunities/opp-1?activityId=secret'), true);
  assert.doesNotMatch(backend.value(), /secret/);

  const [first, second] = await Promise.all([queue.consume(), queue.consume()]);
  assert.deepEqual([first, second], ['/(tabs)/modules/opportunities/opp-1', null]);
  assert.equal(backend.value(), null);
});

test('auth ve raw dış URL hedefleri depoya hiç yazılmaz', async () => {
  const backend = memoryStorage();
  const queue = createPendingTargetQueue(backend.storage);
  assert.equal(await queue.queue('/(auth)/reset-password?token=secret'), false);
  assert.equal(await queue.queue('https://mobile.example/app/companies/1'), false);
  assert.equal(backend.value(), null);
});

test('süresi geçmiş kalıcı hedef replay edilmeden silinir', async () => {
  const backend = memoryStorage();
  await backend.storage.set(
    JSON.stringify({ version: 1, route: '/(tabs)/modules/companies/1', createdAt: 1_000 })
  );
  const queue = createPendingTargetQueue(backend.storage, () => 31 * 60 * 1_000);
  assert.equal(await queue.consume(), null);
  assert.equal(backend.value(), null);
});

test('kalıcı silme başarısızsa hedef teslim edilmez', async () => {
  const queue = createPendingTargetQueue({
    get: async () => JSON.stringify({ version: 1, route: '/(tabs)', createdAt: 1_000 }),
    set: async () => undefined,
    delete: async () => {
      throw new Error('storage unavailable');
    },
  }, () => 1_500);
  assert.equal(await queue.consume(), null);
});
