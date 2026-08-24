import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useAccountingInvoices } from '@/src/api/finance.hooks';
import { formatAmount, formatDate } from '@/src/lib/format';
import { ListSkeleton, EmptyState, ErrorState, FilterChips, ListRow, Loading, ScreenHeader } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';

export default function InvoicesScreen() {
  const router = useRouter();
  const [type, setType] = useState<'sales' | 'purchase' | null>(null);

  const list = useAccountingInvoices(type ?? undefined);
  const items = list.data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Faturalar" subtitle="Satış ve alış faturalarını görüntüleyin." />

      <View className="pb-2">
        <FilterChips
          options={[
            { value: 'sales' as const, label: 'Satış' },
            { value: 'purchase' as const, label: 'Alış' },
          ]}
          value={type}
          onChange={setType}
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
            const sales = item.type === 'sales';
            return (
              <ListRow
                title={item.invoiceNo}
                lines={[
                  item.company?.shortName ?? item.company?.legalTitle ?? null,
                  formatDate(item.invoiceDate),
                  item.installmentCount > 1
                    ? `${item.installmentCount} taksit`
                    : item.firstDueDate
                      ? `Vade: ${formatDate(item.firstDueDate)}`
                      : null,
                ]}
                icon="document-outline"
                iconTone={sales ? 'success' : 'info'}
                chip={{ label: sales ? 'Satış' : 'Alış', tone: sales ? 'success' : 'info' }}
                trailing={formatAmount(item.grandTotal, item.currency?.code ?? 'TRY')}
                onPress={() => router.push(`/(tabs)/modules/invoices/${item.id}` as Href)}
              />
            );
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title="Fatura bulunamadı" />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </SafeAreaView>
  );
}
