import { describe, expect, it } from 'vitest';
import type { LaserTechnicalConfiguration } from '@haksan/shared';
import { productDetailsPayload } from './store';

describe('atomic laser product details payload', () => {
  it('sends selection, all profile fields and exact empty values in one details request', () => {
    const technicalConfiguration: LaserTechnicalConfiguration = {
      selection: { productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', cabinType: 'closed', powerKw: 12, sourceModelCode: 'F3015' },
      profileId: null, sourceRevision: 'test', modelLabel: 'F3015', sizeLabel: '3050 × 1530 mm', supportedPower: true, standardCabin: false, issues: [],
      specs: [{ key: 'Makine Ağırlığı', value: '', unit: 'kg', groupCode: 'GENEL' }, { key: 'Konumlama Hassasiyeti', value: '0.03', unit: 'mm/m', groupCode: 'KESME' }],
    };
    const payload = productDetailsPayload({ productTypeCode: 'FIBER_LAZER_KESIM', technicalConfiguration, specs: [{ key: 'Başka model alanı', value: 'stale' }] });
    expect(payload.technicalConfiguration).toEqual(technicalConfiguration);
    expect(payload.specs).toEqual([
      { specGroupCode: 'GENEL', specKey: 'Makine Ağırlığı', specValue: '', specUnit: 'kg', sortOrder: 1 },
      { specGroupCode: 'KESME', specKey: 'Konumlama Hassasiyeti', specValue: '0.03', specUnit: 'mm/m', sortOrder: 2 },
    ]);
  });

  it('distinguishes preserving a legacy configuration from explicitly clearing it', () => {
    expect(productDetailsPayload({})).not.toHaveProperty('technicalConfiguration');
    expect(productDetailsPayload({ technicalConfiguration: null })).toHaveProperty('technicalConfiguration', null);
  });
});
