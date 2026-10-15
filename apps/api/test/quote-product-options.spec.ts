import { describe, expect, it } from 'vitest';
import { quoteItemCompatibilitySchema, resolveLaserProfile } from '@haksan/shared';
import { sameOptionSelection, snapshotProductOptions, type CatalogOptionRow } from '../src/modules/quotes/quote-product-options';
import { quoteLaserSnapshot } from '../src/modules/quotes/quote-laser-snapshot';

const setId = '00000000-0000-4000-8000-000000000001';
const valueId = '00000000-0000-4000-8000-000000000002';
const row: CatalogOptionRow = {
  optionSetId: setId, optionValueId: valueId, name: 'Tabla', value: '3000 × 1500 mm',
  priceDelta: '1250.0000', currencyCode: 'USD', configurationKind: 'table',
  sourceModelCode: 'F3015', powerKw: null, cabinType: null,
};
const selected = () => quoteItemCompatibilitySchema.parse({ selectedProductOptions: [{
  optionSetId: setId, optionValueId: valueId, name: 'Sahte ad', value: 'Sahte değer', priceDelta: 1250, currencyCode: 'USD',
}] });
const base = { series: 'F', productTypeCode: 'FIBER_LAZER_KESIM', sourceModelCodes: ['F3015', 'F4020'] };

describe('quote configuration snapshots', () => {
  it('snapshots catalog prices and labels rather than client supplied values', () => {
    const result = snapshotProductOptions(selected(), [row], [setId], base);
    expect(result.selectedProductOptions?.[0]).toEqual({ optionSetId: setId, optionValueId: valueId,
      name: 'Tabla', value: '3000 × 1500 mm', priceDelta: 1250, currencyCode: 'USD' });
    row.value = '3000 × 1500 mm';
    expect(result.selectedProductOptions?.[0].value).toBe('3000 × 1500 mm');
  });
  it('rejects options omitted from the scoped model catalog', () => {
    expect(() => snapshotProductOptions(selected(), [], [], base)).toThrow('bu baz modele ait değil');
  });
  it('requires one choice per configuration group', () => {
    expect(() => snapshotProductOptions(quoteItemCompatibilitySchema.parse({}), [row], [setId], base)).toThrow('seçeneklerini tamamlayın');
    const duplicate = selected();
    duplicate.selectedProductOptions!.push(duplicate.selectedProductOptions![0]);
    expect(() => snapshotProductOptions(duplicate, [row])).toThrow('yalnız bir');
  });
  it('does not interpret an unpriced imported option as a free option', () => {
    expect(() => snapshotProductOptions(selected(), [{ ...row, priceDelta: null }])).toThrow('ek fiyatını');
    const free = selected(); free.selectedProductOptions![0].priceDelta = 0;
    expect(snapshotProductOptions(free, [{ ...row, priceDelta: '0' }]).selectedProductOptions?.[0].priceDelta).toBe(0);
  });
  it('rejects a catalog price or currency change after the client selected an option', () => {
    expect(() => snapshotProductOptions(selected(), [{ ...row, priceDelta: '1500' }])).toThrow('güncel seçeneği');
    expect(() => snapshotProductOptions(selected(), [{ ...row, currencyCode: 'EUR' }])).toThrow('güncel seçeneği');
  });
  it('rejects a concrete profile that differs from the selected table', () => {
    const input = selected();
    input.technicalConfiguration = resolveLaserProfile({ productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', sourceModelCode: 'F4020', powerKw: 3, cabinType: 'open' });
    expect(() => snapshotProductOptions(input, [row], [setId], base)).toThrow('eşleşmiyor');
  });
  it('rejects a profile from another commercial family', () => {
    const input = selected();
    input.technicalConfiguration = resolveLaserProfile({ productTypeCode: 'FIBER_LAZER_KESIM', series: 'H', sourceModelCode: 'H3015', powerKw: 6, cabinType: 'closed' });
    expect(() => snapshotProductOptions(input, [row], [], base)).toThrow('ailesiyle');
  });
  it('allows explicitly priced custom choices with manual specs without fabricating a source profile', () => {
    const input = selected();
    input.technicalSpecs = [{ key: 'Çalışma Alanı', value: '3500 × 1700', unit: 'mm' }];
    const result = snapshotProductOptions(input, [{ ...row, sourceModelCode: null, value: '3500 × 1700 mm' }], [setId], base);
    expect(result.technicalConfiguration).toBeUndefined();
    expect(result.technicalSpecs).toEqual(input.technicalSpecs);
  });
  it('recognizes unchanged selections independently of presentation or price edits', () => {
    const old = selected().selectedProductOptions!;
    const changedLabels = old.map((option) => ({ ...option, value: 'Yenilendi', priceDelta: 9900 }));
    expect(sameOptionSelection(old, changedLabels)).toBe(true);
    expect(sameOptionSelection(old, [])).toBe(false);
    expect(sameOptionSelection(undefined, [])).toBe(true);
  });
  it('clears an old resolved profile when the user switches to a custom manual choice', () => {
    const original = resolveLaserProfile({ productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', sourceModelCode: 'F3015', powerKw: 3, cabinType: 'open' });
    const input = selected();
    input.technicalConfiguration = null;
    input.technicalSpecs = [{ key: 'Tabla', value: 'Özel ölçü' }];
    const snapshot = quoteLaserSnapshot(input, original)!;
    expect(snapshot.technicalConfiguration).toBeNull();
    expect(snapshot.technicalSpecs).toEqual(input.technicalSpecs);
  });
});
