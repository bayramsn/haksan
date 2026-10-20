import { describe, expect, it } from 'vitest';
import type { QuoteItemCompatibility } from '@haksan/shared';
import { validateConfigurationPrice } from '../src/modules/quotes/quote-product-options';

const base: QuoteItemCompatibility = { machineIds: [], brands: [], controlUnits: [], supplierIds: [], technicalSpecs: [] };
const matrix = [
  { sourceModelCode: 'V12-65', powerKw: 3, salePrice: '30000.0000', currencyCode: 'USD' },
  { sourceModelCode: 'V12-65', powerKw: 1.5, salePrice: null, currencyCode: null },
];
const chosen = [{ configurationKind: 'table', sourceModelCode: 'V12-65', powerKw: null }, { configurationKind: 'power', sourceModelCode: null, powerKw: '3.0' }];
const request = (salePrice = 30000, powerKw = 3, currencyCode = 'USD') => ({ ...base, configurationPrice: { sourceModelCode: 'V12-65', powerKw, salePrice, currencyCode } });

describe('quote model × power price', () => {
  it('writes the matrix price back as the authoritative snapshot', () => {
    expect(validateConfigurationPrice(request(), matrix, chosen).configurationPrice).toEqual({ sourceModelCode: 'V12-65', powerKw: 3, salePrice: 30000, currencyCode: 'USD' });
  });

  it('leaves manually priced lines without a configuration price', () => {
    expect(validateConfigurationPrice(base, matrix, chosen).configurationPrice).toBeNull();
  });

  it('rejects stale, unpriced, foreign-currency and mismatched selections', () => {
    expect(() => validateConfigurationPrice(request(29000), matrix, chosen)).toThrow('Model fiyatı değişti');
    expect(() => validateConfigurationPrice(request(30000, 3, 'EUR'), matrix, chosen)).toThrow('Model fiyatı değişti');
    expect(() => validateConfigurationPrice(request(1, 1.5), matrix, chosen)).toThrow('satış fiyatı tanımlı değil');
    expect(() => validateConfigurationPrice(request(30000, 6), matrix, chosen)).toThrow('satış fiyatı tanımlı değil');
    expect(() => validateConfigurationPrice(request(), matrix, [{ configurationKind: 'table', sourceModelCode: 'V24-65', powerKw: null }])).toThrow('eşleşmiyor');
    expect(() => validateConfigurationPrice(request(), [], chosen)).toThrow('tanımlı değil');
  });
});
