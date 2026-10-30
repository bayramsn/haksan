import { describe, expect, it } from 'vitest';
import { LASER_MODELS } from '@haksan/shared';
import { catalogProductSpecs } from '../src/db/hexlaser-product-specs';

describe('unconfigured imported product specifications', () => {
  it('preserves multiple power conditions and keeps electrical power separate from transformer capacity', () => {
    const specs = catalogProductSpecs(LASER_MODELS.find((model) => model.code === 'F3015')!.fields);
    const power = specs.find((spec) => spec.key === 'Toplam Güç Gereksinimi')!;
    // 2026 kitabı: standart (INOVANCE motorlu) sütun; hücrenin motor markası satırı değer değildir.
    expect(power.value).toContain('1.5 kW: 13.15');
    expect(power.value).toContain('2 kW: 16.05');
    expect(power.value).toContain('6 kW: 36.45');
    expect(power.value).toContain('12 kW: 67.15');
    expect(power.value).not.toMatch(/[\u3400-\u9fff]/);
    expect(power.unit).toBe('kW');
    const transformer = specs.find((spec) => spec.key === 'Trafo Kapasitesi')!;
    expect(transformer.value).toContain('1.5 kW: 20');
    expect(transformer.value).toContain('2 kW: 30');
    expect(transformer.value).toContain('6 kW: 50');
    expect(transformer.value).toContain('12 kW: 100');
    expect(transformer.unit).toBe('kVA');
    expect(specs.filter((spec) => spec.key === power.key)).toHaveLength(1);
  });

  it('separates electrical tuples that include a trailing phase annotation', () => {
    const source = { document: 'AORE Technical Parameters.xlsx', sheet: 'test', cell: 'A1' };
    const specs = catalogProductSpecs([
      { key: 'Toplam Güç Gereksinimi', rawValue: '20.7KW/40KVA（三相380V）', groupCode: 'GENEL', unit: 'kW', powerKw: 1.5, source },
      { key: 'Trafo Kapasitesi', rawValue: '20.7KW/40KVA（三相380V）', groupCode: 'GENEL', unit: 'kVA', powerKw: 1.5, source },
    ]);
    expect(specs.find((spec) => spec.key === 'Toplam Güç Gereksinimi')).toMatchObject({ value: '1.5 kW: 20.7', unit: 'kW' });
    expect(specs.find((spec) => spec.key === 'Trafo Kapasitesi')).toMatchObject({ value: '1.5 kW: 40', unit: 'kVA' });
  });

  it.each([
    ['GR2500-6', '52.35', '80.35', '4.4kW*2'],
    ['GR2500Pro-6', '54.55', '82.55', '5.5kW*2'],
  ])('selects %s variant while preserving all electrical power conditions', (code, six, twelve, motor) => {
    const specs = catalogProductSpecs(LASER_MODELS.find((model) => model.code === code)!.fields, code);
    const power = specs.find((spec) => spec.key === 'Toplam Güç Gereksinimi')!;
    const transformer = specs.find((spec) => spec.key === 'Trafo Kapasitesi')!;
    expect(power.value).toContain(`6 kW: ${six}`);
    expect(power.value).toContain(`12 kW: ${twelve}`);
    expect(power.value).toContain('60 kW:');
    expect(power.unit).toBe('kW');
    expect(power.value).not.toMatch(/kva|\//i);
    expect(transformer.value).toContain('6 kW: 80');
    expect(transformer.value).toContain('12 kW: 100');
    expect(transformer.unit).toBe('kVA');
    expect(transformer.value).not.toMatch(/\//);
    expect(specs.find((spec) => spec.key === 'Y Eksen Motor Gücü')?.value).toBe(motor);
  });

  it('retains GR variant labels when no model is selected without mixing kW and kVA', () => {
    const specs = catalogProductSpecs(LASER_MODELS.find((model) => model.code === 'GR2500-6')!.fields);
    expect(specs.find((spec) => spec.key === 'Toplam Güç Gereksinimi')).toMatchObject({
      unit: 'kW', value: expect.stringContaining('6 kW: GR: 52.35\n6 kW: GR Pro: 54.55'),
    });
    expect(specs.find((spec) => spec.key === 'Trafo Kapasitesi')).toMatchObject({
      unit: 'kVA', value: expect.stringContaining('6 kW: GR: 80\n6 kW: GR Pro: 80'),
    });
  });
});
