import assert from 'node:assert/strict';
import test from 'node:test';
import { runStartup } from './startup.ts';
test('secure storage denial rejects without continuing startup; a later retry can succeed', async () => {
  let mounted = false;
  await assert.rejects(runStartup(async () => { throw new Error('keychain denied'); }), /keychain denied/);
  assert.equal(mounted, false);
  await runStartup(async () => { mounted = true; });
  assert.equal(mounted, true);
});
test('a stalled native initialization reaches recovery instead of an endless splash', async () => {
  await assert.rejects(runStartup(() => new Promise(() => {}), 10), /zaman aşımına/);
});

test('completion after a timed-out attempt cannot release a startup gate', async () => {
  let resolveStorage;
  let opened = false;
  const storage = new Promise(resolve => { resolveStorage = resolve; });
  const attempt = runStartup(() => storage, 10).then(() => { opened = true; });
  await assert.rejects(attempt, /zaman aşımına/);
  resolveStorage('late');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(opened, false);
});
