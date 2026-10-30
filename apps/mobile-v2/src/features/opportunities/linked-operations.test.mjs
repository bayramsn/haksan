import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLinkedOperations } from './linked-operations.ts';
test('finds only this opportunity records across all pages including an empty matching first page', async () => {
  const pages = [];
  const result = await loadLinkedOperations('opp', async (page) => {
    pages.push(page);
    return { data: page === 1 ? [{ id: 'other', opportunityId: 'other' }] : [{ id: 'linked', opportunityId: 'opp' }, { id: 'company-only' }], meta: { totalPages: 2 } };
  });
  assert.deepEqual(pages, [1, 2]);
  assert.deepEqual(result.map((r) => r.id), ['linked']);
});
test('propagates a later page failure instead of claiming there are no linked records', async () => {
  await assert.rejects(loadLinkedOperations('opp', async (page) => {
    if (page === 2) throw new Error('Offline');
    return { data: [], meta: { totalPages: 2 } };
  }), /Offline/);
});
