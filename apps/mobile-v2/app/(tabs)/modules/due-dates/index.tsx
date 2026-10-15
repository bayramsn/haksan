import { useMemo, useState } from 'react';
import { SectionList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useDueDates } from '@/src/api/finance.hooks';
import type { DueDateItem } from '@/src/api/endpoints';
import { dayLabel, dueLabel, formatAmount } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { EmptyState, ErrorState, FilterChips, ListRow, ListSkeleton, ScreenHeader, StatStrip } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';

type Preset = 'overdue' | 'borc' | 'alacak';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'overdue', label: 'Geciken' },
  { value: 'borc', label: 'Tahsilat' },
  { value: 'alacak', label: 'Ödeme' },
];

export default function DueDatesScreen() {
  const router = useRouter();
  const [preset, setPreset] = useState<Preset | null>(null);

  // Varsayılan pencere: 30 gün geriye (gecikmişler), 90 gün ileriye.
  const range = useMemo(() => {
    const now = Date.now();
    return {
      from: new Date(now - 30 * 86_400_000).toISOString(),
      to: new Date(now + 90 * 86_400_000).toISOString(),
    };
  }, []);

  const { data, isPending, isRefetching, error, refetch } = useDueDates(range);

  const items = useMemo(() => {
    const all = data ?? [];
    if (!preset) return all;
    if (preset === 'overdue') return all.filter((row) => dueLabel(row.dueDate)?.overdue);
    return all.filter((row) => row.type === preset);
  }, [data, preset]);

  // Sunucu vade tarihine göre sıralı döndürüyor; ardışık aynı günler birleştirilir.
  const sections = useMemo(() => {
    const out: { title: string; data: DueDateItem[] }[] = [];
    for (const item of items) {
      const title = dayLabel(item.dueDate);
      const last = out[out.length - 1];
      if (last && last.title === title) last.data.push(item);
      else out.push({ title, data: [item] });
    }
    return out;
  }, [items]);

  const overdue = (data ?? []).filter((row) => dueLabel(row.dueDate)?.overdue);
  const currencyTotals = useMemo(() => {
    const totals = new Map<string, { incoming: number; outgoing: number }>();
    for (const row of data ?? []) {
      const current = totals.get(row.currencyCode) ?? { incoming: 0, outgoing: 0 };
      if (row.type === 'borc') current.incoming += row.amount;
      else current.outgoing += row.amount;
      totals.set(row.currencyCode, current);
    }
    return [...totals.entries()].sort(([a], [b]) => (a === 'TRY' ? -1 : b === 'TRY' ? 1 : a.localeCompare(b)));
  }, [data]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Vade Takvimi" subtitle="Yaklaşan ve geciken vadeleri takip edin." />

      <StatStrip
        items={[
          { label: 'Geciken', value: String(overdue.length), tone: 'destructive' },
          { label: 'Toplam vade', value: String(data?.length ?? 0) },
        ]}
      />
      {currencyTotals.map(([currencyCode, totals]) => (
        <StatStrip
          key={currencyCode}
          items={[
            {
              label: `${currencyCode} tahsil edilecek`,
              value: formatAmount(totals.incoming, currencyCode),
              tone: 'success',
            },
            {
              label: `${currencyCode} ödenecek`,
              value: formatAmount(totals.outgoing, currencyCode),
              tone: 'warning',
            },
          ]}
        />
      ))}

      <View className="py-2">
        <FilterChips options={PRESETS} value={preset} onChange={setPreset} />
      </View>

      {isPending ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text className="pb-1 pt-4 font-inter-semibold text-[13px] text-muted-foreground">{section.title}</Text>
          )}
          renderItem={({ item }) => {
            const due = dueLabel(item.dueDate);
            const incomingRow = item.type === 'borc';
            const tone: Tone = due?.overdue ? 'destructive' : incomingRow ? 'success' : 'warning';
            return (
              <ListRow
                title={item.companyName ?? 'Firma'}
                lines={[
                  item.invoiceNo ? `Fatura: ${item.invoiceNo}` : null,
                  incomingRow ? 'Tahsilat' : 'Ödeme',
                ]}
                icon={incomingRow ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                iconTone={tone}
                chip={due ? { label: due.text, tone } : undefined}
                trailing={formatAmount(item.amount, item.currencyCode)}
                trailingTone={tone}
                onPress={() => router.push(`/(tabs)/modules/companies/${item.companyId}`)}
              />
            );
          }}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          ListEmptyComponent={
            <EmptyState title="Vade kaydı yok" hint="Son 30 ve önümüzdeki 90 gün gösteriliyor." />
          }
        />
      )}
    </SafeAreaView>
  );
}
