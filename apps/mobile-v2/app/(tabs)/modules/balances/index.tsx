import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCustomerBalances } from '@/src/api/finance.hooks';
import type { AgingBucketCode, CustomerBalance, CustomerBalanceCurrencyAging } from '@/src/api/endpoints';
import { formatAmount, formatDate } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import {
  ListSkeleton,
  EmptyState,
  ErrorState,
  FilterChips,
  ListRow,
  Loading,
  ScreenHeader,
  SearchBar,
  StatStrip,
} from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';

type Preset = 'debtor' | 'creditor' | 'risky';

// "current" vadesi gelmemiş demek, gecikme değil — yaşlandırma satırında gösterilmez.
const OVERDUE_BUCKETS: Exclude<AgingBucketCode, 'current'>[] = ['d1_30', 'd31_60', 'd61_90', 'd90_plus'];
const BUCKET_LABEL: Record<Exclude<AgingBucketCode, 'current'>, string> = {
  d1_30: '1-30g',
  d31_60: '31-60g',
  d61_90: '61-90g',
  d90_plus: '90g+',
};
// "Riskli": en kötü kovası 61 günden fazla gecikmiş cariler.
const RISKY_BUCKETS = new Set<AgingBucketCode>(['d61_90', 'd90_plus']);

/** Satırdaki yaşlandırma kovaları özeti: "Gecikme: 1-30g ₺12.450 · 61-90g ₺3.000". */
function agingLine(row: CustomerBalance): string | null {
  const parts = (row.aging?.byCurrency ?? []).flatMap((cur: CustomerBalanceCurrencyAging) =>
    OVERDUE_BUCKETS.filter((key) => cur[key] > 0).map(
      (key) => `${BUCKET_LABEL[key]} ${formatAmount(cur[key], cur.currencyCode)}`,
    ),
  );
  return parts.length ? `Gecikme: ${parts.join(' · ')}` : null;
}

function isRisky(row: CustomerBalance): boolean {
  return row.aging ? RISKY_BUCKETS.has(row.aging.worstBucket) : false;
}

export default function BalancesScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<Preset | null>(null);

  const { data, isPending, isRefetching, error, refetch } = useCustomerBalances();

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr');
    return (data ?? [])
      .filter((row) => {
        if (preset === 'debtor' && !row.currencies.some((currency) => currency.totalBalance > 0)) return false;
        if (preset === 'creditor' && !row.currencies.some((currency) => currency.totalBalance < 0)) return false;
        if (preset === 'risky' && !isRisky(row)) return false;
        return !term || row.companyName.toLocaleLowerCase('tr').includes(term);
      })
      // Farklı para birimlerinin mutlak tutarlarını karşılaştırmak anlamlı değildir.
      .sort((a, b) => a.companyName.localeCompare(b.companyName, 'tr'));
  }, [data, preset, search]);

  const totals = useMemo(() => {
    const byCurrency = new Map<string, { debt: number; credit: number }>();
    for (const row of data ?? []) {
      for (const currency of row.currencies) {
        const total = byCurrency.get(currency.currencyCode) ?? { debt: 0, credit: 0 };
        if (currency.totalBalance > 0) total.debt += currency.totalBalance;
        if (currency.totalBalance < 0) total.credit += Math.abs(currency.totalBalance);
        byCurrency.set(currency.currencyCode, total);
      }
    }
    return [...byCurrency.entries()].sort(([a], [b]) => (a === 'TRY' ? -1 : b === 'TRY' ? 1 : a.localeCompare(b)));
  }, [data]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Cari Rapor" subtitle="Müşteri ve tedarikçi bakiyelerini analiz edin." />

      {totals.map(([currencyCode, total]) => (
        <StatStrip
          key={currencyCode}
          items={[
            { label: `${currencyCode} alacak`, value: formatAmount(total.debt, currencyCode), tone: 'success' },
            { label: `${currencyCode} borç`, value: formatAmount(total.credit, currencyCode), tone: 'destructive' },
            {
              label: `${currencyCode} net`,
              value: formatAmount(total.debt - total.credit, currencyCode),
              tone: total.debt >= total.credit ? 'success' : 'destructive',
            },
          ]}
        />
      ))}

      <View className="gap-2 py-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Cari adı ara" />
        <FilterChips
          options={[
            { value: 'debtor' as const, label: 'Alacaklı' },
            { value: 'creditor' as const, label: 'Borçlu' },
            { value: 'risky' as const, label: 'Riskli' },
          ]}
          value={preset}
          onChange={setPreset}
        />
      </View>

      {isPending ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(row) => row.companyId}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }) => {
            const positive = item.currencies.some((currency) => currency.totalBalance > 0);
            const negative = item.currencies.some((currency) => currency.totalBalance < 0);
            const tone: Tone = positive && negative ? 'warning' : positive ? 'success' : 'destructive';
            const balanceLabel = item.currencies
              .filter((currency) => currency.totalBalance !== 0)
              .map((currency) => formatAmount(currency.totalBalance, currency.currencyCode))
              .join(' · ') || formatAmount(0, item.primaryCurrency ?? 'TRY');
            const salesLine = item.currencies
              .map(
                (currency) =>
                  `${currency.currencyCode}: Satış ${formatAmount(currency.salesTotal, currency.currencyCode)} · Tahsilat ${formatAmount(currency.collections, currency.currencyCode)}`,
              )
              .join(' | ');
            return (
              <ListRow
                title={item.companyName}
                lines={[
                  item.nearestDueDate ? `En yakın vade: ${formatDate(item.nearestDueDate)}` : null,
                  agingLine(item),
                  salesLine || null,
                ]}
                icon="business-outline"
                iconTone={tone}
                chip={{ label: positive && negative ? 'Karma' : positive ? 'Alacaklı' : 'Borçlu', tone }}
                trailing={balanceLabel}
                trailingTone={tone}
                onPress={() => router.push(`/(tabs)/modules/companies/${item.companyId}`)}
              />
            );
          }}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          ListEmptyComponent={<EmptyState title="Cari kaydı bulunamadı" hint="Aramayı veya filtreyi değiştirin." />}
        />
      )}
    </SafeAreaView>
  );
}
