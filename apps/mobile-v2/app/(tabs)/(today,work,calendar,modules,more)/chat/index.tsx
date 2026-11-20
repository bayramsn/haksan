import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
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
  const mentions = item.mentionCount ?? 0;
  const accessibilityLabel = [
    title,
    unread ? `${item.unreadCount} okunmamış mesaj` : null,
    mentions > 0 ? `${mentions} bahsetme` : null,
    item.isFavorite ? 'Favori' : null,
    item.isMuted ? 'Sessizde' : null,
  ].filter(Boolean).join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-border px-4 py-4 active:opacity-70"
    >
      {item.type === 'group' ? (
        <View className="h-11 w-11 items-center justify-center rounded-full bg-secondary">
          <Ionicons name="people" size={20} color={colors.secondaryForeground} />
        </View>
      ) : (
        <Avatar name={title} />
      )}

      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center gap-1.5">
          <Text
            className={`shrink text-base text-foreground ${unread ? 'font-inter-semibold' : 'font-inter-medium'}`}
            numberOfLines={1}
          >
            {title}
          </Text>
          {item.isFavorite ? <Ionicons name="star" size={13} color={colors.primary} /> : null}
          {item.isMuted ? <Ionicons name="notifications-off-outline" size={14} color={colors.mutedForeground} /> : null}
        </View>
        <Text
          className={`text-sm leading-[20px] ${unread ? 'font-inter-medium text-foreground' : 'font-inter text-muted-foreground'}`}
          numberOfLines={1}
        >
          {item.lastMessage?.preview ?? 'Henüz mesaj yok'}
        </Text>
      </View>

      <View className="items-end gap-1">
        <Text className="font-inter text-xs text-muted-foreground">{relativeTime(item.lastActivityAt)}</Text>
        <View className="flex-row items-center gap-1">
          {mentions > 0 ? (
            <View className="rounded-full bg-primary-soft px-1.5 py-0.5">
              <Text className="font-inter-semibold text-[11px] text-primary">@{mentions}</Text>
            </View>
          ) : null}
          {unread ? (
            <View className="min-w-[20px] items-center rounded-full bg-destructive px-1.5 py-0.5">
              <Text className="font-inter-semibold text-[11px] text-white">{item.unreadCount}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const filters = [
  { id: 'all', label: 'Tümü' },
  { id: 'unread', label: 'Okunmamış' },
  { id: 'mentions', label: 'Bahsetmeler' },
  { id: 'favorites', label: 'Favoriler' },
] as const;

type ConversationFilter = typeof filters[number]['id'];

export default function ConversationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const { data, isPending, isRefetching, error, refetch } = useConversations();

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr');
    return (data ?? [])
      .filter((conversation) => {
        if (filter === 'unread') return conversation.unreadCount > 0;
        if (filter === 'mentions') return (conversation.mentionCount ?? 0) > 0;
        if (filter === 'favorites') return conversation.isFavorite;
        return true;
      })
      .map((conversation) => ({ conversation, title: conversationTitle(conversation, user?.id) }))
      .filter(({ title }) => !term || title.toLocaleLowerCase('tr').includes(term));
  }, [data, filter, search, user?.id]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
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
                  onPress: () => router.push('/chat/new-group'),
                },
              ]
            : []),
          {
            icon: 'create-outline',
            label: 'Yeni sohbet',
            onPress: () => router.push('/chat/new'),
          },
        ]}
      />
      <View className="pb-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Sohbetlerde ara" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingTop: 8 }}>
          {filters.map(({ id, label }) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === id }}
              onPress={() => setFilter(id)}
              className={`min-h-11 justify-center rounded-full border px-3 ${filter === id ? 'border-primary bg-primary-soft' : 'border-border bg-card'}`}
            >
              <Text className={`font-inter-medium text-sm ${filter === id ? 'text-primary' : 'text-foreground'}`}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : (
        <FlatList contentInsetAdjustmentBehavior="automatic"
          data={rows}
          keyExtractor={({ conversation }) => conversation.id}
          renderItem={({ item }) => (
            <Row
              item={item.conversation}
              title={item.title}
              onPress={() => router.push(`/chat/${item.conversation.id}?title=${encodeURIComponent(item.title)}`)}
            />
          )}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          ListEmptyComponent={
            <EmptyState
              title={search || filter !== 'all' ? 'Eşleşen sohbet yok' : 'Henüz sohbet yok'}
              hint={search || filter !== 'all' ? 'Aramayı veya filtreyi değiştirin.' : 'Sağ üstteki düğmeden bir ekip arkadaşıyla sohbet başlatın.'}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
