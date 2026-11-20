const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = createRequire(path.resolve(__dirname, '../../../../package.json'))('typescript');

function fixture() {
  const storage = new Map();
  const calls = [];
  let updateError;
  class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
  const dependencies = {
    '@react-native-async-storage/async-storage': { default: { removeItem: async () => {} } },
    'expo-secure-store': {
      getItemAsync: async key => storage.get(key) ?? null,
      setItemAsync: async (key, value) => {
        assert.match(key, /^[\w.-]+$/, 'Native SecureStore-compatible key');
        storage.set(key, value);
      },
      deleteItemAsync: async key => storage.delete(key),
    },
    '@/src/api/services': { serviceService: {
      update: async (...args) => { calls.push(['update', ...args]); if (updateError) throw updateError; },
      updateTicketStatus: async (...args) => calls.push(['status', ...args]),
    } },
    '@/src/api/apiClient': { ApiError },
    '@/src/api/config': { apiBaseOrigin: () => 'https://crm.example' },
  };
  const sandbox = { exports: {}, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; }, Date, Math, JSON, Set, Promise, Array };
  const output = ts.transpileModule(readFileSync(path.join(__dirname, 'queue.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  vm.runInNewContext(output.outputText, sandbox);
  return { queue: sandbox.exports, calls, storage, ApiError, rejectUpdate: error => { updateError = error; } };
}
const signedPayload = () => ({ ticketId: 'ticket-id', completionForm: {
  serviceType: 'ariza', responsibility: 'garanti', yapilanIsler: 'Motor değiştirildi ve test edildi.',
  kurulumuYapan: 'Teknisyen', teslimAlan: 'Yetkili', signedAt: '2026-10-22T09:00:00Z',
  checks: [{ id: 'check-1', label: 'Test yapıldı', status: 'done' }],
} });

test('service closure saves required signed completion before closing with canonical status', async () => {
  const { queue, calls } = fixture();
  const payload = signedPayload();
  await queue.completeServiceTicket(payload);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'update');
  assert.equal(calls[0][2].resolutionNote, payload.completionForm.yapilanIsler);
  assert.equal(calls[0][2].metadata.completionForm, payload.completionForm);
  assert.equal(calls[1][0], 'status');
  assert.equal(calls[1][2], 'closed');
  assert.equal(calls[1][3], 'Closed');
});

test('missing signature, recipient and work block closure before any write', async () => {
  const { queue, calls } = fixture();
  for (const key of ['signedAt', 'teslimAlan', 'yapilanIsler']) {
    const payload = signedPayload();
    payload.completionForm[key] = '';
    await assert.rejects(queue.completeServiceTicket(payload), error => error.code === 'SERVICE_COMPLETION_INCOMPLETE');
  }
  assert.equal(calls.length, 0);
});

test('rejected form save never attempts status closure', async () => {
  const { queue, calls, ApiError, rejectUpdate } = fixture();
  rejectUpdate(new ApiError(422, 'VALIDATION_ERROR', 'Geçersiz form'));
  await assert.rejects(queue.completeServiceTicket(signedPayload()), error => error.status === 422);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'update');
});

test('offline replay retains full original signed form and checks', async () => {
  const { queue, calls, storage } = fixture();
  await queue.setOfflineQueueScope({ tenantId: 'tenant-id', userId: 'user-id' });
  const payload = signedPayload();
  await queue.enqueueMutation({ kind: 'service-complete', payload });
  assert.equal(await queue.getQueueLength(), 1);
  const serialized = [...storage.values()].find(value => value.includes('completionForm'));
  assert.ok(serialized.includes(payload.completionForm.signedAt));
  assert.ok(serialized.includes('check-1'));
  const result = await queue.flushOfflineQueue();
  assert.equal(result.ok, 1);
  assert.equal(result.failed, 0);
  assert.equal(calls[0][2].metadata.completionForm.signedAt, payload.completionForm.signedAt);
  assert.equal(calls[0][2].metadata.completionForm.checks[0].id, 'check-1');
  assert.equal(await queue.getQueueLength(), 0);
});

test('legacy note-only queue entries cannot close service and are not silently discarded', async () => {
  const { queue, calls } = fixture();
  await queue.setOfflineQueueScope({ tenantId: 'tenant-id', userId: 'user-id' });
  await queue.enqueueMutation({ kind: 'service-complete', payload: { ticketId: 'legacy', notes: 'Old unsent note' } });
  const result = await queue.flushOfflineQueue();
  assert.equal(result.ok, 0);
  assert.equal(result.failed, 1);
  assert.equal(await queue.getQueueLength(), 1);
  assert.equal(calls.length, 0);
});

test('network failure retains signed service completion for retry', async () => {
  const { queue, ApiError, rejectUpdate } = fixture();
  await queue.setOfflineQueueScope({ tenantId: 'tenant-id', userId: 'user-id' });
  await queue.enqueueMutation({ kind: 'service-complete', payload: signedPayload() });
  rejectUpdate(new ApiError(0, 'NETWORK', 'Offline'));
  const result = await queue.flushOfflineQueue();
  assert.equal(result.failed, 1);
  assert.equal(await queue.getQueueLength(), 1);
});
