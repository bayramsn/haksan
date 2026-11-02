import { useCostPricedItems, useUpdateSalePrices } from '@/src/api/products.hooks';
import type { CostPricedRow } from '@/src/api/products.api';
import { PriceRowsEditor } from '@/src/ui/products/PriceRowsEditor';

const filterOf = (row: CostPricedRow) => row.group;
const searchText = (row: CostPricedRow) => `${row.group} ${row.name}`;
const rowLabel = (row: CostPricedRow) => row.name;
const rowLines = (row: CostPricedRow) => [`Grup: ${row.group}`, row.kind === 'option' ? 'Baz kart opsiyonu' : 'Aksesuar kartı'];

/** Web `CostPricedItemsEditor`: lazer aksesuar kartları ve baz kart opsiyonları. */
export default function CostPricedItemsScreen() {
  return (
    <PriceRowsEditor<CostPricedRow>
      title="Aksesuar ve opsiyon satış fiyatları"
      description="Aksesuarın satış fiyatı ürün kartının liste fiyatına, opsiyonunki baz kartta teklife eklenen ek fiyata yazılır. Fiyatı girilmemiş opsiyon teklifte seçilemez."
      query={useCostPricedItems()}
      save={useUpdateSalePrices('costPriced')}
      filterLabel="Grup"
      filterOf={filterOf}
      searchPlaceholder="Kompresör, TG-6020"
      searchText={searchText}
      rowLabel={rowLabel}
      rowTitle={rowLabel}
      rowLines={rowLines}
    />
  );
}
