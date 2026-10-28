import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useCustomerBalances } from '@/src/api/finance.hooks';
import { exportService } from '@/src/api/exports';
import type { AgingBucketCode, CustomerBalance } from '@/src/api/endpoints';
import { formatAmount, formatDate } from '@/src/lib/format';
import { toneColor, useTheme } from '@/src/theme/theme';
import { EmptyState, ErrorState, FilterChips, ListSkeleton, SCREEN_PAD, ScreenHeader, SearchBar, StatStrip } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { AgingHeatmap } from '@/src/ui/finance/AgingHeatmap';
import { KpiGrid, KpiTile, runExport } from '@/src/ui/finance/kit';
import { balanceKpis } from '@/src/ui/finance/balances-logic';

type Preset = 'debtor' | 'creditor' | 'risky';

const RISKY_BUCKETS = new Set<AgingBucketCode>(['d61_90', 'd90_plus']);
const isRisky = (row: CustomerBalance) => (row.aging ? RISKY_BUCKETS.has(row.aging.worstBucket) : false);

function BalanceRow({ row, onPress }: { row: CustomerBalance; onPress: () => void }) {
  const { colors } = useTheme();
  const nonZero = row.currencies.filter((item) => item.salesTotal || item.collections || item.borc || item.net);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.companyName} cari ekstre`}
      onPress={onPress}
      className="mb-2 gap-2 rounded-surface border border-border bg-card p-3 active:opacity-70"
      style={{ borderCurve: 'continuous' }}
    >
      <View className="flex-row items-center gap-2">
        <Ionicons name="business-outline" size={17} color={colors.primary} />
        <Text className="flex-1 font-inter-semibold text-[15px] text-foreground" numberOfLines={2}>
          {row.companyName}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
      </View>
      {nonZero.map((item) => (
        <View key={item.currencyCode} className="gap-2 rounded-control bg-muted p-3">
          <Text className="font-inter-semibold text-[13px] text-muted-foreground">{item.currencyCode}</Text>
          {([
            ['Satış', item.salesTotal, 'neutral'],
            ['Tahsilat', item.collections, 'neutral'],
            ['Açık borç', item.borc, item.borc > 0 ? 'warning' : 'neutral'],
            ['Net bakiye', item.net, item.net > 0 ? 'success' : item.net < 0 ? 'destructive' : 'neutral'],
          ] as const).map(([label, amount, tone]) => (
            <View key={label} className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <Text className="font-inter text-[13px] text-muted-foreground">{label}</Text>
              <Text className="font-inter-semibold text-[14px]" style={{ color: toneColor(colors, tone), fontVariant: ['tabular-nums'] }}>
                {formatAmount(amount, item.currencyCode)}
              </Text>
            </View>
          ))}
        </View>
      ))}
      <View className="gap-2">
        <View className="flex-1">
          <AgingHeatmap row={row} />
        </View>
        {row.nearestDueDate ? (
          <Text className="font-inter text-[13px] text-muted-foreground">
            En yakın vade: {formatDate(row.nearestDueDate)}
            {row.nearestDueAmount != null && row.nearestDueCurrency ? ` · ${formatAmount(row.nearestDueAmount, row.nearestDueCurrency)}` : ''}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Web `CustomerBalancesPage` (Cari Rapor). */
export default function BalancesScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<Preset | null>(null);
  const [exporting, setExporting] = useState(false);
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
      .sort((a, b) => a.companyName.localeCompare(b.companyName, 'tr'));
  }, [data, preset, search]);
  const kpis = useMemo(() => balanceKpis(rows), [rows]);
  const [firstDebt] = kpis.openDebt;
  const [firstOverdue] = kpis.overdueTotals;

  async function exportExcel() {
    setExporting(true);
    await runExport(() => exportService.customerBalances());
    setExporting(false);
  }

  const header = (
    <View className="gap-3 pb-2">
      <ScreenHeader
        title="Cari Rapor"
        subtitle="Müşteri ve tedarikçi bakiyelerini analiz edin."
        actions={[{ icon: exporting ? 'hourglass-outline' : 'download-outline', label: 'Excel', onPress: () => void exportExcel() }]}
      />
      <KpiGrid>
        {[
          <KpiTile key="companies" icon="business-outline" tone="stage" label="Kayıtlı Firma" value={String(kpis.companies)} sub="açık cari" />,
          <KpiTile
            key="debt"
            icon="trending-up-outline"
            tone="success"
            label="Açık Borç"
            value={firstDebt ? formatAmount(firstDebt.amount, firstDebt.currencyCode) : '—'}
            sub={kpis.openDebt.length > 1 ? `+${kpis.openDebt.length - 1} para birimi` : 'tahsilat sonrası'}
          />,
          <KpiTile
            key="overdue"
            icon="alert-circle-outline"
            tone="destructive"
            label="Gecikmiş"
            value={String(kpis.overdueCount)}
            sub={firstOverdue ? `${formatAmount(firstOverdue.amount, firstOverdue.currencyCode)} vadesi geçti` : 'aksiyon gerekli'}
            selected={preset === 'risky'}
            onPress={() => setPreset(preset === 'risky' ? null : 'risky')}
          />,
          <KpiTile key="soon" icon="calendar-outline" tone="info" label="7 Gün İçinde" value={String(kpis.dueSoonCount)} sub="yaklaşan vade" />,
        ]}
      </KpiGrid>
      {kpis.netByCurrency.length ? (
        <StatStrip
          items={kpis.netByCurrency.slice(0, 3).map((item) => ({
            label: `${item.currencyCode} net bakiye`,
            value: formatAmount(item.amount, item.currencyCode),
            tone: item.amount > 0 ? ('success' as const) : item.amount < 0 ? ('destructive' as const) : ('neutral' as const),
          }))}
        />
      ) : null}
      <View style={{ paddingHorizontal: SCREEN_PAD }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Firma ara..." />
      </View>
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
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      {isPending ? (
        <>
          <ScreenHeader title="Cari Rapor" />
          <ListSkeleton />
        </>
      ) : error ? (
        <>
          <ScreenHeader title="Cari Rapor" />
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        </>
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(row) => row.companyId}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: GLASS_TAB_BAR_HEIGHT + 32 }}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: SCREEN_PAD }}>
              <BalanceRow row={item} onPress={() => router.push(`/modules/balances/${item.companyId}` as Href)} />
            </View>
          )}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          ListEmptyComponent={<EmptyState title="Kayıt bulunamadı" hint="Aramayı veya filtreyi değiştirin." />}
        />
      )}
    </SafeAreaView>
  );
}
