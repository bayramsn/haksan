import { useConfigurationPrices, useUpdateSalePrices } from '@/src/api/products.hooks';
import type { ConfigurationPriceRow } from '@/src/api/products.api';
import { PriceRowsEditor } from '@/src/ui/products/PriceRowsEditor';

const filterOf = (row: ConfigurationPriceRow) => row.series ?? '';
const filterOptionLabel = (value: string) => `${value} Serisi`;
const searchText = (row: ConfigurationPriceRow) => `${row.sourceModelCode} ${row.baseName}`;
const rowLabel = (row: ConfigurationPriceRow) => `${row.sourceModelCode} ${row.powerKw} kW`;
const rowTitle = (row: ConfigurationPriceRow) => `${row.sourceModelCode} · ${row.powerKw.toLocaleString('tr-TR')} kW`;
const rowLines = (row: ConfigurationPriceRow) => [
  `Seri: ${row.series ?? '—'}`,
  `Üretim: ${row.leadTimeDays == null ? '—' : `${row.leadTimeDays} gün`}`,
];

/** Web `ConfigurationPriceEditor`: baz kartların model × güç satırlarına satış fiyatı. */
export default function ConfigurationPricesScreen() {
  return (
    <PriceRowsEditor<ConfigurationPriceRow>
      title="Model × güç satış fiyatları"
      description="Teklifte model ve güç seçilince birim fiyat buradaki satış fiyatından gelir. Fiyatı boş satırlar teklifte elle fiyatlanır."
      query={useConfigurationPrices()}
      save={useUpdateSalePrices('configuration')}
      filterLabel="Seri"
      filterOf={filterOf}
      filterOptionLabel={filterOptionLabel}
      searchPlaceholder="F-3015"
      searchText={searchText}
      rowLabel={rowLabel}
      rowTitle={rowTitle}
      rowLines={rowLines}
    />
  );
}
