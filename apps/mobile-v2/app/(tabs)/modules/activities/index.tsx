import { useMemo } from 'react';
import { SectionList, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { useActivityList } from '@/src/api/crm.hooks';
import type { ActivityListItem } from '@/src/api/endpoints';
import { dayLabel, formatTime } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { ListSkeleton, EmptyState, ErrorState, ListRow, Loading, ScreenHeader } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { Ionicons } from '@expo/vector-icons';
import { useCan } from '@/src/auth/AuthProvider';

/**
 * `activity_types` seed'indeki GERÇEK kodlar (db/seed/_data.ts). Önceki eşleme
 * tahminle yazılmıştı (call/visit/meeting/task) ve sekiz türün altısı hiç
 * eşleşmediği için nötr ikona düşüyordu. Tanınmayan kod yine nötre düşer.
 */
const TYPE_ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; tone: Tone }> = {
  incoming_call: { icon: 'call-outline', tone: 'info' },
  outgoing_call: { icon: 'call-outline', tone: 'stage' },
  customer_visit: { icon: 'navigate-outline', tone: 'success' },
  online_meeting: { icon: 'videocam-outline', tone: 'stage' },
  showroom_meeting: { icon: 'people-outline', tone: 'stage' },
  email: { icon: 'mail-outline', tone: 'info' },
  whatsapp: { icon: 'logo-whatsapp', tone: 'success' },
  note: { icon: 'document-text-outline', tone: 'neutral' },
};

export default function ActivitiesScreen() {
  const router = useRouter();
  const canCreate = useCan('activities.create');
  const list = useActivityList();
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  // Sunucu tarihe göre azalan sıralı döndürüyor; ardışık aynı günler birleştirilir.
  const sections = useMemo(() => {
    const out: { title: string; data: ActivityListItem[] }[] = [];
    for (const item of items) {
      const title = dayLabel(item.activityDate);
      const last = out[out.length - 1];
      if (last && last.title === title) last.data.push(item);
      else out.push({ title, data: [item] });
    }
    return out;
  }, [items]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Aktiviteler"
        subtitle="Görüşme, ziyaret ve not kayıtlarının akışı."
        actions={canCreate ? [{ icon: 'add', label: 'Yeni aktivite', onPress: () => router.push('/modal/activity' as Href) }] : []}
      />

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text className="pb-1 pt-4 font-inter-semibold text-[13px] text-muted-foreground">{section.title}</Text>
          )}
          renderItem={({ item }) => {
            const style = TYPE_ICON[item.type?.code ?? ''] ?? { icon: 'pulse-outline' as const, tone: 'neutral' as Tone };
            return (
              <ListRow
                title={item.subject}
                lines={[
                  [item.type?.name, formatTime(item.activityDate)].filter(Boolean).join(' · ') || null,
                  item.result ?? item.description,
                  item.createdByUser?.fullName,
                ]}
                icon={style.icon}
                iconTone={item.origin === 'system' ? 'neutral' : style.tone}
                chip={!item.opportunityId ? { label: 'Fırsat Dışı', tone: 'warning' } : undefined}
                onPress={() => router.push(`/(tabs)/modules/activities/${item.id}` as Href)}
              />
            );
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title="Aktivite yok" hint="Görüşme ve ziyaretler burada listelenir." />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </SafeAreaView>
  );
}
