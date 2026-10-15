import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCan } from '@/src/auth/AuthProvider';
import { exportService } from '@/src/api/exports';
import { useCashMovements } from '@/src/api/finance.hooks';
import { formatAmount, formatDate } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { EmptyState, ErrorState, Fab, FilterChips, ListRow, ListSkeleton, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { KpiGrid, KpiTile, runExport } from '@/src/ui/finance/kit';
import {
  AgingPanel,
  CashBalancePanel,
  CurrencySharePanel,
  DailyFlowPanel,
  TopDebtorsPanel,
  TrendPanel,
  UpcomingDuesPanel,
} from '@/src/ui/finance/CashPanels';
import {
  cashByCurrency,
  cashCounts,
  filterCashMovements,
  overdueDays,
  type CashMovement,
  type CashStatus,
  type DirectionFilter,
  type StatusFilter,
} from '@/src/ui/finance/cash-movements';

const STATUS_LABEL: Record<CashStatus, string> = { Paid: 'Ödendi', Pending: 'Bekliyor', Overdue: 'Gecikmiş', Cancelled: 'İptal' };
const STATUS_TONE: Record<CashStatus, Tone> = { Paid: 'success', Pending: 'warning', Overdue: 'destructive', Cancelled: 'neutral' };
const METHOD_LABEL: Record<string, string> = {
  bank_transfer: 'Havale/EFT',
  cash: 'Nakit',
  check: 'Çek',
  cheque: 'Çek',
  promissory_note: 'Senet',
  credit_card: 'Kredi kartı',
  other: 'Diğer',
};

const joinAmounts = (items: { amount: number; currencyCode: string }[]) =>
  items.filter((item) => item.amount).map((item) => formatAmount(item.amount, item.currencyCode)).join(' · ') || '—';

/** Web `PaymentsPage` (Ödemeler & Kasa): alacak + ödemeler tek kasa listesi. */
export default function PaymentsScreen() {
  const router = useRouter();
  const canCreate = useCan('payments.create');
  const canCreateInvoice = useCan('accounting_invoices.create');
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const movements = useCashMovements();
  const rows = useMemo(() => movements.data ?? [], [movements.data]);

  const filtered = useMemo(() => filterCashMovements(rows, { direction, status, search }), [direction, rows, search, status]);
  const counts = useMemo(() => cashCounts(rows, direction), [direction, rows]);
  const balances = useMemo(() => cashByCurrency(rows), [rows]);
  const inflowPaid = rows.filter((row) => row.direction === 'in' && row.status === 'Paid').length;
  const outflowPaid = rows.filter((row) => row.direction === 'out' && row.status === 'Paid').length;
  const inflowPending = rows.filter((row) => row.direction === 'in' && row.status === 'Pending').length;

  const openRow = (row: CashMovement) =>
    router.push(`/(tabs)/modules/${row.source === 'receivable' ? 'receivables' : 'payments'}/${row.id}` as Href);

  async function exportExcel() {
    setExporting(true);
    await runExport(() => exportService.finance());
    setExporting(false);
  }

  const actions = [
    { icon: exporting ? ('hourglass-outline' as const) : ('download-outline' as const), label: 'Excel', onPress: () => void exportExcel() },
    ...(canCreateInvoice
      ? [{ icon: 'receipt-outline' as const, label: 'Muhasebe Faturası', onPress: () => router.push('/modal/invoice-form' as Href) }]
      : []),
  ];

  const header = (
    <View className="gap-3 pb-2">
      <ScreenHeader title="Ödemeler & Kasa" subtitle="Nakit hareketlerini ve ödeme kayıtlarını takip edin." actions={actions} />
      <KpiGrid>
        {[
          <KpiTile
            key="in"
            icon="arrow-down-circle-outline"
            tone="success"
            label="Alınan (Giren)"
            value={joinAmounts(balances.map((item) => ({ amount: item.incoming, currencyCode: item.currencyCode })))}
            sub={`${inflowPaid} tahsilat`}
          />,
          <KpiTile
            key="out"
            icon="arrow-up-circle-outline"
            tone="destructive"
            label="Ödenen (Çıkan)"
            value={joinAmounts(balances.map((item) => ({ amount: item.outgoing, currencyCode: item.currencyCode })))}
            sub={`${outflowPaid} ödeme`}
          />,
          <KpiTile
            key="net"
            icon="wallet-outline"
            tone="info"
            label="Net Kasa"
            value={joinAmounts(balances.map((item) => ({ amount: item.net, currencyCode: item.currencyCode })))}
            sub="gerçekleşen"
          />,
          <KpiTile
            key="pending"
            icon="time-outline"
            tone="warning"
            label="Bekleyen Tahsilat"
            value={joinAmounts(balances.map((item) => ({ amount: item.pendingIn, currencyCode: item.currencyCode })))}
            sub={`${inflowPending} kayıt`}
            selected={status === 'Pending' && direction === 'in'}
            onPress={() => {
              setDirection('in');
              setStatus('Pending');
            }}
          />,
        ]}
      </KpiGrid>
      <CashBalancePanel rows={rows} />
      <UpcomingDuesPanel rows={rows} onOpen={openRow} />
      <TrendPanel rows={rows} />
      <CurrencySharePanel rows={rows} />
      <AgingPanel rows={rows} />
      <DailyFlowPanel rows={rows} />
      <TopDebtorsPanel
        rows={rows}
        onShowAll={() => {
          setStatus('Overdue');
          setDirection('in');
        }}
      />
      <View style={{ paddingHorizontal: SCREEN_PAD }} className="pt-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Firma ara..." />
      </View>
      <FilterChips
        options={[
          { value: 'in' as const, label: 'Alınan', count: counts.direction.in },
          { value: 'out' as const, label: 'Ödenen', count: counts.direction.out },
        ]}
        value={direction === 'all' ? null : direction}
        onChange={(next) => setDirection(next ?? 'all')}
      />
      <FilterChips
        options={[
          { value: 'Paid' as const, label: 'Tahsil', count: counts.status.Paid },
          { value: 'Pending' as const, label: 'Bekleyen', count: counts.status.Pending },
          { value: 'Overdue' as const, label: 'Gecikmiş', count: counts.status.Overdue },
        ]}
        value={status === 'all' ? null : status}
        onChange={(next) => setStatus(next ?? 'all')}
      />
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      {movements.isPending ? (
        <>
          <ScreenHeader title="Ödemeler & Kasa" />
          <ListSkeleton />
        </>
      ) : movements.error ? (
        <>
          <ScreenHeader title="Ödemeler & Kasa" />
          <ErrorState message={movements.error.message} onRetry={() => void movements.refetch()} />
        </>
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={filtered}
          keyExtractor={(item) => `${item.source}-${item.id}`}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: 96 }}
          renderItem={({ item }) => {
            const incoming = item.direction === 'in';
            const late = overdueDays(item);
            return (
              <View style={{ paddingHorizontal: SCREEN_PAD }}>
                <ListRow
                  title={item.companyName}
                  lines={[
                    item.invoiceNo ? `Fatura: ${item.invoiceNo}` : item.notes,
                    item.paidDate ? `Ödeme: ${formatDate(item.paidDate)}` : `Vade: ${formatDate(item.dueDate)}`,
                    item.paymentMethod ? (METHOD_LABEL[item.paymentMethod] ?? item.paymentMethod) : null,
                  ]}
                  icon={incoming ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                  iconTone={incoming ? 'success' : 'destructive'}
                  chips={[
                    { label: STATUS_LABEL[item.status], tone: STATUS_TONE[item.status] },
                    ...(late > 0 ? [{ label: `${late} gün gecikmiş`, tone: 'destructive' as const }] : []),
                  ]}
                  trailing={`${incoming ? '+' : '−'} ${formatAmount(item.amount, item.currencyCode)}`}
                  trailingTone={incoming ? 'success' : 'destructive'}
                  onPress={() => openRow(item)}
                />
              </View>
            );
          }}
          refreshing={movements.isRefetching}
          onRefresh={() => void movements.refetch()}
          ListEmptyComponent={<EmptyState title="Kasa hareketi bulunamadı" hint="Arama veya filtreleri değiştirin." />}
        />
      )}
      {canCreate ? <Fab label="Yeni kasa hareketi" extended onPress={() => router.push('/modal/payment' as Href)} /> : null}
    </SafeAreaView>
  );
}
