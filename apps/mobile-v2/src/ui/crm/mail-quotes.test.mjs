import test from 'node:test';
import assert from 'node:assert/strict';
import { addMailQuote, scopedMailQuotes } from './mail-quotes.ts';
import { MAIL_MAX_QUOTES, mailSendSchema } from '@haksan/shared';

const companyId = '10000000-0000-4000-8000-000000000001';
const otherCompanyId = '20000000-0000-4000-8000-000000000001';
const quote = (index, company = companyId) => ({ id: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`, companyId: company, documentNo: `T-${index}`, revisionNo: 1 });

test('mail teklif seçiminde beş teklif sınırı ve tekrar seçim korunur', () => {
  let rows = [];
  for (let index = 1; index <= MAIL_MAX_QUOTES; index++) {
    const result = addMailQuote(rows, quote(index), companyId);
    assert.equal(result.error, null);
    rows = result.rows;
  }
  assert.equal(addMailQuote(rows, quote(1), companyId).rows.length, MAIL_MAX_QUOTES);
  assert.equal(addMailQuote(rows, quote(1), companyId).error, null);
  assert.ok(addMailQuote(rows, quote(6), companyId).error);
  assert.deepEqual(addMailQuote(rows, quote(6), companyId).rows, rows);
});

test('firma değişince önceki teklif ekleri gönderime taşınmaz; yanlış firma reddedilir', () => {
  const previous = [quote(1), quote(2)];
  assert.deepEqual(scopedMailQuotes(otherCompanyId, previous), []);
  assert.deepEqual(scopedMailQuotes(undefined, previous), []);
  assert.ok(addMailQuote([], quote(1, otherCompanyId), companyId).error);
  assert.ok(addMailQuote([], quote(1), undefined).error);
  assert.deepEqual(addMailQuote(previous, quote(3, otherCompanyId), otherCompanyId).rows, [quote(3, otherCompanyId)]);
});

test('başlangıç ve seçimde aynı teklif bir kez gönderilir; sunucu PDF sözleşmesi HTML istemez', () => {
  const selected = scopedMailQuotes(companyId, [quote(1), quote(1), quote(2)]);
  assert.equal(selected.length, 2);
  const input = mailSendSchema.parse({ to: 'test@example.com', subject: 'Teklifler', body: 'İncelemeniz için.', companyId, quotes: selected.map(({ id }) => ({ id })) });
  assert.deepEqual(input.quotes, [{ id: quote(1).id }, { id: quote(2).id }]);
});
