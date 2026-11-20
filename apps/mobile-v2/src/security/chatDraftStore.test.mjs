import assert from 'node:assert/strict';
import test from 'node:test';
import { chatDraftKey, createChatDraftStore } from './chatDraftStore.ts';

test('draft keys are scoped to tenant, user and conversation', () => {
  assert.notEqual(chatDraftKey('tenant', 'first', 'chat'), chatDraftKey('tenant', 'second', 'chat'));
  assert.notEqual(chatDraftKey('tenant', 'first', 'chat'), chatDraftKey('another', 'first', 'chat'));
  assert.equal(chatDraftKey('tenant', 'first', '../chat'), null);
});

test('a stale screen cannot overwrite a more recent draft', async () => {
  const values = new Map();
  const store = createChatDraftStore({
    read: async (key) => values.get(key) ?? null,
    write: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  });
  const oldVersion = store.advance('chat');
  const newVersion = store.advance('chat');
  await store.write('chat', 'newer text', newVersion);
  await store.write('chat', '', oldVersion);
  assert.equal(await store.read('chat'), 'newer text');
});

test('failed secure storage writes keep latest text in memory without falling back to stale disk content', async () => {
  const unavailable = async () => { throw new Error('SecureStore unavailable'); };
  const store = createChatDraftStore({
    read: async () => 'stale text',
    write: unavailable,
    remove: unavailable,
  });
  assert.equal(await store.write('chat', 'latest text', store.advance('chat')), false);
  assert.equal(await store.read('chat'), 'latest text');
  assert.equal(await store.write('chat', '', store.advance('chat')), false);
  assert.equal(await store.read('chat'), '');
});
