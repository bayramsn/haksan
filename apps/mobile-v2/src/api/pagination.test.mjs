import test from 'node:test';
import assert from 'node:assert/strict';
import { collectArrayPages, collectPaginated } from './pagination.ts';

test('complete task/analysis dataset includes records after the first page', async () => {
  const calls = [];
  const result = await collectPaginated(async (page) => {
    calls.push(page);
    return { data: page === 1 ? [{ id: 'first' }, { id: 'second' }] : [{ id: 'last' }], meta: { page, pageSize: 2, total: 3, totalPages: 2 } };
  });
  assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(result.data.map((row) => row.id), ['first', 'second', 'last']);
  assert.equal(result.meta.total, 3);
});

test('empty dataset completes after one request', async () => {
  let calls = 0;
  const result = await collectPaginated(async (page) => {
    calls++;
    return { data: [], meta: { page, total: 0, totalPages: 0 } };
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.data, []);
});

test('repeated first page fails instead of silently duplicating or looping', async () => {
  let calls = 0;
  await assert.rejects(collectPaginated(async () => {
    calls++;
    return { data: [{ id: 'same' }], meta: { page: 1, total: 2, totalPages: 2 } };
  }), /doğrulanamadı/);
  assert.equal(calls, 2);
});

test('later-page errors never resolve a partial dataset', async () => {
  await assert.rejects(collectPaginated(async (page) => {
    if (page === 2) throw new Error('offline');
    return { data: [{ id: 'first' }], meta: { page, total: 2, totalPages: 2 } };
  }), /offline/);
});

test('an empty intermediate page fails rather than hiding remaining records', async () => {
  await assert.rejects(collectPaginated(async (page) => ({ data: [], meta: { page, total: 2, totalPages: 2 } })), /tamamlanamadı/);
});

test('reference datasets continue beyond the old 25-page ceiling', async () => {
  const result = await collectPaginated(async (page) => ({
    data: Array.from({ length: 200 }, (_, index) => ({ id: `${page}-${index}` })),
    meta: { page, pageSize: 200, total: 5200, totalPages: 26 },
  }));
  assert.equal(result.data.length, 5200);
  assert.equal(result.data.at(-1).id, '26-199');
});

test('attachment/access request envelopes preserve data and total beyond 100 records', async () => {
  const result = await collectPaginated(async (page) => ({
    data: Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => ({ id: `${page}-${index}` })),
    meta: { page, pageSize: 100, total: 101, totalPages: 2 },
  }));
  assert.equal(result.data.length, 101);
  assert.equal(result.meta.total, 101);
});


test('array endpoints load history beyond 100 records and check an exact full last page', async () => {
  const calls = [];
  const rows = await collectArrayPages(async (page, size) => {
    calls.push(page);
    return page <= 2 ? Array.from({ length: size }, (_, index) => ({ id: `${page}-${index}` })) : [];
  });
  assert.equal(rows.length, 200);
  assert.deepEqual(calls, [1, 2, 3]);
});

test('array pagination rejects repeated pages and later errors instead of plausible partial history', async () => {
  await assert.rejects(collectArrayPages(async () => [{ id: 'same' }], 1), /tekrarlandı/);
  await assert.rejects(collectArrayPages(async (page) => {
    if (page === 2) throw new Error('offline');
    return [{ id: 'first' }];
  }, 1), /offline/);
});
