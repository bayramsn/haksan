import type { ProductSpec } from "../mock";
import { normalizeProductSpecKey } from "../productSpecTemplates";

export type SelectedTechnicalEquipment = {
  title: string;
  description?: string | null;
  specs?: ProductSpec[];
  specDefaults?: Array<{ specKey: string; defaultValue: string }>;
};

type EquipmentSpecDto = {
  key?: string | null; specKey?: string | null;
  value?: string | number | null; specValue?: string | number | null;
  unit?: string | null; specUnit?: string | null;
  groupCode?: string | null; specGroupCode?: string | null; groupName?: string | null;
};

/** Detail endpoints can return database spec names while catalogue state uses
 * key/value. Snapshot values remain authoritative when present, even if empty.
 */
export const optionalSpecsFromProductDetail = (detail: {
  specs?: EquipmentSpecDto[] | null;
  technicalConfiguration?: { specs?: EquipmentSpecDto[] | null } | null;
}): ProductSpec[] => (detail.technicalConfiguration?.specs ?? detail.specs ?? [])
  .map((spec) => ({
    key: String(spec.key ?? spec.specKey ?? "").trim(),
    value: String(spec.value ?? spec.specValue ?? "").trim(),
    unit: (spec.unit ?? spec.specUnit)?.trim() || undefined,
    specUnit: (spec.unit ?? spec.specUnit)?.trim() || undefined,
    groupCode: (spec.groupCode ?? spec.specGroupCode)?.trim() || undefined,
    groupName: spec.groupName?.trim() || undefined,
  }))
  .filter((spec) => Boolean(spec.key));

/** Apply only selected equipment to existing machine fields, using the same
 * value priority as quote options: equipment's own value, then type default.
 * The catalogue remains immutable, so deselecting restores the original values.
 */
export const applyOptionalEquipmentSpecs = (
  baseSpecs: readonly ProductSpec[],
  selectedEquipment: readonly SelectedTechnicalEquipment[],
): ProductSpec[] => selectedEquipment.reduce((specs, equipment) => specs.map((spec) => {
  const key = normalizeProductSpecKey(spec.key);
  const own = equipment.specs?.find((candidate) => normalizeProductSpecKey(candidate.key) === key)?.value?.trim();
  const fallback = equipment.specDefaults?.find((candidate) => normalizeProductSpecKey(candidate.specKey) === key)?.defaultValue?.trim();
  const value = [own, fallback].find((candidate) => candidate && !/^[-–—]+$/.test(candidate));
  return value ? { ...spec, value } : spec;
}), baseSpecs.map((spec) => ({ ...spec })));
