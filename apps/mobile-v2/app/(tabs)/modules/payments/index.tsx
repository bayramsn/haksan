import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { usePayments, usePaymentSummary } from '@/src/api/finance.hooks';
import { formatAmount, formatDate } from '@/src/lib/format';
import { ListSkeleton, EmptyState, ErrorState, FilterChips, ListRow, Loading, ScreenHeader, StatStrip } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useCan } from '@/src/auth/AuthProvider';

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: 'Havale/EFT',
  cash: 'Nakit',
  check: 'Çek',
  promissory_note: 'Senet',
  credit_card: 'Kredi kartı',
};

export default function PaymentsScreen() {
  const router = useRouter();
  const canCreate = useCan('payments.create');
  const [direction, setDirection] = useState<'in' | 'out' | null>(null);

  const list = usePayments(direction ?? undefined);
  const summary = usePaymentSummary();
  const items = list.data?.items ?? [];
  const currencyRows = summary.data?.byCurrency ?? [];
  const singleCurrency = currencyRows.length === 1 ? currencyRows[0] : null;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Ödemeler & Kasa"
        subtitle="Nakit hareketlerini ve ödeme kayıtlarını takip edin."
        actions={canCreate ? [{ icon: 'add', label: 'Yeni kasa hareketi', onPress: () => router.push('/modal/payment' as Href) }] : []}
      />

      {singleCurrency ? (
        <StatStrip
          items={[
            { label: 'Gelen', value: formatAmount(singleCurrency.incoming, singleCurrency.currencyCode), tone: 'success' },
            { label: 'Giden', value: formatAmount(singleCurrency.outgoing, singleCurrency.currencyCode), tone: 'destructive' },
            { label: 'Net', value: formatAmount(singleCurrency.net, singleCurrency.currencyCode), tone: singleCurrency.net >= 0 ? 'success' : 'destructive' },
          ]}
        />
      ) : currencyRows.length > 0 ? (
        <StatStrip
          items={currencyRows.map((row) => ({
            label: `${row.currencyCode} Net`,
            value: formatAmount(row.net, row.currencyCode),
            tone: row.net >= 0 ? 'success' as const : 'destructive' as const,
          }))}
        />
      ) : null}

      <View className="py-2">
        <FilterChips
          options={[
            { value: 'in' as const, label: 'Tahsilat' },
            { value: 'out' as const, label: 'Ödeme' },
          ]}
          value={direction}
          onChange={setDirection}
        />
      </View>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }) => {
            const incomingRow = item.direction === 'in';
            return (
              <ListRow
                title={item.company?.shortName ?? item.company?.legalTitle ?? 'Firma'}
                lines={[
                  item.invoiceNo ? `Fatura: ${item.invoiceNo}` : item.notes,
                  formatDate(item.paymentDate),
                  METHOD_LABEL[item.paymentMethod] ?? item.paymentMethod,
                ]}
                icon={incomingRow ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                iconTone={incomingRow ? 'success' : 'destructive'}
                chip={item.status ? { label: item.status.name, tone: incomingRow ? 'success' : 'neutral' } : undefined}
                trailing={`${incomingRow ? '+' : '−'} ${formatAmount(item.amount, item.currency?.code ?? 'TRY')}`}
                trailingTone={incomingRow ? 'success' : 'destructive'}
                onPress={() => router.push(`/(tabs)/modules/payments/${item.id}` as Href)}
              />
            );
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title="Ödeme kaydı yok" />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </SafeAreaView>
  );
}
