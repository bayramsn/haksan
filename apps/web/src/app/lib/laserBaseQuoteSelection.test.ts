import { describe, expect, it } from 'vitest';
import { HEX2026_REVISION, HEX2026_SERIES } from '@haksan/shared';
import { hexConfigurationQuoteSpecs, laserBaseQuoteContext } from './laserBaseQuoteSelection';
import type { LaserBaseConfiguration } from './mock';
import type { ConfigurationSet, SelectedProductOption } from '../components/technical/ProductConfigurationOptions';
const sourceModelCode = HEX2026_SERIES.find(row => row.series === 'F')!.configurations[0]!.sourceModelCode;
const base: LaserBaseConfiguration = { familyCode: 'F', series: 'F', productTypeCode: 'FIBER_LAZER_KESIM', sourceModelCodes: [sourceModelCode], sourceRevision: HEX2026_REVISION };
const sets: ConfigurationSet[] = [{ id: 'table', name: 'Tabla', configurationKind: 'table', values: [{ id: 'size', value: 'Ölçü', priceDelta: '0', currencyCode: 'USD', sourceModelCode }] }];
const selected: SelectedProductOption[] = [{ optionSetId: 'table', optionValueId: 'size', name: 'Tabla', value: 'Ölçü', priceDelta: '0', currencyCode: 'USD' }];
describe('HEX source quote routing', () => {
  it('uses the exact PDF configuration and verified standard cabin without an optional cabin set', () => {
    const context = laserBaseQuoteContext(base, sets, selected);
    expect(context.configuration?.sourceModelCode).toBe(sourceModelCode);
    expect(context.cabinType).toBe('open');
  });
  it('never substitutes the standard cabin for a missing cabin choice', () => {
    expect(laserBaseQuoteContext(base, [...sets, { id: 'cabin', name: 'Kabin', configurationKind: 'cabin', values: [] }], selected).cabinType).toBeNull();
  });
  it('rejects a model from another series instead of silently using the legacy profile', () => {
    expect(() => laserBaseQuoteContext(base, [{ ...sets[0], values: [{ ...sets[0].values[0], sourceModelCode: 'PG3015' }] }], selected)).toThrow(/eşleşmiyor/);
  });
  it('keeps a custom size in explicit manual mode', () => {
    const context = laserBaseQuoteContext(base, [{ ...sets[0], values: [{ ...sets[0].values[0], sourceModelCode: null }] }], selected);
    expect(context.configuration).toBeUndefined();
    expect(context.table?.sourceModelCode).toBeNull();
  });
  it('does not invent cabin data for legacy bases', () => {
    expect(laserBaseQuoteContext({ ...base, sourceRevision: undefined }, sets, selected).cabinType).toBeNull();
  });
});

describe("hexConfigurationQuoteSpecs", () => {
  const configuration = { fields: [
    { key: "Lazer Gücü", rawValue: "1,5-12 kW", verification: "aore_excel" },
    { key: "Maksimum Boru İşleme Uzunluğu", rawValue: "6500mm", verification: "aore_excel" },
    { key: "Toplam Güç Gereksinimi", rawValue: "1,5 kW: 12.85kW/20kVA\n3 kW: 15.75kW/20kVA", verification: "aore_excel" },
    { key: "Trafo Kapasitesi", rawValue: "6 kW: 50kVA", verification: "aore_excel" },
    { key: "Taslak Alan", rawValue: "x", verification: "needs_review" },
  ] };
  it("seçilen gücün satırını alır, başka gücün değerini ve doğrulanmamış alanı basmaz", () => {
    expect(hexConfigurationQuoteSpecs(configuration, 3)).toEqual([
      { key: "Maksimum Boru İşleme Uzunluğu", value: "6500mm" },
      { key: "Toplam Güç Gereksinimi", value: "15.75kW/20kVA" },
      { key: "Lazer Gücü", value: "3 kW" },
    ]);
  });
});
