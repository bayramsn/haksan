import { describe, expect, it } from 'vitest';
import { quoteItemCompatibilitySchema, resolveLaserProfile } from '@haksan/shared';
import { QuotesService } from '../src/modules/quotes/quotes.service';

const selection = { productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', sourceModelCode: 'F3015', powerKw: 3, cabinType: 'open' } as const;
const saved = () => quoteItemCompatibilitySchema.parse({
  selectedProductOptions: [{ optionSetId: '00000000-0000-4000-8000-000000000001', optionValueId: '00000000-0000-4000-8000-000000000002', name: 'Tabla', value: '3000 × 1500', priceDelta: 100, currencyCode: 'USD' }],
  technicalConfiguration: resolveLaserProfile(selection),
});
describe('historical quote option updates', () => {
  it('retains original option names/prices without querying the edited or archived catalog', async () => {
    const service = new QuotesService({} as never, {} as never, {} as never, {} as never) as any;
    const original = saved();
    const input = saved(); input.selectedProductOptions![0].priceDelta = 200;
    const result = await service.productOptionSnapshot(input, null, {}, original);
    expect(result.selectedProductOptions).toEqual(original.selectedProductOptions);
  });
  it('rejects another table profile submitted with unchanged option identities', async () => {
    const service = new QuotesService({} as never, {} as never, {} as never, {} as never) as any;
    const input = saved(); input.technicalConfiguration = resolveLaserProfile({ ...selection, sourceModelCode: 'F4020' });
    await expect(service.productOptionSnapshot(input, null, {}, saved())).rejects.toThrow('baz model seçin');
  });
  it('allows historic pre-option offers to retain their original profile', async () => {
    const service = new QuotesService({} as never, {} as never, {} as never, {} as never) as any;
    const original = quoteItemCompatibilitySchema.parse({ technicalConfiguration: resolveLaserProfile(selection) });
    expect(await service.productOptionSnapshot(original, null, {}, original)).toEqual(original);
  });
});
