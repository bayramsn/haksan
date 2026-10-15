import { describe, expect, it } from 'vitest';
import { productMatchesQuoteDivision } from './quoteCatalogScope';
describe('quote division catalog', () => {
  it('keeps CNC machines and excludes sheet machines despite matching division data', () => {
    expect(productMatchesQuoteDivision({ productGroupCode: 'CNC' }, 'CNC', 'cnc')).toBe(true);
    expect(productMatchesQuoteDivision({ productGroupCode: 'SAC_ISLEME', divisionId: 'cnc' }, 'CNC', 'cnc')).toBe(false);
  });
  it('requires ownership or explicit known compatibility for auxiliary equipment', () => {
    expect(productMatchesQuoteDivision({ productGroupCode: 'HAVA' }, 'CNC', 'cnc')).toBe(false);
    expect(productMatchesQuoteDivision({ productGroupCode: 'AKSESUAR', divisionId: 'cnc' }, 'CNC', 'cnc')).toBe(true);
    expect(productMatchesQuoteDivision({ productGroupCode: 'AKSESUAR', compatibleMachineTypeCode: 'CNC_TORNA' }, 'CNC', 'cnc')).toBe(true);
    expect(productMatchesQuoteDivision({ compatibleMachineTypeCode: 'unknown' }, 'CNC', 'cnc')).toBe(false);
  });
  it('leaves all divisions view available', () => {
    expect(productMatchesQuoteDivision({ productGroupCode: 'SAC_ISLEME' }, '')).toBe(true);
  });
});
