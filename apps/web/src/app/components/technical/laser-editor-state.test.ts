import { describe, expect, it } from 'vitest';
import { resolveLaserProfile, type LaserSelection } from '@haksan/shared';
import { changeLaserSelection, editLaserSpec, laserDraftKey, readLaserDraft, resetLaserSpec } from './laser-editor-state';

const selection: LaserSelection = { productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', cabinType: 'open', powerKw: 6, sourceModelCode: 'F3015' };
const scope = { tenantId: 'tenant-a', divisionId: 'division-a', brandId: 'aore-a', draftScope: 'settings' };

describe('laser editor state', () => {
  it('clears only descendants at each cascade level', () => {
    expect(changeLaserSelection(selection, 'productTypeCode', 'BORU_LAZER_KESIM')).toEqual({ productTypeCode: 'BORU_LAZER_KESIM' });
    expect(changeLaserSelection(selection, 'series', 'PG')).toEqual({ productTypeCode: 'FIBER_LAZER_KESIM', series: 'PG' });
    expect(changeLaserSelection(selection, 'cabinType', 'closed')).toEqual({ productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', cabinType: 'closed' });
    expect(changeLaserSelection(selection, 'powerKw', '12')).toEqual({ productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', cabinType: 'open', powerKw: 12 });
  });

  it('isolates drafts across tenant, division, brand, product and machine combination', () => {
    const keys = [laserDraftKey(scope, selection),
      ...Object.keys(scope).map((key) => laserDraftKey({ ...scope, [key]: 'other' }, selection)),
      laserDraftKey(scope, { ...selection, cabinType: 'closed' }),
      laserDraftKey(scope, { ...selection, powerKw: 12 }),
      laserDraftKey(scope, { ...selection, sourceModelCode: 'F6015' }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ignores invalid or incorrectly keyed cached configurations', () => {
    const profile = resolveLaserProfile(selection);
    const key = laserDraftKey(scope, selection);
    expect(readLaserDraft({ getItem: () => JSON.stringify(profile) }, key, selection)?.selection).toEqual(selection);
    expect(readLaserDraft({ getItem: () => JSON.stringify(profile) }, key, { ...selection, powerKw: 12 })).toBeNull();
    expect(readLaserDraft({ getItem: () => '{bad json' }, key, selection)).toBeNull();
    expect(readLaserDraft({ getItem: () => JSON.stringify({ selection, specs: [] }) }, key, selection)).toBeNull();
  });

  it('preserves original source values through repeated manual edits and resets', () => {
    const source = { document: 'aore.xlsx', sheet: 'F Serisi', cell: 'E11' };
    const first = editLaserSpec({ key: 'Makine Ağırlığı', value: '2150', unit: 'kg', source }, '2200');
    const second = editLaserSpec(first, '2300');
    expect(second).toMatchObject({ sourceValue: '2150', value: '2300', isManual: true, source });
    expect(editLaserSpec(second, '2150')).toMatchObject({ value: '2150', sourceValue: '2150', isManual: false });
    expect(editLaserSpec({ key: 'Rezonatör Markası', value: '' }, 'Özel')).toMatchObject({ sourceValue: '', isManual: true });
  });

  it('restores both source value and source unit after a manual unit override', () => {
    const overridden = { key: 'Makine Ağırlığı', value: '2.2', unit: 'ton', sourceValue: '2150', sourceUnit: 'kg', isManual: true };
    expect(resetLaserSpec(overridden)).toMatchObject({ value: '2150', unit: 'kg', sourceValue: '2150', sourceUnit: 'kg', isManual: false });
    expect(editLaserSpec(overridden, '2150').isManual).toBe(true);
    expect(resetLaserSpec({ key: 'Makine Ağırlığı', value: '2200', sourceValue: '2150', unit: 'kg', isManual: true }).unit).toBe('kg');
  });
});
