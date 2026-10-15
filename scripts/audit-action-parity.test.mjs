import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRequestCalls } from './audit-action-parity.mjs';

const SRC = `
export const companies = {
  list: (q: Q) => request<Paginated<C>>('/companies', { query: q }),
  get: (id: string) => request<C>(\`/companies/\${id}\`),
  create: (body: X) => request<C>('/companies', { method: 'POST', body }),
  setStatus: (id: string, body: Y) =>
    request<C>(\`/companies/\${id}/status\`, {
      method: 'PATCH',
      body,
    }),
  remove: (id: string) => request<void>(\`/companies/\${id}\`, { method: 'DELETE' }),
  bySerial: (s: string) => request<I>(\`/inventory/serial/\${encodeURIComponent(s)}\`),
};
`;

test('request() çağrılarından metot + normalize yol çıkarır', () => {
  assert.deepEqual(parseRequestCalls(SRC), [
    { verb: 'GET', path: '/companies' },
    { verb: 'GET', path: '/companies/:param' },
    { verb: 'POST', path: '/companies' },
    { verb: 'PATCH', path: '/companies/:param/status' },
    { verb: 'DELETE', path: '/companies/:param' },
    { verb: 'GET', path: '/inventory/serial/:param' },
  ]);
});

test('fonksiyon tanımını (request<T>(path: string…) çağrı saymaz', () => {
  assert.deepEqual(parseRequestCalls('export async function request<T>(path: string, opts = {}) {}'), []);
});

test('iç içe çağrıdaki method anahtarı dış çağrıya karışmaz', () => {
  const src = "a: () => request('/x', { body: build({ method: 'POST' }), meta: { method: 'DELETE' } }),";
  assert.deepEqual(parseRequestCalls(src), [{ verb: 'GET', path: '/x' }]);
});
