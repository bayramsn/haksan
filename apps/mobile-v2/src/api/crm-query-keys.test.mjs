import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { opportunityKeys } from './crm-query-keys.ts';

test('a board result cannot replace paginated picker/list data for the same filters', () => {
  const cache = new QueryClient();
  const filters = { companyId: 'company-1', view: 'all', qualificationStage: 'lead' };
  const list = { pages: [{ data: [{ id: 'picker-contact-opportunity' }], meta: { page: 1, totalPages: 2 } }], pageParams: [1] };
  const board = { data: [{ id: 'board-opportunity' }], meta: { page: 1, totalPages: 1 } };
  cache.setQueryData(opportunityKeys.list(filters), list);
  cache.setQueryData(opportunityKeys.board(filters), board);
  assert.deepEqual(cache.getQueryData(opportunityKeys.list(filters)), list);
  assert.deepEqual(cache.getQueryData(opportunityKeys.board(filters)), board);
  cache.clear();
});

test('opportunity mutation invalidation still reaches board, picker and detail', async () => {
  const cache = new QueryClient();
  const keys = [opportunityKeys.list({ companyId: 'c1' }), opportunityKeys.board({ qualificationStage: 'win' }), opportunityKeys.detail('o1')];
  for (const key of keys) cache.setQueryData(key, { id: 'o1' });
  await cache.invalidateQueries({ queryKey: opportunityKeys.all, refetchType: 'none' });
  for (const key of keys) assert.equal(cache.getQueryState(key)?.isInvalidated, true);
  cache.clear();
});

test('company search and stage scopes keep independent cached picker results', () => {
  const cache = new QueryClient();
  const variants = [{ companyId: 'c1' }, { companyId: 'c2' }, { companyId: 'c1', search: 'motor' }, { companyId: 'c1', qualificationStage: 'win' }];
  variants.forEach((filter, index) => cache.setQueryData(opportunityKeys.list(filter), { result: index }));
  variants.forEach((filter, index) => assert.equal(cache.getQueryData(opportunityKeys.list(filter)).result, index));
  cache.clear();
});
