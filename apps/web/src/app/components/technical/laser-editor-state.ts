import { laserTechnicalConfigurationSchema, type LaserSelection, type LaserSpec, type LaserTechnicalConfiguration } from '@haksan/shared';

export type LaserDraftScope = { tenantId: string; divisionId: string; brandId: string; draftScope: string };

export function laserSelectionKey(selection: Partial<LaserSelection>) {
  return [selection.productTypeCode, selection.series, selection.cabinType, selection.powerKw, selection.sourceModelCode].join('|');
}

export function laserDraftKey(scope: LaserDraftScope, selection: Partial<LaserSelection>) {
  return `haksan:laser-profile:${JSON.stringify([scope.tenantId, scope.divisionId, scope.brandId, scope.draftScope, laserSelectionKey(selection)])}`;
}

/** Dropping descendants prevents values from one machine combination leaking into the next. */
export function changeLaserSelection(selection: Partial<LaserSelection>, field: keyof LaserSelection, value: string): Partial<LaserSelection> {
  if (field === 'productTypeCode') return { productTypeCode: value as LaserSelection['productTypeCode'] };
  if (field === 'series') return { productTypeCode: selection.productTypeCode, series: value ? value as LaserSelection['series'] : undefined };
  if (field === 'cabinType') return { productTypeCode: selection.productTypeCode, series: selection.series, cabinType: value ? value as LaserSelection['cabinType'] : undefined };
  if (field === 'powerKw') return { productTypeCode: selection.productTypeCode, series: selection.series, cabinType: selection.cabinType, powerKw: value ? Number(value) as LaserSelection['powerKw'] : undefined };
  return { ...selection, sourceModelCode: value || undefined };
}

export function readLaserDraft(storage: Pick<Storage, 'getItem'>, key: string, selection: LaserSelection): LaserTechnicalConfiguration | null {
  try {
    const result = laserTechnicalConfigurationSchema.safeParse(JSON.parse(storage.getItem(key) ?? 'null'));
    return result.success && laserSelectionKey(result.data.selection) === laserSelectionKey(selection) ? result.data : null;
  } catch { return null; }
}

export function editLaserSpec(spec: LaserSpec, value: string): LaserSpec {
  const sourceValue = spec.sourceValue ?? (spec.isManual ? '' : spec.value);
  const sourceUnit = spec.sourceUnit ?? spec.unit;
  return { ...spec, value, sourceValue, sourceUnit, isManual: value !== sourceValue || spec.unit !== sourceUnit };
}

export function resetLaserSpec(spec: LaserSpec): LaserSpec {
  return { ...spec, value: spec.sourceValue ?? '', unit: spec.sourceUnit ?? spec.unit, isManual: false };
}
