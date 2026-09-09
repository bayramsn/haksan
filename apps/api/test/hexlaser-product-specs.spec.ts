import { describe, expect, it } from 'vitest';
import { LASER_MODELS } from '@haksan/shared';
import { catalogProductSpecs } from '../src/db/hexlaser-product-specs';

describe('unconfigured imported product specifications', () => {
  it('preserves multiple power conditions and keeps electrical power separate from transformer capacity', () => {
    const specs = catalogProductSpecs(LASER_MODELS.find((model) => model.code === 'F3015')!.fields);
    const power = specs.find((spec) => spec.key === 'Toplam Güç Gereksinimi')!;
    expect(power.value).toContain('6 kW: 35.9');
    expect(power.value).toContain('12 kW: 55.9');
    expect(power.unit).toBe('kW');
    const transformer = specs.find((spec) => spec.key === 'Trafo Kapasitesi')!;
    expect(transformer.value).toContain('6 kW: 50');
    expect(transformer.value).toContain('12 kW: 80');
    expect(transformer.unit).toBe('kVA');
    expect(specs.filter((spec) => spec.key === power.key)).toHaveLength(1);
  });

  it.each([
    ['GR2500-6', '45.75', '73.25', '4.4KW*2'],
    ['GR2500Pro-6', '47.75', '78.25', '5.5KW*2'],
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
    expect(transformer.value).toContain('12 kW: 120');
    expect(transformer.unit).toBe('kVA');
    expect(transformer.value).not.toMatch(/\//);
    expect(specs.find((spec) => spec.key === 'Y Eksen Motor Gücü')?.value).toBe(motor);
  });

  it('retains GR variant labels when no model is selected without mixing kW and kVA', () => {
    const specs = catalogProductSpecs(LASER_MODELS.find((model) => model.code === 'GR2500-6')!.fields);
    expect(specs.find((spec) => spec.key === 'Toplam Güç Gereksinimi')).toMatchObject({
      unit: 'kW', value: expect.stringContaining('6 kW: GR: 45.75\n6 kW: GR Pro: 47.75'),
    });
    expect(specs.find((spec) => spec.key === 'Trafo Kapasitesi')).toMatchObject({
      unit: 'kVA', value: expect.stringContaining('6 kW: GR: 80\n6 kW: GR Pro: 80'),
    });
  });
});
