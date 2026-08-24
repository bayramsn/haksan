import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useMaintenancePlans } from '@/src/api/operations.hooks';
import { dueLabel, formatDate } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { ListSkeleton, EmptyState, ErrorState, FilterChips, ListRow, Loading, ScreenHeader } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';

export default function MaintenancePlansScreen() {
  const router = useRouter();
  const [dueSoon, setDueSoon] = useState<'due' | null>(null);

  const list = useMaintenancePlans(dueSoon === 'due' ? true : undefined);
  const items = list.data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Bakım Planları" subtitle="Periyodik bakım takvimini ve yaklaşan bakımları izleyin." />

      <View className="pb-2">
        <FilterChips
          options={[{ value: 'due' as const, label: 'Yaklaşanlar' }]}
          value={dueSoon}
          onChange={setDueSoon}
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
            const due = dueLabel(item.nextDueDate);
            const tone: Tone = !item.isActive ? 'neutral' : due?.overdue ? 'destructive' : 'success';
            return (
              <ListRow
                title={item.title}
                lines={[
                  item.company?.shortName ?? item.company?.legalTitle ?? null,
                  `Her ${item.intervalDays} günde bir`,
                  item.lastServiceDate ? `Son bakım: ${formatDate(item.lastServiceDate)}` : null,
                ]}
                icon="build-outline"
                iconTone={tone}
                chip={item.isActive ? undefined : { label: 'Pasif', tone: 'neutral' }}
                trailing={due ? `${formatDate(item.nextDueDate)} · ${due.text}` : formatDate(item.nextDueDate)}
                trailingTone={tone}
                onPress={() => router.push(`/(tabs)/modules/maintenance-plans/${item.id}` as Href)}
              />
            );
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title="Bakım planı yok" />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </SafeAreaView>
  );
}
