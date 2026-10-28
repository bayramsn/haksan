import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useMaintenancePlans } from '@/src/api/operations.hooks';
import { dueLabel, formatDate } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { EmptyState, ErrorState, FilterChips, ListRow, ListSkeleton, Loading, SCREEN_PAD, ScreenHeader } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';

export default function MaintenancePlansScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const [dueSoon, setDueSoon] = useState<'due' | null>(null);

  const list = useMaintenancePlans(dueSoon === 'due' ? true : undefined);
  const items = list.data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Bakım Planları" subtitle="Periyodik bakım takvimini ve yaklaşan bakımları izleyin." />

      <View className="gap-2 pb-2">
        <FilterChips
          options={[{ value: 'due' as const, label: 'Yaklaşanlar' }]}
          value={dueSoon}
          onChange={setDueSoon}
        />
        <Text className="px-4 font-inter text-xs text-muted-foreground">{items.length} plan yüklendi{list.data ? ` · ${list.data.total} kayıt` : ''}</Text>
      </View>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList
          // v2'de bu özellik varsayılan AÇIK ve sayfalama/yeniden ölçüm sonrası
          // içeriği çapalayıp listenin başında boşluk bırakıyor. Bunlar sohbet
          // değil, tepeden akan listeler — kapalı olmalı.
          maintainVisibleContentPosition={{ disabled: true }}
          // FlashList v2 kendi başına esnemiyor; sınırlanmamış sütun içinde
          // içerik aşağı kayıyor ve filtrelerin altında boşluk kalıyor.
          style={{ flex: 1 }}
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: GLASS_TAB_BAR_HEIGHT + 32 }}
          renderItem={({ item }) => {
            const due = dueLabel(item.nextDueDate);
            const tone: Tone = !item.isActive ? 'neutral' : due?.overdue ? 'destructive' : 'success';
            return (
              <ListRow
                title={item.title}
                lines={[
                  item.company?.shortName ?? item.company?.legalTitle ?? null,
                  `Her ${item.intervalDays} günde bir`,
                  item.lastServiceDate ? `Son bakım: ${formatDate(item.lastServiceDate)}` : 'Son bakım henüz kaydedilmedi',
                  `Sonraki bakım: ${formatDate(item.nextDueDate)}`,
                ]}
                icon="build-outline"
                iconTone={tone}
                chip={{ label: item.isActive ? (due?.text ?? 'Aktif') : 'Pasif', tone }}
                onPress={() => router.push(`/modules/maintenance-plans/${item.id}` as Href)}
              />
            );
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title={dueSoon ? "Yaklaşan bakım bulunamadı" : "Bakım planı yok"} hint={dueSoon ? "Tüm planları görüntüleyebilir veya listeyi yenileyebilirsiniz." : "Makine kartındaki bakım planları burada listelenir."} actionLabel={dueSoon ? "Tüm planları göster" : undefined} onAction={() => setDueSoon(null)} />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </SafeAreaView>
  );
}
