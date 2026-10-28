import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSendMessage } from '@/src/api/chat.hooks';
import { useShareableRecords, type ShareableRecord } from '@/src/api/crm-general.hooks';
import type { ChatRefType } from '@/src/api/crm-general.api';
import { useTheme } from '@/src/theme/theme';
import { Button, EmptyState, ErrorState, Loading, SearchBar } from '@/src/ui';
import { CompanyPicker } from '@/src/ui/pickers/CompanyPicker';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { toast } from '@/src/ui/toast';

const TABS: { type: ChatRefType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: 'company', label: 'Firma', icon: 'business-outline' },
  { type: 'quote', label: 'Teklif', icon: 'document-text-outline' },
  { type: 'opportunity', label: 'Satış Kartı', icon: 'briefcase-outline' },
  { type: 'service_ticket', label: 'Servis', icon: 'construct-outline' },
];

/** Web ShareRecordDialog: bir CRM kaydını sohbete kart olarak iliştirir. */
export default function ChatShareRecordScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [type, setType] = useState<ChatRefType>('company');
  const [search, setSearch] = useState('');
  const send = useSendMessage(conversationId ?? '');
  const serverSearch = useDebouncedValue(search.trim());
  const records = useShareableRecords(type === 'company' ? 'quote' : type, type !== 'company', serverSearch);

  function share(refType: ChatRefType, refId: string) {
    if (send.isPending) return;
    send.mutate(
      { refType, refId },
      {
        onSuccess: () => {
          toast.success('Kayıt paylaşıldı');
          router.back();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Kayıt Paylaş', headerShown: true }} />
      <View className="gap-3 px-4 pt-3">
        <Text className="font-inter text-sm text-muted-foreground">Sohbete bir CRM kaydını kart olarak iliştirin.</Text>
        <View className="flex-row gap-1.5">
          {TABS.map((tab) => {
            const active = tab.type === type;
            return (
              <Pressable
                key={tab.type}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setType(tab.type);
                  setSearch('');
                }}
                className={`min-h-11 flex-1 items-center justify-center gap-0.5 rounded-control border px-1 ${active ? 'border-primary bg-primary' : 'border-border bg-card'} active:opacity-80`}
              >
                <Ionicons name={tab.icon} size={16} color={active ? colors.primaryForeground : colors.foreground} />
                <Text className={`font-inter-medium text-[11px] ${active ? 'text-primary-foreground' : 'text-foreground'}`} numberOfLines={1}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {type === 'company' ? (
        <View className="gap-3 p-4">
          <CompanyPicker
            label="Firma"
            value={null}
            clearable={false}
            placeholder="Paylaşılacak firmayı ara…"
            disabled={send.isPending}
            onChange={(company) => company && share('company', company.id)}
          />
          {send.isPending ? <Loading /> : null}
        </View>
      ) : (
        <View className="flex-1 gap-2 pt-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Ara…" />
          <FlatList
            data={records.data?.items ?? []}
            keyExtractor={(item: ShareableRecord) => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            onEndReachedThreshold={0.4}
            onEndReached={() => { if (records.hasNextPage && !records.isFetchingNextPage) void records.fetchNextPage(); }}
            refreshing={records.isRefetching}
            onRefresh={() => void records.refetch()}
            ListHeaderComponent={records.data ? <Text className="pb-2 font-inter text-xs text-muted-foreground">{records.data.items.length} / {records.data.total} kayıt</Text> : null}
            ListFooterComponent={
              records.error && records.data?.items.length ? <ErrorState message={records.error.message} onRetry={() => void records.fetchNextPage()} /> :
              records.hasNextPage ? <View className="py-3"><Button variant="ghost" label="Daha fazla kayıt yükle" loading={records.isFetchingNextPage} onPress={() => void records.fetchNextPage()} /></View> : null
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.label} paylaş`}
                disabled={send.isPending}
                onPress={() => share(type, item.id)}
                className="min-h-[56px] justify-center border-b border-border py-2 active:opacity-70"
              >
                <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={2}>{item.label}</Text>
                {item.sublabel ? (
                  <Text className="font-inter text-xs text-muted-foreground" numberOfLines={2}>{item.sublabel}</Text>
                ) : null}
              </Pressable>
            )}
            ListEmptyComponent={
              records.isPending ? (
                <Loading />
              ) : records.error ? (
                <ErrorState message={records.error.message} onRetry={() => void records.refetch()} />
              ) : (
                <EmptyState title="Kayıt bulunamadı" />
              )
            }
          />
        </View>
      )}
    </SafeAreaView>
  );
}
