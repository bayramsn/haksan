import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { conversationTitle, useConversations } from '@/src/api/chat.hooks';
import type { Conversation } from '@/src/api/endpoints';
import { useAuth } from '@/src/auth/AuthProvider';
import { relativeTime } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Avatar } from '@/src/ui/Avatar';
import { EmptyState, ErrorState, Loading, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';

function Row({ item, title, onPress }: { item: Conversation; title: string; onPress: () => void }) {
  const { colors } = useTheme();
  const unread = item.unreadCount > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${unread ? `, ${item.unreadCount} okunmamış mesaj` : ''}`}
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-border px-4 py-3 active:opacity-70"
    >
      {item.type === 'group' ? (
        <View className="h-11 w-11 items-center justify-center rounded-full bg-secondary">
          <Ionicons name="people" size={20} color={colors.secondaryForeground} />
        </View>
      ) : (
        <Avatar name={title} />
      )}

      <View className="flex-1 gap-0.5">
        <Text
          className={`text-[15px] text-foreground ${unread ? 'font-inter-semibold' : 'font-inter-medium'}`}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          className={`text-[13px] ${unread ? 'font-inter-medium text-foreground' : 'font-inter text-muted-foreground'}`}
          numberOfLines={1}
        >
          {item.lastMessage?.preview ?? 'Henüz mesaj yok'}
        </Text>
      </View>

      <View className="items-end gap-1">
        <Text className="font-inter text-[11px] text-muted-foreground">{relativeTime(item.lastActivityAt)}</Text>
        {unread ? (
          <View className="min-w-[20px] items-center rounded-full bg-destructive px-1.5 py-0.5">
            <Text className="font-inter-semibold text-[11px] text-white">{item.unreadCount}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ConversationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const { data, isPending, isRefetching, error, refetch } = useConversations();

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr');
    return (data ?? [])
      .map((conversation) => ({ conversation, title: conversationTitle(conversation, user?.id) }))
      .filter(({ title }) => !term || title.toLocaleLowerCase('tr').includes(term));
  }, [data, search, user?.id]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Sohbet"
        subtitle="Ekiplerinizle hızlı ve güvenli iletişim kurun."
        actions={[
          ...(user?.roles.includes('super_admin')
            ? [
                {
                  icon: 'people-outline' as const,
                  label: 'Yeni grup',
                  onPress: () => router.push('/(tabs)/chat/new-group'),
                },
              ]
            : []),
          {
            icon: 'create-outline',
            label: 'Yeni sohbet',
            onPress: () => router.push('/(tabs)/chat/new'),
          },
        ]}
      />
      <View className="pb-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Sohbetlerde ara" />
      </View>

      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={({ conversation }) => conversation.id}
          renderItem={({ item }) => (
            <Row
              item={item.conversation}
              title={item.title}
              onPress={() => router.push(`/(tabs)/chat/${item.conversation.id}?title=${encodeURIComponent(item.title)}`)}
            />
          )}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          ListEmptyComponent={
            <EmptyState
              title={search ? 'Sohbet bulunamadı' : 'Henüz sohbet yok'}
              hint={search ? 'Aramayı değiştirin.' : 'Sağ üstteki düğmeden bir ekip arkadaşıyla sohbet başlatın.'}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
