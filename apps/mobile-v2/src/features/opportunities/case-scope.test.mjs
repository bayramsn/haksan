import assert from 'node:assert/strict';
import test from 'node:test';
import {
  firstParam,
  matchesOpportunityOrCompany,
  receivableBelongsToOpportunity,
} from './case-scope.ts';

/** Under test: case-scope.ts (sales-case list filters). Existing sibling: linked-operations.test.mjs. */

test('receivableBelongsToOpportunity matches quoteId first', () => {
  assert.equal(
    receivableBelongsToOpportunity(
      { id: '1', companyId: 'c1', quoteId: 'q1', invoiceNo: null, movementType: 'expected', paymentMethod: null, documentRef: null, amount: '1', dueDate: '2026-01-01', notes: null, company: { id: 'c1', legalTitle: 'A', shortName: null, externalCompanyNo: null }, status: null, currency: null },
      new Set(['q1']),
    ),
    true,
  );
  assert.equal(
    receivableBelongsToOpportunity(
      { id: '1', companyId: 'c1', quoteId: 'q2', invoiceNo: null, movementType: 'expected', paymentMethod: null, documentRef: null, amount: '1', dueDate: '2026-01-01', notes: null, company: { id: 'c1', legalTitle: 'A', shortName: null, externalCompanyNo: null }, status: null, currency: null },
      new Set(['q1']),
    ),
    false,
  );
});

test('receivableBelongsToOpportunity soft-matches note hint without quoteId', () => {
  assert.equal(
    receivableBelongsToOpportunity(
      { id: '1', companyId: 'c1', quoteId: null, invoiceNo: null, movementType: 'expected', paymentMethod: null, documentRef: null, amount: '1', dueDate: '2026-01-01', notes: 'Vadeli 1/3 - Laser Case', company: { id: 'c1', legalTitle: 'A', shortName: null, externalCompanyNo: null }, status: null, currency: null },
      new Set(),
      { companyId: 'c1', titleHint: 'Laser Case' },
    ),
    true,
  );
});

test('matchesOpportunityOrCompany prefers opportunityId', () => {
  assert.equal(matchesOpportunityOrCompany({ opportunityId: 'o1', companyId: 'c1' }, { opportunityId: 'o1' }), true);
  assert.equal(matchesOpportunityOrCompany({ opportunityId: 'o2', companyId: 'c1' }, { opportunityId: 'o1', companyId: 'c1' }), false);
  assert.equal(matchesOpportunityOrCompany({ opportunityId: null, companyId: 'c1' }, { companyId: 'c1' }), true);
});

test('firstParam flattens expo-router arrays', () => {
  assert.equal(firstParam(['a', 'b']), 'a');
  assert.equal(firstParam('x'), 'x');
  assert.equal(firstParam(undefined), '');
});
