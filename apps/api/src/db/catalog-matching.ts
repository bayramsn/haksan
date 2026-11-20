/** Pure matching of public source cards against existing CRM products. No guessing: a near match is never merged automatically. */
export interface ExistingProduct { id: string; modelCode: string; modelName: string | null; brand: string | null; division: string | null; typeCode?: string | null; catalogSources?: Array<{ sourceId: string }> }
export interface SourceCard { sourceId: string; brand: string; model: string }
export type MatchResult =
  | { status: 'source' | 'model'; existing: ExistingProduct }
  | { status: 'possible'; candidates: ExistingProduct[] }
  | { status: 'none' };
export type MatchDecision = 'new' | 'skip' | { modelCode: string };

export const matchKey = (value: string | null | undefined) => (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/ı/g, 'i').replace(/İ/g, 'I').toUpperCase().replace(/[^A-Z0-9]/g, '');
// "LK Machinery" and "LK MACHINERY" are one brand; "AORE LASER" is "AORE".
const brandKey = (value: string | null | undefined) => matchKey(value).replace(/(MACHINERY|MAKINA|MAKINE|LASER|LAZER)$/, '');
/** "MT-310 / MT-310 MC" lists two variants; "MT-208/500" (no spaces) is one code. */
export const sourceModelCodes = (model: string) => model.split(/\s+\/\s+/).map(matchKey).filter(code => code.length >= 3);

export function matchSourceCard(card: SourceCard, existing: readonly ExistingProduct[]): MatchResult {
  const bySource = existing.find(row => row.modelCode === `HM-${card.sourceId}` || row.catalogSources?.some(source => source.sourceId === card.sourceId));
  if (bySource) return { status: 'source', existing: bySource };
  const codes = sourceModelCodes(card.model);
  if (!codes.length) return { status: 'none' };
  const brand = brandKey(card.brand);
  const sameBrand = existing.filter(row => !row.modelCode.startsWith('HM-') && (!!row.brand && brandKey(row.brand) === brand));
  const exact = sameBrand.filter(row => codes.includes(matchKey(row.modelCode)) || codes.includes(matchKey(row.modelName)));
  if (exact.length === 1) return { status: 'model', existing: exact[0]! };
  if (exact.length > 1) return { status: 'possible', candidates: exact };
  // MT-412 on the site vs MT-412/750 in CRM: same family, different length — a person decides.
  // "LK.VC-760EZ.12K.DDS.M" carries brand and configuration around the model: its dotted parts count too.
  const parts = (row: ExistingProduct) => row.modelCode.split(/[.\s]+/).map(matchKey).filter(Boolean);
  const near = sameBrand.filter(row => codes.some(code => matchKey(row.modelCode).startsWith(code) || code.startsWith(matchKey(row.modelCode))
    || parts(row).some(part => part.startsWith(code))));
  return near.length ? { status: 'possible', candidates: near } : { status: 'none' };
}

/** Existing CNC rows are never merged into or moved; unresolved CNC near matches are skipped, others block the import. */
export function resolveMatch(match: MatchResult, targetDivision: string, decision?: MatchDecision, existing: readonly ExistingProduct[] = []):
  { action: 'create' } | { action: 'skip'; reason: string } | { action: 'link'; existing: ExistingProduct } | { action: 'blocked'; reason: string } {
  if (decision === 'new') return { action: 'create' };
  if (decision === 'skip') return { action: 'skip', reason: 'karar: atla' };
  if (decision) {
    const row = existing.find(r => r.modelCode === decision.modelCode);
    return row ? { action: 'link', existing: row } : { action: 'blocked', reason: `karar dosyasındaki ${decision.modelCode} bulunamadı` };
  }
  if (match.status === 'none') return { action: 'create' };
  if (match.status !== 'possible') return { action: 'link', existing: match.existing };
  return { action: 'blocked', reason: `belirsiz eşleşme: ${match.candidates.map(c => c.modelCode).join(', ')}` };
}
