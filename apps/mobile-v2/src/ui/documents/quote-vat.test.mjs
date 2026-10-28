import assert from 'node:assert/strict';
import test from 'node:test';
import { effectiveQuoteVat } from './quote-vat.ts';
import { parseQuoteItems } from './quote-logic.ts';

const line = () => ({ key: 'm1', description: 'Tezgah', quantity: '1', unitPrice: '100', discount: '', discountType: 'amount', vatRate: '20', nationalized: false, lineGroupKey: 'group1', selectedProductOptions: [], technicalSpecs: [], technicalConfiguration: null, compatibilityFilters: { machineIds: [], brands: [], controlUnits: [], supplierIds: [] }, optionChildren: [{ key: 'opt1', description: 'Donanım', quantity: '1', unitPrice: '10', discount: '', discountType: 'amount', vatRate: '10' }], configurationChanged: false });

test('VAT calculation disabled saves both machine and optional equipment with zero tax', () => {
  const draft = [line()];
  const parsed = parseQuoteItems(effectiveQuoteVat(draft, false));
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.items.map((item) => item.vatRate), [0, 0]);
  assert.equal(draft[0].vatRate, '20');
  assert.equal(draft[0].optionChildren[0].vatRate, '10');
});
test('reenabling VAT preserves separate rates and all net line values', () => {
  const draft = [line()];
  effectiveQuoteVat(draft, false);
  const parsed = parseQuoteItems(effectiveQuoteVat(draft, true));
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.items.map((item) => [item.unitPrice, item.vatRate]), [[100, 20], [10, 10]]);
});
