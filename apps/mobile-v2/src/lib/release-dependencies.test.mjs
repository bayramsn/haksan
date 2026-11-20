import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';
import { z } from 'zod';
import './zodTr.ts';

const require = createRequire(import.meta.url);
const routerRequire = createRequire(require.resolve('expo-router/package.json'));
const query = routerRequire('query-string');
const shared = require('@haksan/shared');

test('PATCH schemas omit absent fields instead of resetting create defaults', () => {
  const schema = shared.partialWithoutDefaults(z.object({
    text: z.string().default('default'),
    amount: z.number().default(10),
    enabled: z.boolean().default(true),
    nullable: z.string().nullable().default('default'),
  }));
  assert.deepEqual(schema.parse({}), {});
  assert.deepEqual(schema.parse({ amount: 0, enabled: false, text: '', nullable: null }),
    { amount: 0, enabled: false, text: '', nullable: null });
  let checked = 0;
  for (const [name, value] of Object.entries(shared)) {
    if (!name.endsWith('UpdateSchema') || typeof value?.safeParse !== 'function') continue;
    const result = value.safeParse({});
    if (result.success) {
      assert.deepEqual(result.data, {}, `${name} must preserve PATCH omission`);
      checked++;
    }
  }
  assert.ok(checked >= 20);
});

test('patched Router decoder preserves Unicode, arrays and malformed query values', () => {
  const value = { name: 'İstanbul', tag: ['a', 'b'], blank: '' };
  assert.deepEqual({ ...query.parse(query.stringify(value)) }, value);
  assert.deepEqual({ ...query.parse('tag=a&tag=b&bad=%ZZ') }, { tag: ['a', 'b'], bad: '%ZZ' });
  const input = `${'%41'.repeat(32_000)}%zz`;
  const start = performance.now();
  assert.equal(query.parse(`x=${input}`).x, `${'A'.repeat(32_000)}%zz`);
  assert.ok(performance.now() - start < 1000, 'malformed decoding must remain bounded');
});

test('Zod 4 retains Turkish form messages and explicit schema messages', () => {
  assert.equal(z.string().min(1).safeParse('').error.issues[0].message, 'Bu alan zorunludur.');
  assert.equal(z.string().safeParse(undefined).error.issues[0].message, 'Bu alan zorunludur.');
  assert.equal(z.string().email().safeParse('bad').error.issues[0].message, 'Geçerli bir e-posta adresi girin.');
  assert.equal(z.enum(['a', 'b']).safeParse('c').error.issues[0].message, 'Listeden bir seçenek seçin.');
  assert.equal(z.string().min(3, 'Özel mesaj').safeParse('').error.issues[0].message, 'Özel mesaj');
  assert.deepEqual(z.record(z.string(), z.unknown()).parse({ city: 'İstanbul' }), { city: 'İstanbul' });
});

test('patched image parser handles PNG buffers and rejects invalid ICNS blocks', () => {
  const { imageSize } = require('image-size');
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
  assert.deepEqual(imageSize(png), { height: 1, width: 1, type: 'png' });
  const malformed = Buffer.from('69636e73000000107465737400000000', 'hex');
  assert.throws(() => imageSize(malformed));
});

test('Metro reads image filenames through the patched image-size API', async () => {
  const routerDir = path.dirname(require.resolve('expo-router/package.json'));
  const metroDir = path.dirname(routerRequire.resolve('metro/package.json'));
  const { getAssetData } = require(path.join(metroDir, 'src/Assets.js'));
  const asset = await getAssetData(path.join(routerDir, 'assets/unmatched.png'), 'unmatched.png', [], 'android', '/assets');
  assert.ok(asset.width > 0 && asset.height > 0);
});
