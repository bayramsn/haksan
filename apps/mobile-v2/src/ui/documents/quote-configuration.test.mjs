import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteOptionSnapshot, validateQuoteConfigurations, removeQuoteOption, updateQuotedTechnicalSpecs } from './quote-configuration.ts';
const set = { id: 'set', name: 'Güç', configurationKind: 'power', values: [{ id: 'v', value: '6 kW', priceDelta: '0', currencyCode: 'USD' }] };
const item = () => ({ productModelId: 'product', selectedProductOptions: [quoteOptionSnapshot(set, 'v', 'USD')], optionChildren: [{ key: 'child', optionSetId: 'set' }], configurationChanged: true });
test('zero price is explicit and allowed, missing price/currency are not invented', () => {
  assert.equal(quoteOptionSnapshot(set, 'v', 'USD').priceDelta, 0);
  for (const patch of [{ priceDelta: null }, { priceDelta: 'NaN' }, { currencyCode: null }, { currencyCode: 'EUR' }]) assert.throws(() => quoteOptionSnapshot({ ...set, values: [{ ...set.values[0], ...patch }] }, 'v', 'USD'));
});
test('requires required selections and rejects stale option prices before writes', async () => {
  await validateQuoteConfigurations([item()], 'USD', async () => ({ sets: [set] }));
  await assert.rejects(validateQuoteConfigurations([{ ...item(), selectedProductOptions: [] }], 'USD', async () => ({ sets: [set] })));
  await assert.rejects(validateQuoteConfigurations([item()], 'USD', async () => ({ sets: [{ ...set, values: [{ ...set.values[0], priceDelta: '20' }] }] })));
});
test('unchanged saved quote snapshot bypasses current catalog validation', async () => {
  await validateQuoteConfigurations([{ ...item(), itemId: 'saved', configurationChanged: false }], 'EUR', async () => { throw new Error('must not load'); });
});
test('deleting catalog option removes matching selection and invalidates snapshot', () => {
  const patch = removeQuoteOption(item(), 'child');
  assert.deepEqual(patch.optionChildren, []);
  assert.deepEqual(patch.selectedProductOptions, []);
  assert.equal(patch.technicalConfiguration, null);
});
test('edited technical specs update document snapshot while retaining metadata', () => {
  const patch = updateQuotedTechnicalSpecs({ technicalConfiguration: { selection: { powerKw: 6 }, specs: [{ key: 'X', value: '1', unit: 'mm', groupCode: 'axes' }] } }, [{ key: 'X', value: '2', unit: 'mm' }]);
  assert.equal(patch.technicalConfiguration.specs[0].isManual, true);
  assert.equal(patch.technicalConfiguration.specs[0].groupCode, 'axes');
  assert.equal(patch.technicalConfiguration.specs[0].value, '2');
});
