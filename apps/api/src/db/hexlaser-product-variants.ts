import {
  LASER_MODELS,
  LASER_POWERS,
  laserTechnicalConfigurationSchema,
  resolveLaserProfile,
  type LaserCatalogModel,
  type LaserSelection,
  type LaserTechnicalConfiguration,
} from '@haksan/shared';

export const laserCabinLabel = (cabinType: LaserSelection['cabinType']) =>
  cabinType === 'open' ? 'Açık Kabin' : 'Kapalı Kabin';

/**
 * Ürün kartı model başına tektir; kabin ve güç satış anında (teklif satırında) seçilir ve
 * güce bağlı alanlar katalogdan yeniden çözülür. Kart kodu bu yüzden modelin kendi kodudur.
 */
export const hexlaserVariantCode = (selection: LaserSelection) => selection.sourceModelCode;

export const hexlaserVariantName = (selection: LaserSelection) => selection.sourceModelCode;

export const hexlaserVariantFullName = (selection: LaserSelection) =>
  `${selection.sourceModelCode} ${selection.productTypeCode === 'BORU_LAZER_KESIM' ? 'Boru/Profil Lazer Kesim' : 'Sac Lazer Kesim'}`;

/** Model başına açılmış kabin/güç varyant kartlarını tanır: "PG3015-KAPALI-12KW". */
export const hexlaserLegacyVariantCode = (modelCode: string, code: string) =>
  new RegExp(`^${modelCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(?:ACIK|KAPALI)-[0-9.]+KW$`).test(code);

export interface HexlaserCuttingVariant {
  model: LaserCatalogModel;
  configuration: LaserTechnicalConfiguration;
  modelCode: string;
  modelName: string;
  fullName: string;
}

/** One sellable product per source model. Cabin and power are chosen on the quote line. */
export function hexlaserCuttingVariants(
  configurations: readonly LaserTechnicalConfiguration[] = LASER_MODELS.map((model) =>
    resolveLaserProfile(canonicalLaserVariantSelection(model)),
  ),
): HexlaserCuttingVariant[] {
  const models = new Map(LASER_MODELS.map((model) => [model.code, model]));
  return configurations.map((input) => {
    const configuration = laserTechnicalConfigurationSchema.parse(input);
    const model = models.get(configuration.selection.sourceModelCode);
    if (!model || model.series !== configuration.selection.series || model.productTypeCode !== configuration.selection.productTypeCode) {
      throw new Error('Lazer ürün varyantı kaynak modelle eşleşmiyor');
    }
    return {
      model,
      configuration,
      modelCode: hexlaserVariantCode(configuration.selection),
      modelName: hexlaserVariantName(configuration.selection),
      fullName: hexlaserVariantFullName(configuration.selection),
    };
  });
}

export function canonicalLaserVariantSelection(model: LaserCatalogModel): LaserSelection {
  return {
    sourceModelCode: model.code,
    series: model.series,
    productTypeCode: model.productTypeCode,
    cabinType: model.standardCabin ?? 'open',
    powerKw: LASER_POWERS.find((power) => power >= model.powerMin && power <= model.powerMax) ?? LASER_POWERS[0],
  };
}
