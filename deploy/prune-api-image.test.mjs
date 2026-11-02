import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reachable, resolve } from './prune-api-image.mjs';

const packages = {
  '': { dependencies: { root: '1' } },
  'apps/api': { dependencies: { a: '1', '@haksan/shared': '*' } },
  'apps/mobile-v2': { dependencies: { expo: '1' } },
  'node_modules/@haksan/shared': { link: true, resolved: 'packages/shared' },
  'packages/shared': { dependencies: { zod: '3' } },
  'node_modules/root': {},
  'node_modules/a': { dependencies: { b: '2' }, peerDependencies: { p: '1', opt: '1' }, peerDependenciesMeta: { opt: { optional: true } } },
  'node_modules/a/node_modules/b': { dependencies: { c: '1' } },
  'node_modules/b': {},
  'node_modules/c': {},
  'node_modules/p': {},
  'node_modules/opt': {},
  'node_modules/zod': {},
  'node_modules/expo': { dependencies: { c: '1' } },
};

test('iç içe paket önce kendi node_modules, sonra üst dizinler aranır', () => {
  assert.equal(resolve(packages, 'node_modules/a', 'b'), 'node_modules/a/node_modules/b');
  assert.equal(resolve(packages, 'node_modules/a/node_modules/b', 'c'), 'node_modules/c');
  assert.equal(resolve(packages, 'apps/api', 'a'), 'node_modules/a');
  assert.equal(resolve(packages, 'apps/api', 'yok'), null);
});

test('API ağacı tutulur; mobile-v2, hoist edilmiş kopya ve opsiyonel peer silinir', () => {
  const keep = reachable(packages, ['', 'apps/api', 'packages/shared']);
  for (const k of ['node_modules/root', 'node_modules/a', 'node_modules/a/node_modules/b', 'node_modules/c', 'node_modules/p', 'node_modules/zod']) assert.ok(keep.has(k), k);
  for (const k of ['node_modules/expo', 'node_modules/b', 'node_modules/opt']) assert.ok(!keep.has(k), k);
});
