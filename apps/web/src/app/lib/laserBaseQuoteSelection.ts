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
