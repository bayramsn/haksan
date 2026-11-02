import { findHex2026Configuration, HEX2026_REVISION, HEX2026_SERIES } from '@haksan/shared';
import type { BaseModelConfiguration, LaserBaseConfiguration, LaserTechnicalConfiguration } from '@haksan/shared';
import type { QuoteSelectedOptionDraft, QuoteTechnicalSpecDraft } from './quote-logic';

/**
 * Baz kart seçimi sonrası teklif satırının teknik bilgileri — web
 * `baseModelOptionSpecs`, `laserBaseQuoteContext`, `hexConfigurationQuoteSpecs`,
 * `applyResolvedLaserProfile` ve QuoteDialog `changeBaseOptions` dallanmasının taşıması.
 */

type SpecValue = { id: string; value: string; sourceModelCode?: string | null; powerKw?: string | number | null; cabinType?: 'open' | 'closed' | null };
export type BaseSpecSet = { id: string; name: string; configurationKind?: string | null; values: SpecValue[] };
type LaserSelection = LaserTechnicalConfiguration['selection'];

/** Sabit baz bilgileri korunur; değişken alanlar yalnız tek ve doğrulanmış kaynak konfigürasyondan gelir. */
export function baseModelOptionSpecs(
  base: BaseModelConfiguration,
  sets: BaseSpecSet[],
  selected: QuoteSelectedOptionDraft[],
  fixedSpecs: Array<{ key: string; value: string; unit?: string | null }>,
): QuoteTechnicalSpecDraft[] {
  const sourceCodes = [
    ...new Set(
      selected
        .map((option) => sets.find((set) => set.id === option.optionSetId)?.values.find((value) => value.id === option.optionValueId)?.sourceModelCode)
        .filter((code): code is string => Boolean(code)),
    ),
  ];
  if (sourceCodes.length > 1) throw new Error('Seçenekler farklı makine konfigürasyonlarına ait.');
  const configuration = base.configurations.find((row) => row.sourceModelCode === sourceCodes[0]);
  if (sourceCodes.length && !configuration) throw new Error('Kaynak model doğrulanamadı.');
  const fixed = fixedSpecs.filter((spec) => !base.variableSpecKeys.includes(spec.key));
  const variable = configuration?.specs.filter((spec) => base.variableSpecKeys.includes(spec.key)) ?? [];
  return [...fixed, ...variable].map((spec) => ({ key: spec.key, value: spec.unit ? `${spec.value} ${spec.unit}` : spec.value }));
}

export function laserBaseQuoteContext(base: LaserBaseConfiguration, sets: BaseSpecSet[], selected: QuoteSelectedOptionDraft[]) {
  const choice = (kind: string) => {
    const set = sets.find((row) => row.configurationKind === kind);
    return set?.values.find((row) => selected.some((snapshot) => snapshot.optionSetId === set.id && snapshot.optionValueId === row.id));
  };
  const table = choice('table');
  const power = choice('power');
  const cabin = choice('cabin');
  const isHex2026 = base.sourceRevision === HEX2026_REVISION;
  const configuration = isHex2026 && table?.sourceModelCode ? findHex2026Configuration(base.series, table.sourceModelCode) : undefined;
  if (isHex2026 && table?.sourceModelCode && !configuration) throw new Error('Kaynak model HEX 2026 serisiyle eşleşmiyor.');
  const cabinType =
    cabin?.cabinType ??
    (!sets.some((set) => set.configurationKind === 'cabin') && isHex2026 ? HEX2026_SERIES.find((row) => row.series === base.series)?.standardCabin : null);
  return { table, power, cabinType: cabinType ?? null, configuration, isHex2026 };
}

/**
 * Seçilen alt modelin doğrulanmış (PDF / AORE 2026) alanları. Güce bağlı satırlar ("3 kW: …")
 * seçilen güce indirgenir; seçilen güç için değer yoksa alan basılmaz.
 */
export function hexConfigurationQuoteSpecs(
  configuration: { fields: ReadonlyArray<{ key: string; rawValue: string; verification: string }> },
  powerKw?: number | string | null,
): QuoteTechnicalSpecDraft[] {
  const label = powerKw == null ? undefined : `${String(powerKw).replace('.', ',')} kW: `;
  return configuration.fields
    .filter((field) => (field.verification === 'verified' || field.verification === 'aore_excel') && field.key !== 'Lazer Gücü')
    .map((field) => {
      const perPower = field.rawValue.split('\n').filter((line) => /^\d+(?:,\d+)? kW: /.test(line));
      if (!perPower.length || !label) return { key: field.key, value: field.rawValue };
      const hit = perPower.find((line) => line.startsWith(label));
      return { key: field.key, value: hit ? hit.slice(label.length).trim() : '' };
    })
    .filter((spec) => spec.value.trim())
    .concat(powerKw == null ? [] : [{ key: 'Lazer Gücü', value: `${String(powerKw).replace('.', ',')} kW` }]);
}

