import {
  LASER_MODELS,
  LASER_POWERS,
  laserTechnicalConfigurationSchema,
  resolveLaserProfile,
  type LaserCatalogModel,
  type LaserSelection,
  type LaserTechnicalConfiguration,
} from '@haksan/shared';

const CABINS = ['open', 'closed'] as const;

export const laserCabinLabel = (cabinType: LaserSelection['cabinType']) =>
  cabinType === 'open' ? 'Açık Kabin' : 'Kapalı Kabin';

export const hexlaserVariantCode = (selection: LaserSelection) =>
  `${selection.sourceModelCode}-${selection.cabinType === 'open' ? 'ACIK' : 'KAPALI'}-${selection.powerKw}KW`;

export const hexlaserVariantName = (selection: LaserSelection) =>
  `${selection.sourceModelCode} ${laserCabinLabel(selection.cabinType)} ${selection.powerKw} kW`;

export const hexlaserVariantFullName = (selection: LaserSelection) =>
  `${hexlaserVariantName(selection)} ${selection.productTypeCode === 'BORU_LAZER_KESIM' ? 'Boru/Profil Lazer Kesim' : 'Sac Lazer Kesim'}`;

export interface HexlaserCuttingVariant {
  model: LaserCatalogModel;
  configuration: LaserTechnicalConfiguration;
  modelCode: string;
  modelName: string;
  fullName: string;
}

/** One sellable product per source model, cabin and resonator power combination. */
export function hexlaserCuttingVariants(
  configurations: readonly LaserTechnicalConfiguration[] = LASER_MODELS.flatMap((model) =>
    CABINS.flatMap((cabinType) => LASER_POWERS.map((powerKw) => resolveLaserProfile({
      sourceModelCode: model.code,
      series: model.series,
      productTypeCode: model.productTypeCode,
      cabinType,
      powerKw,
    }))),
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
