import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMediaUrl } from './mediaUrl.ts';

const BASE = 'https://crm.example.com/api/v1';

test('göreli medya yolu API tabanıyla birleşir', () => {
  assert.equal(resolveMediaUrl('/products/media/abc', BASE), 'https://crm.example.com/api/v1/products/media/abc');
});

test('sürümlü yol yalnız origin ile birleşir (yol iki kez yazılmaz)', () => {
  assert.equal(resolveMediaUrl('/api/v1/companies/media/xyz', BASE), 'https://crm.example.com/api/v1/companies/media/xyz');
});

test('mutlak ve gömülü değerler olduğu gibi kalır', () => {
  assert.equal(resolveMediaUrl('https://cdn.example.com/a.png', BASE), 'https://cdn.example.com/a.png');
  assert.equal(resolveMediaUrl('data:image/png;base64,AAA', BASE), 'data:image/png;base64,AAA');
});

test('boş değer null döner; sondaki eğik çizgi çiftlenmez', () => {
  assert.equal(resolveMediaUrl(null, BASE), null);
  assert.equal(resolveMediaUrl('   ', BASE), null);
  assert.equal(resolveMediaUrl('/x.png', 'https://crm.example.com/api/v1/'), 'https://crm.example.com/api/v1/x.png');
});
