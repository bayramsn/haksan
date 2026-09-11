import { describe, expect, it } from 'vitest';
import { resolveLaserProfile, type LaserTechnicalConfiguration } from '@haksan/shared';
import { applyResolvedLaserProfile, cleanSnapshotSpecs, laserPowerOptions, laserSnapshotPrintSpecs, quoteTechnicalSpecsFromProduct, withQuotedLaserSpecs } from './laserProductSnapshot';
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
    // Kimlik satırları 'Ürün' grubunda, tablonun başında tek şerit olarak basılır.
    expect(specs).toContainEqual({ key: 'Kabin Tipi', value: 'Kapalı', groupName: 'Ürün' });
    expect(specs).toContainEqual({ key: 'Kaynak Model', value: 'F3015', groupName: 'Ürün' });
    expect(specs.filter((spec) => /Gücü/.test(spec.key))).toEqual([expect.objectContaining({ key: 'Lazer Gücü', value: '' })]);
  });

  it('labels TG protection and capacity without inventing a table', () => {
    const profile = configuration();
    profile.selection = { productTypeCode: 'BORU_LAZER_KESIM', series: 'TG', cabinType: 'closed', powerKw: 30, sourceModelCode: 'TG6012' };
    profile.sizeLabel = 'Ø10–120 mm';
    const specs = laserSnapshotPrintSpecs(profile, []);
    expect(specs).toContainEqual({ key: 'Kesim Bölgesi Koruması', value: 'Kapalı', groupName: 'Ürün' });
    expect(specs).toContainEqual({ key: 'Boru Modeli ve Kapasitesi', value: 'Ø10–120 mm', groupName: 'Ürün' });
    expect(specs.some((spec) => spec.key === 'Tabla Ölçüsü')).toBe(false);
  });
});

describe('teklif satırında kabin ve rezonatör gücü', () => {
  it('güç seçenekleri modelin katalog aralığından gelir', () => {
    const pg = resolveLaserProfile({ productTypeCode: 'FIBER_LAZER_KESIM', series: 'PG', cabinType: 'closed', powerKw: 3, sourceModelCode: 'PG3015' });
    expect(laserPowerOptions(pg)).toEqual([1.5, 2, 3, 6, 12, 20]);
    const tg = resolveLaserProfile({ productTypeCode: 'BORU_LAZER_KESIM', series: 'TG', cabinType: 'closed', powerKw: 3, sourceModelCode: 'TG6012' });
    expect(laserPowerOptions(tg)).toEqual([1.5, 2, 3]);
    expect(laserPowerOptions(null)).toEqual([]);
  });

  it('3 kW → 12 kW geçişinde güce bağlı alanlar profilden yenilenir, alan seti aynı kalır', () => {
    const at3 = resolveLaserProfile({ productTypeCode: 'FIBER_LAZER_KESIM', series: 'PG', cabinType: 'closed', powerKw: 3, sourceModelCode: 'PG3015' });
    const at12 = resolveLaserProfile({ ...at3.selection, powerKw: 12 });
    const line = { productId: 'p1', technicalConfiguration: at3, technicalSpecs: cleanSnapshotSpecs(at3.specs) };
    const next = applyResolvedLaserProfile(line, at12);
    const value = (specs: { key: string; value: string }[], key: string) => specs.find((s) => s.key === key)?.value;
    expect(next.productId).toBe('p1');
    expect(next.technicalConfiguration.selection.powerKw).toBe(12);
    expect(next.technicalSpecs.map((s) => s.key)).toEqual(line.technicalSpecs.map((s) => s.key));
    expect(value(next.technicalSpecs, 'Kontrol Ünitesi')).not.toBe(value(line.technicalSpecs, 'Kontrol Ünitesi'));
    expect(value(next.technicalSpecs, 'Makine Ağırlığı')).not.toBe(value(line.technicalSpecs, 'Makine Ağırlığı'));
  });

  it('kabin değişince kabine bağlı alanlar yeni profilden gelir', () => {
    const closed = resolveLaserProfile({ productTypeCode: 'FIBER_LAZER_KESIM', series: 'PG', cabinType: 'closed', powerKw: 3, sourceModelCode: 'PG3015' });
    const open = resolveLaserProfile({ ...closed.selection, cabinType: 'open' });
    const next = applyResolvedLaserProfile({ technicalConfiguration: closed, technicalSpecs: cleanSnapshotSpecs(closed.specs) }, open);
    expect(next.technicalConfiguration.selection.cabinType).toBe('open');
    // Kaynakta doğrulanmayan kabin için değerler boş gelir, uydurulmaz.
    expect(next.technicalConfiguration.standardCabin).toBe(false);
  });
});
