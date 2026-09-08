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
});
