import { Text, View } from 'react-native';
import { formatAmount } from '@/src/lib/format';
import { toneColor, useTheme } from '@/src/theme/theme';
import { AGING_BUCKETS, agingState, bucketTotal, type AgingKey, type AgingTone } from './balances-logic';

type AgingRow = {
  aging: {
    byCurrency: (Record<AgingKey, number> & { currencyCode: string; openTotal: number })[];
    worstBucket: AgingKey;
    maxOverdueDays: number;
    overdueTotal: { currencyCode: string; amount: number }[];
  } | null;
};

const TONE = { success: 'success', warning: 'warning', danger: 'destructive' } as const satisfies Record<AgingTone, string>;

/** Web `AgingHeatmap`: 5 kova çubuğu, en kötü kova etiketi ve gecikmiş tutarlar. */
export function AgingHeatmap({ row }: { row: AgingRow }) {
  const { colors } = useTheme();
  const state = agingState(row);
  const overdue = row.aging?.overdueTotal ?? [];
  return (
    <View accessibilityLabel={`Yaşlandırma durumu: ${state.label}`} className="gap-1">
      <View className="flex-row gap-1">
        {AGING_BUCKETS.map((bucket, index) => {
          const filled = bucketTotal(row.aging, bucket.key) > 0;
          return (
            <View
              key={bucket.key}
              className="h-1.5 flex-1 rounded-full"
              style={{
                backgroundColor: filled ? toneColor(colors, TONE[bucket.tone]) : colors.muted,
                opacity: filled && index !== state.index ? 0.55 : 1,
              }}
            />
          );
        })}
      </View>
      <Text className="font-inter-medium text-[11px]" style={{ color: toneColor(colors, TONE[state.tone]) }}>
        {state.label}
      </Text>
      {overdue.map((item) => (
        <Text key={item.currencyCode} className="font-inter text-[10px] text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
          {formatAmount(item.amount, item.currencyCode)} gecikmiş
        </Text>
      ))}
    </View>
  );
}
