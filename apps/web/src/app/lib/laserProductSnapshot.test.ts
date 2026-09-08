import { describe, expect, it } from 'vitest';
import type { LaserTechnicalConfiguration } from '@haksan/shared';
import { cleanSnapshotSpecs, laserSnapshotPrintSpecs, quoteTechnicalSpecsFromProduct, withQuotedLaserSpecs } from './laserProductSnapshot';
import type { Product } from './mock';

const configuration = (): LaserTechnicalConfiguration => ({
  selection: { productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', cabinType: 'closed', powerKw: 12, sourceModelCode: 'F3015' },
  profileId: null, sourceRevision: 'test-v1', modelLabel: 'F3015', sizeLabel: '3050 × 1530 mm', supportedPower: true, standardCabin: false,
  issues: [],
  specs: [
    { key: 'Lazer Gücü', value: '12', unit: 'kW' },
    { key: 'Makine Ağırlığı', value: '', unit: 'kg', sourceValue: '', source: { document: 'AORE.xlsx', sheet: 'F Serisi', cell: 'E10' } },
    { key: 'Konumlama Hassasiyeti', value: '0.03', unit: 'mm/m' },
  ],
});

describe('laser product and quote snapshots', () => {
  it('retains unknown fields as empty, with their exact units', () => {
    expect(cleanSnapshotSpecs(configuration().specs)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'Makine Ağırlığı', value: '', unit: 'kg' }),
      expect.objectContaining({ key: 'Konumlama Hassasiyeti', unit: 'mm/m' }),
    ]));
  });

  it('takes all profile fields rather than filling from the type template or live specs', () => {
    const profile = configuration();
    const product = { productTypeCode: 'FIBER_LAZER_KESIM', technicalConfiguration: profile, specs: [{ key: 'Makine Ağırlığı', value: '99999', unit: 'kg' }] } as Product;
    expect(quoteTechnicalSpecsFromProduct(product)).toHaveLength(3);
    expect(quoteTechnicalSpecsFromProduct(product).find((spec) => spec.key === 'Makine Ağırlığı')?.value).toBe('');
  });

  it('records quote-specific manual changes without mutating product provenance', () => {
    const profile = configuration();
    const quoted = withQuotedLaserSpecs(profile, [
      { key: 'Makine Ağırlığı', value: '3000', unit: 'kg' },
      { key: 'Özel alan', value: 'Seçenek' },
    ]);
    expect(quoted.specs).toHaveLength(2);
    expect(quoted.specs[0]).toMatchObject({ value: '3000', sourceValue: '', isManual: true, source: { document: 'AORE.xlsx', cell: 'E10' } });
    expect(quoted.specs[1].isManual).toBe(true);
    expect(profile.specs[1].value).toBe('');
  });

  it('prints the saved cabin/model and does not fill an intentionally cleared power', () => {
    const profile = configuration();
    const specs = laserSnapshotPrintSpecs(profile, [{ key: 'Lazer Gücü', value: '', unit: 'kW' }]);
    expect(specs).toContainEqual({ key: 'Kabin Tipi', value: 'Kapalı' });
    expect(specs).toContainEqual({ key: 'Kaynak Model', value: 'F3015' });
    expect(specs.filter((spec) => /Gücü/.test(spec.key))).toEqual([expect.objectContaining({ key: 'Lazer Gücü', value: '' })]);
  });

  it('labels TG protection and capacity without inventing a table', () => {
    const profile = configuration();
    profile.selection = { productTypeCode: 'BORU_LAZER_KESIM', series: 'TG', cabinType: 'closed', powerKw: 30, sourceModelCode: 'TG6012' };
    profile.sizeLabel = 'Ø10–120 mm';
    const specs = laserSnapshotPrintSpecs(profile, []);
    expect(specs).toContainEqual({ key: 'Kesim Bölgesi Koruması', value: 'Kapalı' });
    expect(specs).toContainEqual({ key: 'Boru Modeli ve Kapasitesi', value: 'Ø10–120 mm' });
    expect(specs.some((spec) => spec.key === 'Tabla Ölçüsü')).toBe(false);
  });
});
