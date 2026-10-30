import test from 'node:test';
import assert from 'node:assert/strict';
import { hasProductPrice, productPriceLabel } from './product-price.ts';
test('catalog prices distinguish missing values from explicit zero and preserve currency', () => {
  for (const value of [null, undefined, '', ' ', 'invalid', -1]) assert.equal(hasProductPrice(value), false);
  for (const value of [0, '0', '0.00', '1250.50']) assert.equal(hasProductPrice(value), true);
  assert.equal(productPriceLabel(null, 'USD'), 'Fiyat girilmemiş');
  assert.equal(productPriceLabel(0, 'EUR'), '0,00 EUR');
  assert.equal(productPriceLabel('1250.5', 'USD'), '1.250,50 USD');
  assert.match(productPriceLabel(10), /para birimi belirtilmemiş/);
});
