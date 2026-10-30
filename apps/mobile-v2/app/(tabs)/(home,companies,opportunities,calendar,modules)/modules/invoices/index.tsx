import { useNavigationContext } from '@/src/modules/useNavigationContext';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCan } from '@/src/auth/AuthProvider';
import { useAllAccountingInvoices } from '@/src/api/finance.hooks';
import { formatAmount, formatDate } from '@/src/lib/format';
import { EmptyState, ErrorState, Fab, FilterChips, ListRow, ListSkeleton, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { KpiGrid, KpiTile, Segmented } from '@/src/ui/finance/kit';
import {
  dueState,
  filterInvoices,
  invoiceCategoryLabel,
  invoiceKpis,
  type InvoiceCategory,
} from '@/src/ui/finance/invoice-logic';

const DUE_TONE = { danger: 'destructive', warning: 'warning', success: 'success', neutral: 'neutral' } as const;
const CATEGORY_OPTIONS = [
  { value: 'commercial', label: 'Ticari' },
  { value: 'administrative', label: 'İdari' },
] as const;
const TYPE_OPTIONS = [
  { value: 'sales' as const, label: 'Satış' },
  { value: 'purchase' as const, label: 'Alış' },
];

/** Web `AccountingInvoicesPage`: sınıf sunucu filtresi, tür + arama istemci tarafı. */
export default function InvoicesScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const canCreate = useCan('accounting_invoices.create');
  const [category, setCategory] = useState<InvoiceCategory>('commercial');
  const [type, setType] = useState<'sales' | 'purchase' | null>('sales');
  const [search, setSearch] = useState('');
  useNavigationContext('accounting-invoices', ({ query }) => setSearch(query ?? ''));
  const list = useAllAccountingInvoices(category);

  const filtered = useMemo(() => {
    const rows = (list.data ?? []).filter((row) => !type || row.type === type);
    return filterInvoices(rows, search);
  }, [list.data, search, type]);
  const kpis = useMemo(() => invoiceKpis(filtered), [filtered]);
  const [primary, ...others] = kpis.totals;

  const header = (
    <View className="gap-3 pb-2">
      <ScreenHeader title="Muhasebe Faturaları" subtitle="Satış ve alış faturaları · vade planı ve cari hareketler" />
      <View style={{ paddingHorizontal: SCREEN_PAD }}>
        <Segmented label="Fatura sınıfı" value={category} options={CATEGORY_OPTIONS} onChange={setCategory} />
      </View>
      <FilterChips options={TYPE_OPTIONS} value={type} onChange={setType} allLabel="Tümü" />
      <KpiGrid>
        {[
          <KpiTile
            key="count"
            icon="receipt-outline"
            tone="stage"
            label="Fatura"
            value={String(kpis.count)}
            sub={invoiceCategoryLabel(category).toLocaleLowerCase('tr-TR')}
          />,
          <KpiTile
            key="total"
            icon="trending-up-outline"
            tone="success"
            label="Toplam Tutar"
            value={primary ? formatAmount(primary.amount, primary.currencyCode) : '—'}
            sub={others.map((item) => formatAmount(item.amount, item.currencyCode)).join(' · ') || undefined}
          />,
          <KpiTile key="installments" icon="layers-outline" tone="warning" label="Taksitli" value={String(kpis.installmented)} sub="vade planlı" />,
          <KpiTile key="companies" icon="business-outline" tone="info" label="Firma" value={String(kpis.companies)} sub="farklı cari" />,
        ]}
      </KpiGrid>
      <SearchBar value={search} onChange={setSearch} placeholder="Fatura no veya firma..." />
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      {list.isPending ? (
        <>
          <ScreenHeader title="Muhasebe Faturaları" />
          <ListSkeleton />
        </>
      ) : list.error ? (
        <>
          <ScreenHeader title="Muhasebe Faturaları" />
          <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
        </>
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={filtered}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: GLASS_TAB_BAR_HEIGHT + 96 }}
          renderItem={({ item }) => {
            const sales = item.type === 'sales';
            const due = dueState(item);
            return (
              <View style={{ paddingHorizontal: SCREEN_PAD }}>
                <ListRow
                  title={item.invoiceNo}
                  lines={[
                    item.company?.shortName ?? item.company?.legalTitle ?? null,
                    `${invoiceCategoryLabel(item.invoiceCategory)} · ${formatDate(item.invoiceDate)}`,
                    item.installmentCount > 1 ? `${item.installmentCount} taksit · ${due.detail}` : due.detail,
                  ]}
                  icon="document-outline"
                  iconTone={sales ? 'success' : 'info'}
                  chips={[
                    ...(type ? [] : [{ label: sales ? 'Satış' : 'Alış', tone: sales ? ('success' as const) : ('info' as const) }]),
                    { label: due.label, tone: DUE_TONE[due.tone] },
                  ]}
                  trailing={formatAmount(item.grandTotal, item.currency?.code ?? 'TRY')}
                  trailingTone="neutral"
                  onPress={() => router.push(`/modules/invoices/${item.id}` as Href)}
                />
              </View>
            );
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={
            <EmptyState title="Fatura bulunamadı" hint="Arama terimini veya tür/sınıf sekmelerini değiştirerek tekrar deneyin." />
          }
        />
      )}
      {canCreate ? <Fab label="Yeni Fatura" extended onPress={() => router.push('/modal/invoice-form' as Href)} /> : null}
    </SafeAreaView>
  );
}
