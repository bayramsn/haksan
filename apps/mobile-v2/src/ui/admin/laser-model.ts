// Lazer teknik profil düzenleyicisinin saf mantığı (web laser-editor-state + LaserConfigurationEditor).
import type { LaserSelection, LaserSpec, LaserTechnicalConfiguration } from '@haksan/shared';

export type PartialLaserSelection = Partial<LaserSelection>;

export const LASER_PRODUCT_TYPES = [
  { value: 'FIBER_LAZER_KESIM', label: 'Sac Lazer Kesim' },
  { value: 'BORU_LAZER_KESIM', label: 'Boru/Profil Lazer Kesim' },
] as const;

export const LASER_CABINS = [
  { value: 'open', label: 'Açık' },
  { value: 'closed', label: 'Kapalı' },
] as const;

/** Paylaşılan `LASER_POWERS` ile aynı; seçenek uç noktası yanıt vermezse kullanılır. */
export const LASER_POWERS_FALLBACK = [1.5, 2, 3, 6, 12, 20, 30] as const;

export const LASER_MAX_SPECS = 150;
export const LASER_POWER_KEY = 'Lazer Gücü';

/** Web/shared `isSupportedLaserBrand` eşdeğeri. */
export const isLaserCatalogBrand = (brand: { name?: string | null; technicalCatalogCode?: string | null; isActive?: boolean }) =>
  brand.isActive !== false && (brand.technicalCatalogCode === 'AORE_LASER' || /\b(?:hex\s*laser|aore)\b/i.test(brand.name ?? ''));

export const laserSelectionKey = (selection: PartialLaserSelection) =>
  [selection.productTypeCode, selection.series, selection.cabinType, selection.powerKw, selection.sourceModelCode].join('|');

/** Üst seçim değişince alt seçimler düşer; böylece değerler başka kombinasyona sızmaz. */
export function changeLaserSelection(selection: PartialLaserSelection, field: keyof LaserSelection, value: string): PartialLaserSelection {
  if (field === 'productTypeCode') return { productTypeCode: value as LaserSelection['productTypeCode'] };
  if (field === 'series') return { productTypeCode: selection.productTypeCode, series: value ? (value as LaserSelection['series']) : undefined };
  if (field === 'cabinType')
    return { productTypeCode: selection.productTypeCode, series: selection.series, cabinType: value ? (value as LaserSelection['cabinType']) : undefined };
  if (field === 'powerKw')
    return {
      productTypeCode: selection.productTypeCode,
      series: selection.series,
      cabinType: selection.cabinType,
      powerKw: value ? (Number(value) as LaserSelection['powerKw']) : undefined,
    };
  return { ...selection, sourceModelCode: value || undefined };
}

/** Sunucu zod doğrulamasından önce istemci tarafı tamlık kontrolü. */
export function completeLaserSelection(selection: PartialLaserSelection): LaserSelection | null {
  const { productTypeCode, series, cabinType, powerKw, sourceModelCode } = selection;
  if (!productTypeCode || !series || !cabinType || !powerKw || !sourceModelCode) return null;
  return selection as LaserSelection;
}

export function editLaserSpec(spec: LaserSpec, value: string): LaserSpec {
  const sourceValue = spec.sourceValue ?? (spec.isManual ? '' : spec.value);
  const sourceUnit = spec.sourceUnit ?? spec.unit;
  return {
    ...spec,
    value,
    sourceValue,
    sourceUnit,
    sourceGroupCode: spec.sourceGroupCode ?? spec.groupCode,
    isManual: value !== sourceValue || spec.unit !== sourceUnit,
  };
}

export function editLaserField(spec: LaserSpec, patch: Partial<Pick<LaserSpec, 'key' | 'unit' | 'groupCode'>>): LaserSpec {
  return {
    ...spec,
    sourceValue: spec.sourceValue ?? (spec.isManual ? '' : spec.value),
    sourceUnit: spec.sourceUnit ?? spec.unit,
    sourceGroupCode: spec.sourceGroupCode ?? spec.groupCode,
    ...patch,
    isManual: true,
  };
}

export function resetLaserSpec(spec: LaserSpec): LaserSpec {
  return { ...spec, value: spec.sourceValue ?? '', unit: spec.sourceUnit ?? spec.unit, groupCode: spec.sourceGroupCode ?? spec.groupCode, isManual: false };
}

export function moveLaserSpec(specs: LaserSpec[], index: number, step: -1 | 1): LaserSpec[] {
  const target = index + step;
  if (index < 0 || target < 0 || target >= specs.length) return specs;
  const next = [...specs];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}

export function addLaserSpec(specs: LaserSpec[]): LaserSpec[] {
  if (specs.length >= LASER_MAX_SPECS) return specs;
  let number = 1;
  while (specs.some((spec) => spec.key === `Yeni teknik bilgi ${number}`)) number++;
  return [...specs, { key: `Yeni teknik bilgi ${number}`, value: '', unit: '', groupCode: 'GENEL', sourceValue: '', isManual: true }];
}

export const removeLaserSpec = (specs: LaserSpec[], index: number) =>
  specs[index]?.key === LASER_POWER_KEY ? specs : specs.filter((_, i) => i !== index);

export function laserCounts(configuration: Pick<LaserTechnicalConfiguration, 'specs'> | null) {
  const specs = configuration?.specs ?? [];
  return {
    source: specs.filter((spec) => spec.value.trim() && !spec.isManual).length,
    manual: specs.filter((spec) => spec.isManual).length,
    missing: specs.filter((spec) => !spec.value.trim()).length,
  };
}

export const cabinLabel = (cabin?: string) => (cabin === 'open' ? 'Açık' : 'Kapalı');
export const powerLabel = (power: number) => `${String(power).replace('.', ',')} kW`;

export function laserCabinHint(
  selection: PartialLaserSelection,
  models: { standardCabin?: string | null }[]
): string {
  if (selection.productTypeCode === 'BORU_LAZER_KESIM') return 'Kesim bölgesi koruması; boru besleme alanını kapsamaz.';
  if (selection.series === 'F') return 'Katalog: açık kabin, tek tabla.';
  if (selection.series === 'PG') return 'Katalog: kapalı kabin, değişimli çift tabla.';
  if (models.length && models.every((model) => model.standardCabin === 'open')) return 'Kaynak: açık kabin.';
  if (models.length && models.every((model) => model.standardCabin === 'closed')) return 'Kaynak: kapalı kabin.';
  return 'Kaynakta kabin eşlemesi doğrulanmayan modellerin ilgili alanları elle tamamlanır.';
}

export const laserSeriesOptions = (models: { series: string; productTypeCode: string }[], productTypeCode?: string) => [
  ...new Set(models.filter((model) => model.productTypeCode === productTypeCode).map((model) => model.series)),
];

export const isLaserImportFile = (name: string) => /\.xlsx$/i.test(name.trim());