/** Katalogdan çözülen profil satırın snapshot'ı olur (web `applyResolvedLaserProfile` + `cleanSnapshotSpecs`). */
export function applyResolvedLaserProfile(resolved: LaserTechnicalConfiguration): { technicalConfiguration: LaserTechnicalConfiguration; technicalSpecs: QuoteTechnicalSpecDraft[] } {
  return {
    technicalConfiguration: resolved,
    technicalSpecs: resolved.specs
      .map((spec) => ({ key: spec.key.trim(), value: spec.value.trim(), unit: (spec.unit ?? '').trim() || undefined }))
      .filter((spec) => Boolean(spec.key)),
  };
}

/** Lazer profilleri Sac İşleme bölümünde tutulur (web `divisions.find(code === 'sac_isleme')`). */
export function sacIslemeDivisionId(divisions: ReadonlyArray<{ id: string; code: string }> | null | undefined): string | null {
  return divisions?.find((division) => division.code.toLowerCase() === 'sac_isleme')?.id ?? null;
}

export const MANUAL_SPECS_NOTICE = 'Bu konfigürasyonun teknik bilgileri elle tamamlanmalı ve doğrulanmalıdır.';
export const APPLY_FAILED_NOTICE = 'Seçenekler uygulanamadı. Makine konfigürasyonu ve donanım uyumluluğunu kontrol edin.';

export type BaseSpecsPlan =
  | { kind: 'unchanged' }
  | { kind: 'specs'; technicalSpecs: QuoteTechnicalSpecDraft[]; notice?: string }
  | { kind: 'resolve'; selection: LaserSelection };

/**
 * Seçim sonrası teknik bilgi kararı (web changeBaseOptions):
 * - genel baz kart → kaynak konfigürasyonun değişken alanları,
 * - lazer baz kart + model/güç/kabin tam → katalogdan profil çözümü,
 * - aksi hâlde seçim listesi (+ HEX 2026 doğrulanmış alanlar) ve elle tamamlama uyarısı.
 * Baz kart olmayan ürünlerde mobil teknik bilgiye dokunmaz. Hata fırlatırsa seçim uygulanmaz.
 */
export function planBaseOptionSpecs(input: {
  laserBase?: LaserBaseConfiguration | null;
  baseModel?: BaseModelConfiguration | null;
  productSpecs?: Array<{ key: string; value: string; unit?: string | null }>;
  brandId?: string | null;
  sets: BaseSpecSet[];
  selected: QuoteSelectedOptionDraft[];
  hasMatrix: boolean;
}): BaseSpecsPlan {
  const { laserBase, baseModel, sets, selected } = input;
  if (baseModel) return { kind: 'specs', technicalSpecs: baseModelOptionSpecs(baseModel, sets, selected, input.productSpecs ?? []) };
  if (!laserBase) return { kind: 'unchanged' };
  const context = laserBaseQuoteContext(laserBase, sets, selected);
  const sourceModelCode = context.table?.sourceModelCode;
  const powerKw = context.power?.powerKw;
  if (input.brandId && sourceModelCode && powerKw && context.cabinType) {
    return {
      kind: 'resolve',
      selection: {
        productTypeCode: laserBase.productTypeCode,
        series: laserBase.series,
        ...(laserBase.sourceRevision ? { sourceRevision: laserBase.sourceRevision } : {}),
        sourceModelCode,
        powerKw: Number(powerKw) as LaserSelection['powerKw'],
        cabinType: context.cabinType,
      },
    };
  }
  const choiceSpecs = selected
    .map((option) => {
      const set = sets.find((row) => row.id === option.optionSetId);
      return { key: set?.name ?? '', value: set?.values.find((value) => value.id === option.optionValueId)?.value ?? '' };
    })
    .filter((spec) => spec.key);
  const technicalSpecs = context.configuration
    ? [...(input.hasMatrix ? [] : choiceSpecs), ...hexConfigurationQuoteSpecs(context.configuration, context.power?.powerKw)]
    : choiceSpecs;
  return { kind: 'specs', technicalSpecs, ...(selected.length ? { notice: MANUAL_SPECS_NOTICE } : {}) };
}
