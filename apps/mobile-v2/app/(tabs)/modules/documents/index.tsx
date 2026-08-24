import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import type { Ionicons } from '@expo/vector-icons';
import { useCommercialDocuments, type DocumentKind } from '@/src/api/documents.hooks';
import { formatDate } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { ListSkeleton, EmptyState, ErrorState, ListRow, Loading, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';

const KINDS: {
  value: DocumentKind;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
}[] = [
  { value: 'proforma', label: 'Proforma', icon: 'document-text-outline', tone: 'info' },
  { value: 'contract', label: 'Sözleşme', icon: 'reader-outline', tone: 'stage' },
  { value: 'invoice', label: 'Ticari Fatura', icon: 'receipt-outline', tone: 'success' },
];

export default function DocumentsScreen() {
  const router = useRouter();
  const [kind, setKind] = useState<DocumentKind>('proforma');
  const [search, setSearch] = useState('');
  const serverSearch = useDebouncedValue(search.trim());

  const list = useCommercialDocuments(kind, { search: serverSearch || undefined });
  const active = KINDS.find((entry) => entry.value === kind)!;
  const items = list.data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Ticari Belgeler" subtitle="Proforma, sözleşme ve ticari faturaları görüntüleyin." />

      <View className="gap-2 pb-2">
        {/* Belge türü zorunlu seçim — üç ayrı uç nokta var, "Tümü" diye bir şey yok.
            Bu yüzden FilterChips (nullable) yerine segment denetimi. */}
        <View className="mx-4 flex-row rounded-control border border-border bg-card p-0.5">
          {KINDS.map((entry) => {
            const selected = entry.value === kind;
            return (
              <Pressable
                key={entry.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setKind(entry.value)}
                className={`min-h-[36px] flex-1 items-center justify-center rounded-control ${
                  selected ? 'bg-primary' : ''
                }`}
              >
                <Text
                  className={`text-[13px] font-inter-semibold ${
                    selected ? 'text-primary-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {entry.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <SearchBar value={search} onChange={setSearch} placeholder="Belge no veya firma" />
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
              title={item.no}
              lines={[item.companyName, item.date ? formatDate(item.date) : null]}
              icon={active.icon}
              iconTone={item.finalized ? 'success' : active.tone}
              // Rozet slotu tek — belge tipini taşıyor (Proforma/Sözleşme/Ticari
              // Fatura); durum bu yüzden altta ikinci satır olarak gösteriliyor.
              // Dosya boyutu sunucuda yok: bu belgeler yüklenmiş binary değil, DB
              // kaydı (proforma/contract/commercial_invoice) — [VERİ YOK].
              chip={{ label: active.label, tone: active.tone }}
              trailing={item.statusName ?? (item.finalized ? 'Kesinleşti' : 'Taslak')}
              trailingTone={item.finalized ? 'success' : item.statusName ? active.tone : 'neutral'}
              onPress={() => router.push(`/(tabs)/modules/documents/${kind}/${item.id}` as Href)}
            />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title={`${active.label} bulunamadı`} />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </SafeAreaView>
  );
}
