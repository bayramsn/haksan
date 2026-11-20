/** HEX PDF is primary. Source spellings are deliberately not normalized to legacy aliases. */
import { HEXLASER_2026_MANIFEST } from './hexlaser-2026-data';
import { HEX2026_REVIEWED_CELLS, type Hex2026PowerBranch } from './hexlaser-2026-reviewed';
export interface Hex2026Field { powerBranches?: readonly Hex2026PowerBranch[]; key: string; rawValue: string; verification: string; source: { document: string; page: number; capturedAt: string; sourceModelCode: string; rawValue: string } }
export interface Hex2026Configuration { sourceModelCode: string; fields: Hex2026Field[] }
export interface Hex2026Series { series: string; brand: string; kind: string; page: number; configurations: Hex2026Configuration[]; standardCabin: 'open' | 'closed' | null; powerOptions: number[]; powerPolicy: string; saleStatus: string }
export const HEX2026_REVISION = 'hexlaser-2026-v1';
/** Layer visual reviews on cloned cells so original source data stays immutable. */
export const HEX2026_SERIES: readonly Hex2026Series[] = (HEXLASER_2026_MANIFEST.series as Hex2026Series[]).map(series => ({
  ...series,
  configurations: series.configurations.map(configuration => {
    const fields = configuration.fields.map(field => ({ ...field, source: { ...field.source } })) as Hex2026Field[];
    for (const [modelCode, key, rawValue, powerBranches] of HEX2026_REVIEWED_CELLS) {
      if (modelCode !== configuration.sourceModelCode) continue;
      const current = fields.find(field => field.key === key);
      // Conditional raw cells are not invariant base-card facts.
      const verification = powerBranches.length ? 'needs_review' : 'verified';
      if (current) Object.assign(current, { rawValue, source: { ...current.source, rawValue }, verification, ...(powerBranches.length ? { powerBranches } : {}) });
      else fields.push({ key, rawValue, verification, source: { ...configuration.fields[0]!.source, rawValue } });
    }
    return { ...configuration, fields };
  }),
}));

export function hex2026PowerBranch(field: Hex2026Field, powerKw: number): Hex2026PowerBranch | undefined {
  return field.powerBranches?.find(branch => {
    const bound = branch.powerKw;
    if (branch.operator === 'between') return Array.isArray(bound) && powerKw >= bound[0] && powerKw <= bound[1];
    if (typeof bound !== 'number') return false;
    return branch.operator === '<=' ? powerKw <= bound : branch.operator === '>=' ? powerKw >= bound
      : branch.operator === '>' ? powerKw > bound : powerKw === bound;
  });
}
export function hex2026ProductType(series: Hex2026Series) {
  return series.kind === 'tube' ? 'BORU_LAZER_KESIM' : series.kind === '3d' ? 'FIBER_LAZER_3D_KESIM' : series.kind === 'welding' ? 'FIBER_LAZER_KAYNAK' : 'FIBER_LAZER_KESIM';
}
export function findHex2026Configuration(series: string, modelCode: string) {
  return HEX2026_SERIES.find(row => row.series === series)?.configurations.find(row => row.sourceModelCode === modelCode);
}
export function hex2026CapacityLabel(configuration: Hex2026Configuration) {
  return configuration.fields.find(field => /^(?:Çalışma Alanı|Konvansiyonel Düz Kesim|Maksimum Boru İşleme Uzunluğu|Ekipman Boyutu)/.test(field.key))?.rawValue ?? configuration.sourceModelCode;
}
/** Exact model must match; ranged power bounds constrain choices but never manufacture choices. */
export function hex2026PowerBounds(configuration: Hex2026Configuration): { min: number; max: number } | null {
  const raw = configuration.fields.find(field => field.key === 'Lazer Gücü')?.rawValue;
  if (!raw) return null;
  const match = raw.match(/^(\d+(?:[.,]\d+)?)\s*(?:[-–]\s*(\d+(?:[.,]\d+)?))?\s*(kW|W)$/i);
  if (!match) return null;
  const divisor = match[3]!.toLowerCase() === 'w' ? 1000 : 1;
  const min = Number(match[1]!.replace(',', '.')) / divisor;
  return { min, max: Number((match[2] ?? match[1])!.replace(',', '.')) / divisor };
}
