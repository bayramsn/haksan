import { displayLaserSourceValue, type LaserSourceField } from '@haksan/shared';

/** Before a power is selected, preserve every condition rather than choosing a variant. */
export function catalogProductSpecs(fields: readonly LaserSourceField[], modelCode?: string) {
  const specs = new Map<string, { key: string; value: string; unit?: string; groupCode: string }>();
  for (const field of fields) {
    let value = displayLaserSourceValue(field.rawValue);
    // GR and Pro are separate source models. Their motor/electrical cells share
    // a column, but the variant is known before a laser power is selected.
    if (modelCode && /^GR\d{4}(?:Pro)?-\d+$/i.test(modelCode)) {
      const variants = value.split('\n').map((line) => line.match(/^GR([- ]?Pro)?\s*[:：]\s*(.+)$/i)).filter((entry): entry is RegExpMatchArray => Boolean(entry));
      if (variants.length) value = variants.find((entry) => Boolean(entry[1]) === /Pro/i.test(modelCode))?.[2] ?? '';
    }
    if (field.powerKw !== undefined) {
      value = value.split('\n').map((line) => {
        const electrical = line.match(/^\s*(?:(.*?)\s*[:：]\s*)?([\d.,]+)\s*kw\s*\/\s*([\d.,]+)\s*kva\s*$/i);
        // Unknown electrical text cannot safely become either a kW or kVA
        // value. Keep its power branch visible as an explicitly missing value.
        if (!electrical) return `${field.powerKw} kW: —`;
        const amount = electrical[field.key === 'Trafo Kapasitesi' ? 3 : 2].replace(',', '.');
        const variant = electrical[1]?.trim();
        return `${field.powerKw} kW: ${variant ? `${variant}: ` : ''}${amount}`;
      }).join('\n');
    }
    const previous = specs.get(field.key);
    if (previous) {
      if (!previous.value.split('\n').includes(value)) previous.value += `\n${value}`;
    } else specs.set(field.key, { key: field.key, value, unit: field.unit, groupCode: field.groupCode });
  }
  return [...specs.values()];
}
