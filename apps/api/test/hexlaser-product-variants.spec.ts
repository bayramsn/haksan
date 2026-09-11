import { describe, expect, it } from 'vitest';
import { LASER_MODELS, resolveLaserProfile } from '@haksan/shared';
import {
  canonicalLaserVariantSelection,
  hexlaserCuttingVariants,
  hexlaserLegacyVariantCode,
  hexlaserVariantCode,
  hexlaserVariantFullName,
} from '../src/db/hexlaser-product-variants';

describe('HEXLASER sellable product variants', () => {
  it('creates exactly one product per source model', () => {
    const variants = hexlaserCuttingVariants();
    expect(variants).toHaveLength(LASER_MODELS.length);
    expect(new Set(variants.map((variant) => variant.modelCode)).size).toBe(variants.length);
    for (const variant of variants) {
      for (const key of ['Toplam Güç Gereksinimi', 'Trafo Kapasitesi', 'Kontrol Ünitesi', 'Kesme Kafası']) {
        const value = variant.configuration.specs.find((spec) => spec.key === key)?.value ?? '';
        expect(value, `${variant.modelCode} / ${key}`).not.toMatch(/\n/);
        expect(value, `${variant.modelCode} / ${key}`).not.toMatch(/(?:^|\s)(?:≤|≥|<|>)?\d+(?:[.,-]\d+)?\s*kW\s*[:：]/i);
      }
    }
  });

  it('gives every PG3015 power the same card code so the catalog stays one card per model', () => {
    const selections = [1.5, 3] as const;
    const variants = hexlaserCuttingVariants(selections.map((powerKw) => resolveLaserProfile({
      productTypeCode: 'FIBER_LAZER_KESIM', series: 'PG', sourceModelCode: 'PG3015', cabinType: 'closed', powerKw,
    })));

    expect(variants.map((variant) => variant.modelCode)).toEqual(['PG3015', 'PG3015']);
    expect(variants.map((variant) => variant.fullName)).toEqual([
      'PG3015 Sac Lazer Kesim',
      'PG3015 Sac Lazer Kesim',
    ]);
    for (const variant of variants) {
      expect(variant.configuration.specs.find((spec) => spec.key === 'Lazer Gücü')).toMatchObject({
        value: String(variant.configuration.selection.powerKw), unit: 'kW',
      });
      expect(variant.configuration.specs.find((spec) => spec.key === 'Toplam Güç Gereksinimi')?.value).not.toMatch(/\n|\b6\s*kW\s*:/i);
      expect(variant.configuration.specs.find((spec) => spec.key === 'Trafo Kapasitesi')?.value).not.toMatch(/\n|\b6\s*kW\s*:/i);
      expect(variant.configuration.specs.find((spec) => spec.key === 'Kontrol Ünitesi')?.value).not.toMatch(/\n|\b6\s*kW\s*:/i);
      expect(variant.configuration.specs.find((spec) => spec.key === 'Kesme Kafası')?.value).not.toMatch(/\n|\b6\s*kW\s*:/i);
    }
  });

  it('uses the catalog cabin and first supported power when migrating an old model product', () => {
    const model = LASER_MODELS.find((item) => item.code === 'PG3015')!;
    const selection = canonicalLaserVariantSelection(model);
    expect(selection).toMatchObject({ sourceModelCode: 'PG3015', cabinType: 'closed', powerKw: 1.5 });
    expect(hexlaserVariantCode(selection)).toBe('PG3015');
    expect(hexlaserVariantFullName(selection)).toBe('PG3015 Sac Lazer Kesim');
  });

  it('recognises the old cabin/power cards that get merged into the model card', () => {
    for (const legacy of ['PG3015-KAPALI-1.5KW', 'PG3015-ACIK-12KW', 'F3015+T6-230-ACIK-6KW']) {
      const model = LASER_MODELS.find((item) => legacy.startsWith(`${item.code}-`))!;
      expect(hexlaserLegacyVariantCode(model.code, legacy), legacy).toBe(true);
    }
    // Modelin kendi kartı ve başka bir modelin kartı birleştirmeye girmez.
    expect(hexlaserLegacyVariantCode('PG3015', 'PG3015')).toBe(false);
    expect(hexlaserLegacyVariantCode('PG3015', 'PG30150-ACIK-6KW')).toBe(false);
  });

  it.each([
    [6, '35.9', '50'],
    [12, '55.9', '80'],
  ] as const)('stores F3015 %s kW electrical values as single values', (powerKw, totalPower, transformer) => {
    const [variant] = hexlaserCuttingVariants([resolveLaserProfile({
      productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', sourceModelCode: 'F3015', cabinType: 'open', powerKw,
    })]);
    expect(variant.configuration.specs.find((spec) => spec.key === 'Toplam Güç Gereksinimi')).toMatchObject({ value: totalPower, unit: 'kW' });
    expect(variant.configuration.specs.find((spec) => spec.key === 'Trafo Kapasitesi')).toMatchObject({ value: transformer, unit: 'kVA' });
  });
});
