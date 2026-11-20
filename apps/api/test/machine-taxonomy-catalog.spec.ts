import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MACHINE_FAMILIES, machineCategoryLabel, machineFamilyForType, machineGroupCode, machineTaxonomyCode } from '@haksan/shared';
import { previewHaksanmakinaCatalog } from '../src/db/import-haksanmakina-catalog';
import { haksanDivision, haksanExclusion, haksanTypeCode, isCanonicalLaserSource } from '../src/db/haksan-catalog-classification';

describe('shared machine families and importer preflight', () => {
  it('maps every machine source product to a family and keeps non-machine groups outside', () => {
    const snapshot = JSON.parse(readFileSync(path.join(__dirname, '../src/db/seed/data/haksanmakina/products.json'), 'utf8'));
    for (const product of snapshot.products) {
      if (isCanonicalLaserSource(product) || haksanExclusion(product)) continue;
      const type = haksanTypeCode(product);
      if (machineGroupCode(product.group)) expect(machineFamilyForType(product.group, type), type).toBeDefined();
      else expect(machineFamilyForType(product.group, type), type).toBeUndefined();
    }
  });
  it('includes horizontal machining centers and files accessories under the machine they fit', () => {
    const base = { brand: 'X', title: '' };
    expect(haksanExclusion({ ...base, group: 'CNC', sourceCategory: 'CNC Yatay İşleme Merkezleri' })).toBeNull();
    expect(haksanTypeCode({ ...base, group: 'SAC_ISLEME', sourceCategory: 'CNC Laser Kesim Makinaları', title: 'CNC Laser Kesim Makinası' })).toBe('fiber_lazer_kesim');
    expect(haksanDivision({ ...base, group: 'HIRDAVAT', sourceCategory: 'Mengeneler', title: '250x400 mm CNC Mengenesi' })).toBe('CNC');
    expect(haksanDivision({ ...base, group: 'HIRDAVAT', sourceCategory: 'Mengeneler', title: 'Dönerli Freze Mengenesi' })).toBe('UNIVERSAL');
    expect(haksanDivision({ ...base, group: 'YEDEK_PARCA', sourceCategory: 'TOS Torna Punta & Gövde Parçaları' })).toBe('UNIVERSAL');
    expect(haksanDivision({ ...base, group: 'HIRDAVAT', sourceCategory: 'Abkant Üst Bıçak & Alt Kalıpları' })).toBe('SAC_ISLEME');
    expect(haksanDivision({ ...base, group: 'KAYNAK', sourceCategory: 'Lazer Kaynak Makinaları' })).toBe('SAC_ISLEME');
  });
  it('places laser types separately from mechanical cutting and preserves detailed type identity', () => {
    for (const type of ['fiber_lazer_kesim', 'fiber_lazer_boru_kesim', 'BORU_LAZER_KESIM', 'SAC_BORU_LAZER_KESIM']) {
      expect(machineFamilyForType('sac_isleme', type)?.code).toBe('SAC_LAZER_KESIM');
    }
    expect(machineFamilyForType('SAC_ISLEME', 'PLAZMA_KESIM')?.code).toBe('SAC_KESME');
    expect(machineFamilyForType('UNIVERSAL', 'HM_UNIVERSAL_MATKAP_FREZE_TEZGAHLARI')?.code).toBe('FREZE');
    expect(machineFamilyForType('CNC', 'UNREGISTERED_MACHINE')).toBeUndefined();
  });
  it('keeps the approved names and family counts across group casing', () => {
    expect(machineCategoryLabel('cnc')).toBe('CNC Tezgahları');
    expect(machineCategoryLabel('universal')).toBe('Üniversal Tezgahlar');
    expect(machineCategoryLabel('sac_isleme')).toBe('Sac İşleme Tezgahları');
    expect(machineCategoryLabel('KAYNAK')).toBe('Tezgah');
    expect(Object.values(MACHINE_FAMILIES).map(families => families.length)).toEqual([4, 8, 5]);
  });
  it('validates both source snapshots in preview mode without connecting to a database', async () => {
    expect(await previewHaksanmakinaCatalog()).toMatchObject({ mode: 'preview', products: 593, productTypes: 78, excluded: [] });
    expect(await previewHaksanmakinaCatalog(true)).toMatchObject({ mode: 'preview', products: 2, productTypes: 1 }); // 11 AORE/HEX cards defer to the HEX pipeline
  });
});
