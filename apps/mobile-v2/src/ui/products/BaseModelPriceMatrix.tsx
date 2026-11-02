import { Text, View } from 'react-native';
import { useProductConfigurationPrices } from '@/src/api/products.hooks';
import { Card } from '@/src/ui';
import { groupPriceRows, matrixPriceLists } from '@/src/ui/documents/quote-configuration';

const CURRENCY_LABEL: Record<string, string> = { USD: 'USD', EUR: 'EUR', TRY: 'TL' };
const money = (value: number | null | undefined, currency: string | null | undefined) =>
  value == null
    ? '—'
    : `${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${CURRENCY_LABEL[currency ?? ''] ?? currency ?? ''}`.trim();

/**
 * Web `BaseModelPriceMatrix`: baz kartın alt model × lazer gücü fiyatları (salt okunur).
 * Alış maliyeti yalnız `product_costs.view` sahibine API'den gelir; fiyat girilmemişse "—".
 */
export function BaseModelPriceMatrix({ productId, modelOrder }: { productId: string; modelOrder?: readonly string[] }) {
  const matrix = useProductConfigurationPrices(productId);
  const body = matrix.isPending ? (
    <Text className="font-inter text-xs text-muted-foreground">Model ve güç fiyatları yükleniyor…</Text>
  ) : matrix.error || !matrix.data ? (
    <Text className="font-inter text-xs text-muted-foreground">Model ve güç fiyatları yüklenemedi.</Text>
  ) : !matrix.data.rows.length ? (
    <Text className="font-inter text-xs text-muted-foreground">Bu baz kart için model × güç fiyatı tanımlı değil.</Text>
  ) : null;

  const data = matrix.data;
  const lists = data ? matrixPriceLists(data.rows) : [];
  return (
    <Card className="gap-3">
      <Text accessibilityRole="header" className="font-inter-semibold text-[15px] text-foreground" style={{ letterSpacing: 0 }}>
        Modeller ve Güç Seçenekleri{modelOrder?.length ? ` (${modelOrder.length})` : ''}
      </Text>
      {body ??
        groupPriceRows(data!.rows, modelOrder).map((group) => (
          <View key={group.model} className="gap-1.5">
            <Text className="font-inter-semibold text-[13px] text-foreground">{group.model}</Text>
            {group.rows.map((row) => {
              const cells: Array<{ label: string; value: string; sub?: string }> = [
                ...(data!.canViewCost ? [{ label: 'Alış maliyeti', value: money(row.costPrice, row.costCurrencyCode) }] : []),
                ...(lists.length
                  ? lists.map((list) => {
                      const price = row.listPrices?.find((entry) => entry.code === list.code);
                      return { label: list.name, value: money(price?.listPrice, 'USD'), sub: price ? `son ${money(price.cashPrice, 'USD')}` : undefined };
                    })
                  : [{ label: 'Satış fiyatı', value: money(row.salePrice, row.saleCurrencyCode) }]),
                { label: 'Üretim süresi', value: row.leadTimeDays == null ? '—' : `${row.leadTimeDays} gün` },
                { label: 'Konteyner', value: row.container ?? '—' },
              ];
              const power = `${row.powerKw.toLocaleString('tr-TR')} kW`;
              return (
                <View
                  key={row.id}
                  accessible
                  accessibilityLabel={`${group.model} ${power}: ${cells.map((cell) => `${cell.label} ${cell.value}${cell.sub ? `, ${cell.sub}` : ''}`).join('; ')}`}
                  className="gap-2 rounded-control border border-border bg-card-subtle p-3"
                >
                  <Text className="font-inter-medium text-[13px] text-foreground" style={{ fontVariant: ['tabular-nums'] }}>{power}</Text>
                  <View className="flex-row flex-wrap gap-x-3 gap-y-2">
                    {cells.map((cell) => (
                      <View key={cell.label} className="min-w-[44%] flex-1 gap-0.5">
                        <Text className="font-inter text-[11px] text-muted-foreground">{cell.label}</Text>
                        <Text className="font-inter-semibold text-[13px] text-foreground" style={{ fontVariant: ['tabular-nums'] }}>{cell.value}</Text>
                        {cell.sub ? <Text className="font-inter text-[11px] text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>{cell.sub}</Text> : null}
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
    </Card>
  );
}
