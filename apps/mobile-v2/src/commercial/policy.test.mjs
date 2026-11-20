import test from 'node:test';
import assert from 'node:assert/strict';
import { readPermission, isCommercialLocked, canSharePreparedPdf } from './policy.ts';

test('each document kind requires its own read permission, not generic files access', () => {
  assert.equal(readPermission('quote'), 'quotes.read');
  assert.equal(readPermission('proforma'), 'proformas.read');
  assert.equal(readPermission('contract'), 'contracts.read');
  assert.equal(readPermission('invoice'), 'commercial_invoices.read');
});
test('approved and finalized records lock independently', () => {
  assert.equal(isCommercialLocked(undefined), false);
  assert.equal(isCommercialLocked({ finalizedAt: null, approvedAt: null }), false);
  assert.equal(isCommercialLocked({ approvedAt: '2026-10-22' }), true);
  assert.equal(isCommercialLocked({ finalizedAt: '2026-10-22' }), true);
});
test('only current ready artifacts can be shared; missing, stale and unknown statuses fail closed', () => {
  assert.equal(canSharePreparedPdf('ready'), true);
  for (const state of ['missing', 'outdated', undefined, null, 'generating', {}]) assert.equal(canSharePreparedPdf(state), false);
});
