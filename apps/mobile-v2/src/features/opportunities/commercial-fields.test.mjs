import assert from 'node:assert/strict';
import test from 'node:test';
import { opportunityEstimate } from './commercial-fields.ts';

test('clearing a previously saved opportunity estimate sends zero rather than retaining the old value', () => {
  assert.equal(opportunityEstimate(''), 0);
  assert.equal(opportunityEstimate('   '), 0);
});
test('opportunity estimate accepts numeric and Turkish decimal values, rejects invalid and negative amounts', () => {
  assert.equal(opportunityEstimate('1200.50'), 1200.5);
  assert.equal(opportunityEstimate('1200,50'), 1200.5);
  for (const value of ['-1', 'abc', 'Infinity', '1,2,3']) assert.equal(opportunityEstimate(value), null);
});
