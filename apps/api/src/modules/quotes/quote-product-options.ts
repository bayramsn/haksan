import type { BaseModelConfiguration, QuoteItemCompatibility, QuoteSelectedProductOption } from '@haksan/shared';
import { resolveLaserProfile, HEX2026_REVISION, findHex2026Configuration, hex2026PowerBounds } from '@haksan/shared';
import { ValidationError } from '../../shared/utils/errors';

export interface CatalogOptionRow {
  optionSetId: string;
  optionValueId: string;
  name: string;
  value: string;
  priceDelta: string | number | null;
  currencyCode: string | null;
  configurationKind: string | null;
  sourceModelCode: string | null;
  powerKw: string | number | null;
  cabinType: string | null;
}

export function sameOptionSelection(a: QuoteSelectedProductOption[] | undefined, b: QuoteSelectedProductOption[] | undefined) {
  const key = (rows: QuoteSelectedProductOption[] | undefined) => (rows ?? [])
    .map((row) => `${row.optionSetId}:${row.optionValueId}`).sort().join('|');
  return key(a) === key(b);
}

/** Prices and labels come from the scoped catalog; clients only select IDs. */
export function snapshotProductOptions(
  compatibility: QuoteItemCompatibility,
  rows: CatalogOptionRow[],
  requiredSetIds: string[] = [],
  base?: { sourceRevision?: string; series: string; productTypeCode: string; sourceModelCodes: string[] } | null,
  universalBase?: BaseModelConfiguration | null,
): QuoteItemCompatibility {
  const selected = compatibility.selectedProductOptions ?? [];
  const seen = new Set<string>();
  const chosen = selected.map((option) => {
    if (seen.has(option.optionSetId)) throw new ValidationError('Her seçenek grubundan yalnız bir donanım seçilebilir');
    seen.add(option.optionSetId);
    const row = rows.find((candidate) => candidate.optionSetId === option.optionSetId && candidate.optionValueId === option.optionValueId);
    if (!row) throw new ValidationError('Seçilen donanım bu baz modele ait değil veya pasif');
    if (row.priceDelta === null || !Number.isFinite(Number(row.priceDelta)) || Number(row.priceDelta) < 0) {
      throw new ValidationError('Seçilen donanımın ek fiyatını ürün ekranında tanımlayın');
    }
    if (Number(option.priceDelta) !== Number(row.priceDelta) || (option.currencyCode || '') !== (row.currencyCode || '')) {
      throw new ValidationError('Donanım fiyatı veya para birimi değişti; güncel seçeneği yeniden seçin');
    }
    return row;
  });
  if (requiredSetIds.some((id) => !seen.has(id))) throw new ValidationError('Baz modelin gerekli seçeneklerini tamamlayın');
  if (base?.sourceRevision === HEX2026_REVISION) {
    const table = chosen.find(row => row.configurationKind === 'table');
    const power = chosen.find(row => row.configurationKind === 'power');
    if (table?.sourceModelCode) {
      const model = findHex2026Configuration(base.series, table.sourceModelCode);
      if (!model) throw new ValidationError('Eski ölçü seçeneği HEX 2026 kaynağıyla eşleşmiyor; güncel ölçüyü seçin');
      const bounds = hex2026PowerBounds(model);
      if (power?.powerKw != null && (!bounds || Number(power.powerKw) < bounds.min || Number(power.powerKw) > bounds.max)) throw new ValidationError('Bu ölçü ve güç birleşimi kaynak aralığı dışında');
    }
  }
  const configuration = compatibility.technicalConfiguration;
  if (base && configuration) {
    if (base.sourceRevision && configuration.selection.sourceRevision !== base.sourceRevision) throw new ValidationError('Teknik seçim baz modelin kaynak revizyonuyla eşleşmiyor');
    const resolved = resolveLaserProfile(configuration.selection);
    if (base.sourceRevision === HEX2026_REVISION && !resolved.standardCabin) throw new ValidationError('Kabin kaynakta doğrulanmadı; teknik bilgileri elle doğrulayın');
    if (!resolved.supportedPower) throw new ValidationError('Seçilen güç bu kaynak modelde desteklenmiyor; teknik bilgileri elle tanımlayın');
    const selection = configuration.selection;
    if (selection.series !== base.series || selection.productTypeCode !== base.productTypeCode || !base.sourceModelCodes.includes(selection.sourceModelCode)) {
      throw new ValidationError('Teknik seçim baz model ailesiyle eşleşmiyor');
    }
    for (const option of chosen) {
      if ((option.configurationKind === 'table' && option.sourceModelCode !== selection.sourceModelCode)
        || (option.configurationKind === 'power' && Number(option.powerKw) !== selection.powerKw)
        || (option.configurationKind === 'cabin' && option.cabinType !== selection.cabinType)) {
        throw new ValidationError('Teknik bilgiler seçilen opsiyonel donanımla eşleşmiyor');
      }
    }
  }
  let technicalSpecs = compatibility.technicalSpecs;
  if (universalBase) {
    const mapped = chosen.filter(row => row.sourceModelCode);
    const codes = [...new Set(mapped.map(row => row.sourceModelCode!))];
    if (codes.length > 1) throw new ValidationError('Seçilen ölçüler farklı makine konfigürasyonlarına ait');
    const model = codes[0] && universalBase.configurations.find(row => row.sourceModelCode === codes[0]);
    if (codes.length && !model) throw new ValidationError('Seçilen kaynak model baz makineye ait değil');
    const variableKeys = new Set(universalBase.variableSpecKeys);
    technicalSpecs = compatibility.technicalSpecs.filter(spec => !variableKeys.has(spec.key));
    if (model) technicalSpecs = [...technicalSpecs, ...model.specs.filter(spec => variableKeys.has(spec.key))];
  }
  return {
    ...compatibility,
    technicalSpecs,
    selectedProductOptions: chosen.map((row) => ({
      optionSetId: row.optionSetId, optionValueId: row.optionValueId,
      name: row.name, value: row.value, priceDelta: Number(row.priceDelta ?? 0), currencyCode: row.currencyCode ?? '',
    })),
  };
}

