import { findHex2026Configuration, HEX2026_REVISION, HEX2026_SERIES } from '@haksan/shared';
import type { LaserBaseConfiguration } from './mock';
import type { ConfigurationSet, SelectedProductOption } from '../components/technical/ProductConfigurationOptions';

export function laserBaseQuoteContext(base: LaserBaseConfiguration, sets: ConfigurationSet[], selected: SelectedProductOption[]) {
  const choice = (kind: string) => {
    const set = sets.find(row => row.configurationKind === kind);
    return set?.values.find(row => selected.some(snapshot => snapshot.optionSetId === set.id && snapshot.optionValueId === row.id));
  };
  const table = choice('table');
  const power = choice('power');
  const cabin = choice('cabin');
  const isHex2026 = base.sourceRevision === HEX2026_REVISION;
  const configuration = isHex2026 && table?.sourceModelCode ? findHex2026Configuration(base.series, table.sourceModelCode) : undefined;
  if (isHex2026 && table?.sourceModelCode && !configuration) throw new Error('Kaynak model HEX 2026 serisiyle eşleşmiyor.');
  const cabinType = cabin?.cabinType ?? (!sets.some(set => set.configurationKind === 'cabin') && isHex2026
    ? HEX2026_SERIES.find(row => row.series === base.series)?.standardCabin : null);
  return { table, power, cabinType, configuration, isHex2026 };
}

/**
 * Seçilen alt modelin teklif satırına basılacak teknik bilgileri: PDF'te doğrulanmış alanlar ve
 * AORE 2026 kitabından gelen alanlar. Güce bağlı satırlar ("3 kW: …") seçilen güce indirgenir;
 * seçilen güç için değer yoksa alan basılmaz (başka gücün değeri gösterilmez).
 */
export function hexConfigurationQuoteSpecs(configuration: { fields: Array<{ key: string; rawValue: string; verification: string }> }, powerKw?: number | null) {
  const label = powerKw == null ? undefined : `${String(powerKw).replace('.', ',')} kW: `;
  return configuration.fields
    .filter(field => (field.verification === 'verified' || field.verification === 'aore_excel') && field.key !== 'Lazer Gücü')
    .map(field => {
      const lines = field.rawValue.split('\n');
      const perPower = lines.filter(line => /^\d+(?:,\d+)? kW: /.test(line));
      if (!perPower.length || !label) return { key: field.key, value: field.rawValue };
      const hit = perPower.find(line => line.startsWith(label));
      return { key: field.key, value: hit ? hit.slice(label.length).trim() : '' };
    })
    .filter(spec => spec.value.trim())
    .concat(powerKw == null ? [] : [{ key: 'Lazer Gücü', value: `${String(powerKw).replace('.', ',')} kW` }]);
}
