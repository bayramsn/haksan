import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInstallations } from '@/src/api/operations.hooks';
import type { Installation } from '@/src/api/endpoints';
import { formatDate } from '@/src/lib/format';
import { chipClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { ListSkeleton, Chip, EmptyState, ErrorState, FilterChips, Loading, ScreenHeader, SearchBar } from '@/src/ui';
import { ProgressBar } from '@/src/ui/data';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';

type Preset = 'planned' | 'ongoing' | 'done';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'planned', label: 'Planlandı' },
  { value: 'ongoing', label: 'Devam Ediyor' },
  { value: 'done', label: 'Tamamlandı' },
];

/** Tamamlanma/başlangıç damgalarından türetilir; statü lookup'ı boş olabilir. */
function phaseOf(job: Installation): Preset {
  if (job.completedAt) return 'done';
  if (job.startedAt) return 'ongoing';
  return 'planned';
}

const PHASE_TONE: Record<Preset, Tone> = { planned: 'info', ongoing: 'warning', done: 'success' };

/**
 * ListRow'un sabit şablonu ilerleme çubuğu için yer ayırmıyor (bkz. ortak
 * kurallar: "eksik varsa yerel çöz"). 4 adım gerçek alanlardan: kayıt her
 * zaman var → Oluşturuldu; sonra scheduledDate/startedAt/completedAt.
 */
function InstallationRow({ item, onPress }: { item: Installation; onPress?: () => void }) {
  const { colors } = useTheme();
  const phase = phaseOf(item);
  const tone = PHASE_TONE[phase];
  const done = 1 + Number(Boolean(item.scheduledDate)) + Number(Boolean(item.startedAt)) + Number(Boolean(item.completedAt));

  const body = (
    <View className="my-1 gap-2 rounded-overlay border border-border bg-card px-3.5 py-3">
      <View className="flex-row items-center gap-3">
        <View className={`h-10 w-10 items-center justify-center rounded-control border ${chipClass[tone]}`}>
          <Ionicons name="hammer-outline" size={19} color={toneColor(colors, tone)} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-[15px] font-inter-semibold text-foreground" numberOfLines={1}>
            {item.company?.shortName ?? item.company?.legalTitle ?? 'Firma bağlanmadı'}
          </Text>
          {[
            item.customerDevice?.productModelName ?? item.customerDevice?.model,
            [item.assignedTo?.fullName, item.location].filter(Boolean).join(' · ') || null,
            item.scheduledDate ? `Planlanan: ${formatDate(item.scheduledDate)}` : null,
          ]
            .filter((line): line is string => Boolean(line))
            .map((line) => (
              <Text key={line} className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
                {line}
              </Text>
            ))}
        </View>
        <Chip tone={tone} label={item.status?.name ?? PRESETS.find((p) => p.value === phase)!.label} />
      </View>
      <ProgressBar done={done} total={4} tone={tone} />
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.company?.legalTitle ?? 'Kurulum'}
      onPress={onPress}
      className="active:opacity-70"
    >
      {body}
    </Pressable>
  );
}

export default function InstallationsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<Preset | null>(null);
  const serverSearch = useDebouncedValue(search.trim());

  const list = useInstallations({ search: serverSearch || undefined, phase: preset ?? undefined });
  const items = list.data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Kurulumlar" subtitle="Makine kurulum süreçlerini ve randevularını takip edin." />

      <View className="gap-2 pb-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Firma, makine veya konum" />
        <FilterChips options={PRESETS} value={preset} onChange={setPreset} />
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
          renderItem={({ item }) => (
            <InstallationRow
              item={item}
              onPress={() => router.push(`/(tabs)/modules/installations/${item.id}` as Href)}
            />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title="Kurulum kaydı yok" />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </SafeAreaView>
  );
}
