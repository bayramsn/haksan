import { displayLaserSourceValue, type LaserSourceField } from '@haksan/shared';

/** Before a power is selected, preserve every condition rather than choosing a variant. */
export function catalogProductSpecs(fields: readonly LaserSourceField[]) {
  const specs = new Map<string, { key: string; value: string; unit?: string; groupCode: string }>();
  for (const field of fields) {
    let value = displayLaserSourceValue(field.rawValue);
    if (field.powerKw !== undefined) {
      const electrical = value.match(/^\s*([\d.,]+)\s*kw\s*\/\s*([\d.,]+)\s*kva\s*$/i);
      if (electrical) value = electrical[field.key === 'Trafo Kapasitesi' ? 2 : 1].replace(',', '.');
      value = `${field.powerKw} kW: ${value}`;
    }
    const previous = specs.get(field.key);
    if (previous) {
      if (!previous.value.split('\n').includes(value)) previous.value += `\n${value}`;
    } else specs.set(field.key, { key: field.key, value, unit: field.unit, groupCode: field.groupCode });
  }
  return [...specs.values()];
}
