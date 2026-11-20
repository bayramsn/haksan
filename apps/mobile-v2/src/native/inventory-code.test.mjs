import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInventoryCode } from './inventory-code.ts';

test('ham seri ve SN önekini güvenle çözer', () => {
  assert.equal(parseInventoryCode(' SN: HKS-2026/0042 '), 'HKS-2026/0042');
});

test('URL içinden yalnız serial query değerini alır', () => {
  assert.equal(parseInventoryCode('https://example.test/x?serial=ABC-42&next=https://evil.test'), 'ABC-42');
});

test('serbest URL, kontrol karakteri ve uzun payload reddedilir', () => {
  assert.equal(parseInventoryCode('https://evil.test/path'), null);
  assert.equal(parseInventoryCode('ABC\nDEF'), null);
  assert.equal(parseInventoryCode('A'.repeat(101)), null);
});
