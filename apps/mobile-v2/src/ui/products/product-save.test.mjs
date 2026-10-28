import test from 'node:test';
import assert from 'node:assert/strict';
import { productPartsReady, saveProductWithDetails } from './product-save.ts';

test('a failed spec or equipment request cannot become a complete editable snapshot', () => {
  const ready = { isPending: false, isError: false };
  assert.equal(productPartsReady(ready, { isPending: false, isError: true }), false);
  assert.equal(productPartsReady({ isPending: false, isError: true }, ready), false);
  assert.equal(productPartsReady(ready, { isPending: true, isError: false }), false);
  assert.equal(productPartsReady(ready, ready), true);
});

test('retry after details failure finishes same newly-created product without another POST', async () => {
  const progress = { busy: false }; const creates = [], updates = [], details = [];
  let fail = true;
  const options = { body: { modelCode: 'MODEL' }, details: { specs: [{ key: 'Power', value: '12' }], equipment: [] }, writeDetails: true,
    create: async body => { creates.push(body); return { id: 'persisted-product' }; },
    update: async (...args) => { updates.push(args); },
    replaceDetails: async (...args) => { details.push(args); if (fail) throw new Error('temporary details failure'); },
  };
  await assert.rejects(saveProductWithDetails(progress, options), /temporary/);
  assert.equal(progress.createdId, 'persisted-product'); assert.equal(progress.busy, false);
  fail = false; assert.equal(await saveProductWithDetails(progress, options), 'persisted-product');
  assert.equal(creates.length, 1); assert.equal(updates.length, 0); assert.equal(details.length, 2);
  assert.ok(details.every(([id]) => id === 'persisted-product'));
});

test('edits after partial create update original product before completing details', async () => {
  const progress = { busy: false, createdId: 'original', savedBody: JSON.stringify({ modelCode: 'before' }) };
  const calls = [];
  await saveProductWithDetails(progress, { body: { modelCode: 'after' }, details: {}, writeDetails: true,
    create: async () => { throw new Error('must not create'); },
    update: async (id, body) => { calls.push(['update', id, body]); },
    replaceDetails: async id => { calls.push(['details', id]); },
  });
  assert.deepEqual(calls, [['update', 'original', { modelCode: 'after' }], ['details', 'original']]);
});

test('simultaneous save attempt does not start a second product create', async () => {
  const progress = { busy: false }; let finish; let creates = 0;
  const options = { body: {}, details: {}, writeDetails: false,
    create: () => { creates++; return new Promise(resolve => { finish = resolve; }); },
    update: async () => {}, replaceDetails: async () => {},
  };
  const first = saveProductWithDetails(progress, options);
  await assert.rejects(saveProductWithDetails(progress, options), /devam ediyor/);
  finish({ id: 'one' }); await first; assert.equal(creates, 1);
});

test('existing product update never replaces details when user did not edit them', async () => {
  let replacements = 0;
  await saveProductWithDetails({ busy: false }, { existingId: 'saved', body: {}, details: {}, writeDetails: false,
    create: async () => { throw new Error('must not create'); }, update: async () => {}, replaceDetails: async () => { replacements++; },
  });
  assert.equal(replacements, 0);
});

test('lost response retries frozen create body before applying subsequently edited form', async () => {
  const progress = { busy: false }; const calls = []; let first = true;
  const initial = { modelCode: 'ORIGINAL' };
  const callbacks = {
    create: async body => { calls.push(['create', body.modelCode]); if (first) { first = false; throw new Error('response lost'); } return { id: 'server-recovered' }; },
    update: async (id, body) => { calls.push(['update', id, body.modelCode]); }, replaceDetails: async () => {},
  };
  await assert.rejects(saveProductWithDetails(progress, { body: initial, createBody: initial, details: {}, writeDetails: false, ...callbacks }));
  await saveProductWithDetails(progress, { body: { modelCode: 'EDITED' }, createBody: initial, details: {}, writeDetails: false, ...callbacks });
  assert.deepEqual(calls, [['create', 'ORIGINAL'], ['create', 'ORIGINAL'], ['update', 'server-recovered', 'EDITED']]);
});
