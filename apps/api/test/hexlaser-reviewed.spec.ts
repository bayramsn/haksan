import { describe, expect, it } from 'vitest';
import { HEX2026_REVISION, HEX2026_SERIES, resolveLaserProfile, hex2026ProductType, type LaserSelection } from '@haksan/shared';
import { HEXLASER_2026_MANIFEST } from '../../../packages/shared/src/hexlaser-2026-data';

const profile = (series: string, model: string, powerKw: number) => {
  const row = HEX2026_SERIES.find(item => item.series === series)!;
  return resolveLaserProfile({ sourceRevision: HEX2026_REVISION, series: series as LaserSelection['series'],
    sourceModelCode: model, powerKw, productTypeCode: hex2026ProductType(row), cabinType: row.standardCabin ?? 'open' });
};
const value = (series: string, model: string, power: number, key: string) => profile(series, model, power).specs.find(field => field.key === key)?.value;

describe('visually reviewed HEX2026 source cells', () => {
  it('adds confirmed motor data without mutating the literal source manifest', () => {
    expect(value('H', 'H-3015', 6, 'X Eksen Motor Gücü')).toBe('2,0');
    expect(HEX2026_SERIES.find(row => row.series === 'H')!.configurations[0]!.fields.find(field => field.key === 'X Eksen Motor Gücü')!.verification).toBe('verified');
    expect(HEXLASER_2026_MANIFEST.series.find(row => row.series === 'H')!.configurations[0]!.fields.find(field => field.key === 'X Eksen Motor Gücü')!.verification).toBe('needs_review');
  });
  it('keeps conditional raw cells out of invariant base facts and leaves source power gaps blank', () => {
    const field = HEX2026_SERIES.find(row => row.series === 'F')!.configurations[0]!.fields.find(field => field.key === 'X Eksen Motor Gücü')!;
    expect(field.verification).toBe('needs_review');
    expect(field.powerBranches).toHaveLength(2);
    expect(value('F', 'F-3015', 6, 'X Eksen Motor Gücü')).toBe('0.85');
    expect(value('F', 'F-3015', 8, 'X Eksen Motor Gücü')).toBe('1.3');
    expect(value('F', 'F-3015', 7, 'X Eksen Motor Gücü')).toBe('');
    expect(profile('F', 'F-3015', 7).issues).toContainEqual(expect.objectContaining({ code: 'needs_review', field: 'X Eksen Motor Gücü' }));
  });
  it('handles F8025 separately and does not generalize an exact six-kilowatt condition', () => {
    expect(value('F', 'F-8025', 6, 'Y Eksen Motor Gücü')).toBe('1.8 × 2');
    expect(value('F', 'F-8025', 7, 'Y Eksen Motor Gücü')).toBe('2.9 × 2');
    expect(value('F', 'F-8025', 3, 'Y Eksen Motor Gücü')).toBe('');
    expect(value('PG', 'PG-4020', 3, 'Y Eksen Motor Gücü')).toBe('');
    expect(value('PG', 'PG-4020', 6, 'Y Eksen Motor Gücü')).toBe('1.8 × 2');
  });
  it('does not broaden PGT3015 twelve-kilowatt conditions to eight or ten kilowatts', () => {
    expect(value('PGT', 'PGT3015', 12, 'Y Eksen Motor Gücü')).toBe('1.8 × 2');
    expect(value('PGT', 'PGT3015', 10, 'Y Eksen Motor Gücü')).toBe('');
    expect(value('PGT', 'PGT3015', 8, 'Z Eksen Motor Gücü')).toBe('');
  });
  it('resolves the power-dependent S working area and never labels a missing branch with raw alternatives', () => {
    expect(value('S', 'S-1530', 8, 'Çalışma Alanı (kW)-(mm)')).toBe('3060x1530');
    expect(value('S', 'S-1530', 12, 'Çalışma Alanı (kW)-(mm)')).toBe('2960x1430');
    expect(value('S', 'S-1325', 12, 'Çalışma Alanı (kW)-(mm)')).toBe('2460x1230');
    expect(value('S', 'S-1530', 10, 'Çalışma Alanı (kW)-(mm)')).toBe('');
    expect(profile('S', 'S-1530', 10).sizeLabel).toBe('S-1530');
  });
  it('preserves ambiguous TS source typography as unresolved while resolving clear motors', () => {
    for (const code of ['TS-6020', 'TS-12035']) {
      expect(value('TS', code, 6, 'B Eksen Motor Gücü')).toBe('');
      expect(value('TS', code, 6, 'X Eksen Motor Gücü')).toBe('0,75');
    }
  });
  it('adds the merged HW cooling fact to all three exact source model columns', () => {
    const row = HEX2026_SERIES.find(item => item.series === 'HW')!;
    for (const config of row.configurations) {
      const cooling = config.fields.find(field => field.key === 'Soğutma Tipi')!;
      expect(cooling.rawValue).toBe('Akıllı çift sıcaklık kontrollü su soğutucu sistemi');
      expect(cooling.source.page).toBe(30);
      expect(cooling.source.sourceModelCode).toBe(config.sourceModelCode);
      expect(cooling.verification).toBe('verified');
    }
  });
});
