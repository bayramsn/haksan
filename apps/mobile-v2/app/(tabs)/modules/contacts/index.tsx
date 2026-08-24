import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useContactList, useContactSummary } from '@/src/api/crm.hooks';
import type { ContactListItem, ContactListQuery } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import {
  ListSkeleton,
  EmptyState,
  ErrorState,
  FilterChips,
  ListRow,
  Loading,
  ScreenHeader,
  SearchBar,
  StatStrip,
} from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';

type Preset = 'primary' | 'blacklist';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'primary', label: 'Birincil' },
  { value: 'blacklist', label: 'Kara liste' },
];

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
  const summary = useContactSummary();
  const items = list.data?.items ?? [];

  function subtitleFor(item: ContactListItem): (string | null)[] {
    const company = item.company?.shortName ?? item.company?.legalTitle ?? null;
    const role = [item.title, item.department].filter(Boolean).join(' · ') || null;
    const reach = item.mobilePhone ?? item.workPhone ?? item.workEmail ?? null;
    return [company, role, reach];
  }

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

      {summary.data ? (
        <View className="pb-2">
          <StatStrip
            items={[
              { label: 'Toplam', value: String(summary.data.total) },
              { label: 'Birincil', value: String(summary.data.primary), tone: 'success' },
              { label: 'Firma', value: String(summary.data.firmCount), tone: 'info' },
              { label: 'Kara liste', value: String(summary.data.blacklisted), tone: 'destructive' },
            ]}
          />
        </View>
      ) : null}

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
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <ListRow
              title={item.fullName}
              lines={subtitleFor(item)}
              icon="person-outline"
              iconTone={item.isBlacklisted ? 'destructive' : item.isPrimary ? 'success' : 'neutral'}
              chip={
                item.decisionRole
                  ? { label: item.decisionRole.name, tone: 'info' }
                  : item.isBlacklisted
                    ? { label: 'Kara liste', tone: 'destructive' }
                    : undefined
              }
              onPress={() => router.push(`/(tabs)/modules/contacts/${item.id}`)}
            />
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