export interface ConfigurationPriceRow { sourceModelCode: string; powerKw: number; salePrice: string | number | null; currencyCode: string | null }

/**
 * Matrisli baz kartta model + güç fiyatı istemciden yalnız seçim olarak gelir:
 * satır matriste olmalı, satış fiyatı ve para birimi kayıtlı değerle aynı olmalı,
 * seçilen tabla/güç seçenekleriyle çelişmemeli. Fiyat girilmemişse seçim elle fiyatlanır.
 */
export function validateConfigurationPrice(
  compatibility: QuoteItemCompatibility,
  matrix: ConfigurationPriceRow[],
  chosen: Array<{ configurationKind: string | null; sourceModelCode: string | null; powerKw: string | number | null }>,
): QuoteItemCompatibility {
  const requested = compatibility.configurationPrice;
  if (!requested) return { ...compatibility, configurationPrice: null };
  if (!matrix.length) throw new ValidationError('Bu ürün için model × güç fiyatı tanımlı değil');
  const row = matrix.find((entry) => entry.sourceModelCode === requested.sourceModelCode && Number(entry.powerKw) === requested.powerKw);
  if (!row || row.salePrice === null || !row.currencyCode) throw new ValidationError('Seçilen model ve güç için satış fiyatı tanımlı değil');
  if (Number(row.salePrice) !== Number(requested.salePrice) || row.currencyCode !== requested.currencyCode) {
    throw new ValidationError('Model fiyatı değişti; model ve gücü yeniden seçin');
  }
  const table = chosen.find((option) => option.configurationKind === 'table');
  const power = chosen.find((option) => option.configurationKind === 'power');
  if ((table && table.sourceModelCode !== row.sourceModelCode) || (power && Number(power.powerKw) !== Number(row.powerKw))) {
    throw new ValidationError('Fiyat seçilen model ve güçle eşleşmiyor');
  }
  const selection = compatibility.technicalConfiguration?.selection;
  if (selection && (selection.sourceModelCode !== row.sourceModelCode || selection.powerKw !== Number(row.powerKw))) {
    throw new ValidationError('Teknik bilgiler seçilen model ve güçle eşleşmiyor');
  }
  return { ...compatibility, configurationPrice: { sourceModelCode: row.sourceModelCode, powerKw: Number(row.powerKw), salePrice: Number(row.salePrice), currencyCode: row.currencyCode } };
}
