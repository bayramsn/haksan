import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useServiceComplaints } from '@/src/api/operations.hooks';
import { relativeTime } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { ListSkeleton, EmptyState, ErrorState, FilterChips, ListRow, Loading, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';

/** service-complaints tablosundaki `status` sütununun değerleri. */
const STATUS: Record<string, { label: string; tone: Tone }> = {
  new: { label: 'Yeni', tone: 'destructive' },
  reviewing: { label: 'İnceleme', tone: 'warning' },
  converted: { label: 'Çözüldü', tone: 'success' },
  rejected: { label: 'Reddedildi', tone: 'neutral' },
};

const OPTIONS = (['new', 'reviewing', 'converted', 'rejected'] as const).map((value) => ({
  value,
  label: STATUS[value]!.label,
}));

export default function ServiceComplaintsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<(typeof OPTIONS)[number]['value'] | null>(null);
  const serverSearch = useDebouncedValue(search.trim());

  const list = useServiceComplaints({ search: serverSearch || undefined, status: status ?? undefined });
  const items = list.data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Gelen Şikayetler" subtitle="Müşteriden gelen kayıtları inceleyip talebe dönüştürün." />

      <View className="gap-2 pb-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Şikayet no, konu veya firma" />
        <FilterChips options={OPTIONS} value={status} onChange={setStatus} />
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
            const style = STATUS[item.status] ?? { label: item.status, tone: 'neutral' as Tone };
            return (
              <ListRow
                title={item.complaintNo}
                lines={[
                  item.company?.shortName ?? item.company?.legalTitle ?? item.contactName,
                  item.subject,
                  [item.source.toLocaleUpperCase('tr'), relativeTime(item.createdAt)].join(' · '),
                ]}
                icon="chatbox-ellipses-outline"
                iconTone={style.tone}
                chip={{ label: style.label, tone: style.tone }}
                trailing={item.serviceTicket?.ticketNo ?? undefined}
                onPress={() => router.push(`/(tabs)/modules/service-complaints/${item.id}` as Href)}
              />
            );
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={
            <EmptyState
              title="Şikayet kaydı yok"
              hint={search || status ? 'Arama veya filtre ölçütlerini değiştirin.' : 'Yeni kayıtlar burada listelenir.'}
            />
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </SafeAreaView>
  );
}
