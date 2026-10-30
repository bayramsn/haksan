import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';
function load(file, mocks = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  vm.runInNewContext(source, { exports, require: name => { assert(name in mocks, name); return mocks[name]; }, Date });
  return exports;
}
function harness() {
  let saved = null, pause = null;
  const secure = { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'unlocked', getItemAsync: async () => saved, setItemAsync: async (_, value) => { if (pause) await pause; saved = value; }, deleteItemAsync: async () => { saved = null; } };
  const storage = load('./storage.ts', { 'expo-crypto': { randomUUID }, '@/src/security/secure-store': secure, './policy': load('./policy.ts') });
  return { storage, pause: value => { pause = value; }, saved: () => saved };
}
const action = (scope, id = randomUUID()) => ({ id, action: 'after_call', scope, createdAt: Date.now(), phoneNumber: '+905321234567' });

test('separate handoffs survive, deduplicate, and consume only once', async () => {
  const { storage: s } = harness(); await s.activateAssistant('a'); await s.setAssistantEnabled(true);
  const first = action('a'), second = action('a');
  await s.queueAction(first); await s.queueAction(second); await s.queueAction(first);
  assert.equal((await s.consumeAction(first.id)).id, first.id);
  assert.equal(await s.consumeAction(first.id), null);
  assert.equal((await s.consumeAction(second.id)).id, second.id);
});

test('handoff inspection survives failed preparation and only acknowledgment consumes it', async () => {
  const { storage: s } = harness(); await s.activateAssistant('a'); await s.setAssistantEnabled(true);
  const pending = action('a'); await s.queueAction(pending);
  assert.equal(s.peekAction(pending.id).id, pending.id);
  assert.equal(s.peekAction(pending.id).id, pending.id);
  assert.equal((await s.consumeAction(pending.id)).id, pending.id);
  assert.equal(s.peekAction(pending.id), null);
  await s.queueAction(action('a', pending.id)); await s.activateAssistant('b');
  assert.equal(s.peekAction(pending.id), null);
});

test('returning from Phone stays retryable until acknowledged and expires after two hours', async () => {
  const { storage: s } = harness(); await s.activateAssistant('a'); await s.setAssistantEnabled(true);
  const call = await s.beginCall('+905321234567', { companyId: 'company', contactId: 'contact' });
  assert.equal(s.returnedCall(), null); await s.markCallLeft();
  assert.equal(s.returnedCall().companyId, 'company');
  assert.equal(s.returnedCall().id, call.id);
  s.assistantSession().call.startedAt -= 2 * 60 * 60_000 + 1;
  assert.equal(s.returnedCall(), null);
  await s.clearCall(call.id); assert.equal(s.returnedCall(), null);
});

test('switching accounts clears customer context and disables consent', async () => {
  const { storage: s } = harness(); await s.activateAssistant('a'); await s.setAssistantEnabled(true);
  await s.queueAction(action('a')); await s.beginCall('+905321234567');
  await s.activateAssistant('b'); assert.equal(s.assistantSession().enabled, false);
  assert.equal(s.assistantSession().call, undefined); assert.equal(await s.consumeAction(), null);
  assert.equal(await s.queueAction(action('a')), false);
  await s.activateAssistant(null); assert.equal(s.assistantSession(), null);
});

test('account switch while SecureStore consumes an action never returns old customer data', async () => {
  const h = harness(), s = h.storage; await s.activateAssistant('a'); await s.setAssistantEnabled(true);
  const pending = action('a'); await s.queueAction(pending);
  let release; h.pause(new Promise(resolve => { release = resolve; }));
  const consuming = s.consumeAction(pending.id); await Promise.resolve();
  const switching = s.activateAssistant('b'); release();
  assert.equal(await consuming, null); await switching;
  assert.equal(s.assistantSession().scope, 'b');
});

test('failed dial clears its own call context without removing a newer call', async () => {
  const cleared = [];
  const { startCrmCall } = load('./call.ts', {
    '@haksan/shared': { normalizePhoneNumber: input => input },
    'react-native': { Linking: { openURL: async () => { throw new Error('Dial failed'); } } },
    './storage': { beginCall: async () => ({ id: 'failed-call' }), clearCall: async id => cleared.push(id) },
    './policy': load('./policy.ts'),
  });
  await assert.rejects(startCrmCall('+905321234567'), /Dial failed/);
  assert.deepEqual(cleared, ['failed-call']);
});
