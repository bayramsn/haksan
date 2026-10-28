import test from 'node:test';
import assert from 'node:assert/strict';
import { openQuoteTotals, formatCurrencyAmounts } from './company-finance.ts';

test('company open quotes retain separate USD/EUR totals and exclude closed quotes', () => {
  const quote = (amount, code, status = 'sent') => ({ grandTotal: amount, currency: { code }, status: { code: status } });
  const result = openQuoteTotals([quote('100', 'USD'), quote('25', 'usd'), quote('50', 'EUR'), quote('900', 'USD', 'approved'), quote('NaN', 'TRY'), quote('10', 'EUR', 'cancelled')]);
  assert.deepEqual(result, [{ currencyCode: 'USD', amount: 125 }, { currencyCode: 'EUR', amount: 50 }]);
  assert.equal(formatCurrencyAmounts(result, (value, code) => `${value} ${code}`), '125 USD · 50 EUR');
});

test('missing currency is displayed honestly and an empty dataset is not converted to a guessed currency', () => {
  const result = openQuoteTotals([{ grandTotal: '100', currency: null }]);
  assert.equal(result[0].currencyCode, '—');
  assert.match(formatCurrencyAmounts(result, () => { throw Error('must not guess'); }), /para birimi belirtilmedi/);
  assert.equal(formatCurrencyAmounts([], () => ''), '—');
});
