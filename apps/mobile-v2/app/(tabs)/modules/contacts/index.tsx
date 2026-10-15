import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useContactList } from '@/src/api/crm.hooks';
import type { ContactListItem, ContactListQuery } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { Chip, EmptyState, ErrorState, FilterChips, ListSkeleton, Loading, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';
import { initials } from '@/src/ui/Avatar';
import { useTheme } from '@/src/theme/theme';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';

type Preset = 'primary' | 'blacklist';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'primary', label: 'Birincil' },
  { value: 'blacklist', label: 'Kara liste' },
];

/** Küçük gri ikon + metin; mockup'ta satırın alt iki bilgi sırası bu kalıpta. */
function MetaBit({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { colors } = useTheme();
  return (
    <View className="max-w-full shrink flex-row items-center gap-1">
      <Ionicons name={icon} size={12} color={colors.mutedForeground} />
      <Text className="shrink font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Mockup s34'ün kontak satırı: soldaki baş harf dairesi, adın yanında karar
 * rolü çipi, sağda durum noktası, altında firma ve iki satır künye.
 */
function ContactRow({ item, onPress }: { item: ContactListItem; onPress: () => void }) {
  const { colors } = useTheme();
  const company = item.company?.shortName ?? item.company?.legalTitle ?? null;
  const phone = item.mobilePhone ?? item.workPhone;
  // Sunucuda "Pasif" diye bir kontak durumu yok; gerçek ikili alan kara liste.
  const status = item.isBlacklisted
    ? { label: 'Kara liste', color: colors.destructive }
    : { label: 'Aktif', color: colors.success };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.fullName}
      className="my-[5px] flex-row gap-3 rounded-[16px] border border-border bg-card px-3 py-3.5 active:opacity-70"
      style={{ borderCurve: 'continuous' }}
    >
      <View
        className="h-[42px] w-[42px] items-center justify-center rounded-full"
        style={{ backgroundColor: colors.muted }}
      >
        <Text className="font-inter-semibold text-[14px] text-foreground">{initials(item.fullName)}</Text>
      </View>

      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="shrink font-inter-semibold text-[16px] leading-[21px] text-foreground" numberOfLines={1}>
            {item.fullName}
          </Text>
          {item.decisionRole ? <Chip tone="info" label={item.decisionRole.name} shrink /> : null}
          <View className="ml-auto flex-row items-center gap-1">
            <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.color }} />
            <Text className="font-inter text-[12px]" style={{ color: status.color }}>
              {status.label}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </View>
        </View>

        {company ? (
          <Text className="font-inter text-[13px] text-muted-foreground" numberOfLines={1}>
            {company}
          </Text>
        ) : null}

        {item.company?.city || item.title ? (
          <View className="flex-row items-center gap-3">
            {item.company?.city ? <MetaBit icon="location-outline" text={item.company.city} /> : null}
            {item.title ? (
              <Text className="shrink font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
                {item.title}
              </Text>
            ) : null}
          </View>
        ) : null}

        {phone || item.workEmail ? (
          <View className="flex-row items-center gap-3">
            {phone ? <MetaBit icon="call-outline" text={phone} /> : null}
            {item.workEmail ? <MetaBit icon="mail-outline" text={item.workEmail} /> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ContactsScreen() {
  const router = useRouter();
  const canCreate = useCan('contacts.create');
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<Preset | null>(null);
  const serverSearch = useDebouncedValue(search.trim());

  const query = useMemo<ContactListQuery>(
    () => ({
      search: serverSearch || undefined,
      isPrimary: preset === 'primary' ? true : undefined,
      isBlacklisted: preset === 'blacklist' ? true : undefined,
      sortBy: 'name',
      sortDir: 'asc',
    }),
    [serverSearch, preset]
  );

  const list = useContactList(query);
  const items = list.data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Kontaklar"
        subtitle="Tüm kişi kayıtlarını görüntüleyin ve yönetin."
        actions={
          canCreate
            ? [{ icon: 'add', label: 'Yeni kontak', onPress: () => router.push('/modal/contact') }]
            : []
        }
      />


      <View className="gap-2 pb-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Kişi, firma veya e-posta ara" />
        <FilterChips options={PRESETS} value={preset} onChange={setPreset} />
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
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <ContactRow item={item} onPress={() => router.push(`/(tabs)/modules/contacts/${item.id}`)} />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={
            <EmptyState title="Kontak bulunamadı" hint="Aramayı veya filtreyi değiştirin." />
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </SafeAreaView>
  );
}
