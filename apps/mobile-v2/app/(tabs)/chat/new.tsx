import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { conversationTitle, useStartDm } from '@/src/api/chat.hooks';
import { useDirectory } from '@/src/api/operations.hooks';
import { useAuth } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { Avatar } from '@/src/ui/Avatar';
import { DetailHeader, EmptyState, ErrorState, Loading, SearchBar } from '@/src/ui';

export default function NewConversationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const directory = useDirectory();
  const startDm = useStartDm();

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr');
    return (directory.data ?? []).filter((person) => {
      if (!term) return true;
      return `${person.fullName} ${person.email}`.toLocaleLowerCase('tr').includes(term);
    });
  }, [directory.data, search]);

  async function openConversation(person: { id: string; fullName: string }) {
    setActionError(null);
    setSelectedUserId(person.id);
    try {
      const conversation = await startDm.mutateAsync(person.id);
      const title = conversationTitle(conversation, user?.id) || person.fullName;
      router.replace(`/(tabs)/chat/${conversation.id}?title=${encodeURIComponent(title)}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Sohbet başlatılamadı.');
    } finally {
      setSelectedUserId(null);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <DetailHeader title="Yeni Sohbet" subtitle="Bir ekip arkadaşı seçin" />
      <View className="pb-3 pt-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Ad veya e-posta ara" />
      </View>

      {actionError ? (
        <View accessibilityLiveRegion="assertive" className="mx-4 mb-2 rounded-control bg-destructive-soft px-3 py-2">
          <Text selectable className="font-inter text-sm text-destructive">{actionError}</Text>
        </View>
      ) : null}

      {directory.isPending ? (
        <Loading />
      ) : directory.error ? (
        <ErrorState message={directory.error.message} onRetry={() => void directory.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const busy = selectedUserId === item.id;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.fullName} ile sohbet başlat`}
                accessibilityState={{ disabled: startDm.isPending, busy }}
                disabled={startDm.isPending}
                onPress={() => void openConversation(item)}
                className="min-h-[60px] flex-row items-center gap-3 border-b border-border px-4 py-2 active:opacity-70"
              >
                <Avatar name={item.fullName} />
                <View className="flex-1 gap-0.5">
                  <Text selectable className="font-inter-semibold text-[15px] text-foreground" numberOfLines={1}>
                    {item.fullName}
                  </Text>
                  <Text selectable className="font-inter text-[13px] text-muted-foreground" numberOfLines={1}>
                    {item.email}
                  </Text>
                </View>
                <Ionicons
                  name={busy ? 'hourglass-outline' : 'chevron-forward'}
                  size={18}
                  color={colors.mutedForeground}
                />
              </Pressable>
            );
          }}
          refreshing={directory.isRefetching}
          onRefresh={() => void directory.refetch()}
          ListEmptyComponent={
            <EmptyState
              title={search ? 'Ekip arkadaşı bulunamadı' : 'Kullanıcı bulunamadı'}
              hint={search ? 'Arama ölçütünü değiştirin.' : 'Kurum dizininde sohbet başlatılabilecek kullanıcı yok.'}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
