import assert from 'node:assert/strict';
import test from 'node:test';
import { serverMessage } from './serverMessage.ts';

test('iç içe hata zarfından mesajı çıkarır', () => {
  const body = {
    error: { code: 'UNAUTHORIZED', message: 'E-posta veya şifre hatalı', requestId: 'x' },
  };
  assert.equal(serverMessage(body), 'E-posta veya şifre hatalı');
});

test('düz message alanı da kabul edilir', () => {
  assert.equal(serverMessage({ message: 'Eski biçim' }), 'Eski biçim');
});

test('iç içe olan düz olana tercih edilir', () => {
  assert.equal(serverMessage({ message: 'düz', error: { message: 'iç' } }), 'iç');
});

test('mesaj yoksa null döner, çağıran genel metne düşer', () => {
  assert.equal(serverMessage(null), null);
  assert.equal(serverMessage('düz metin'), null);
  assert.equal(serverMessage({ error: { code: 'X' } }), null);
  assert.equal(serverMessage({ error: { message: '' } }), null);
});
