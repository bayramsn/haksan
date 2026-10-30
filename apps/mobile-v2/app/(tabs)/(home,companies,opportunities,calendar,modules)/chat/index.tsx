import { useMemo, useState } from 'react';
import { Pressable, SectionList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { conversationTitle, useConversations } from '@/src/api/chat.hooks';
import type { Conversation } from '@/src/api/endpoints';
import { useAuth } from '@/src/auth/AuthProvider';
import { relativeTime } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Avatar } from '@/src/ui/Avatar';
import { Chip, EmptyState, ErrorState, Loading, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { groupConversations } from '@/src/ui/crm/chat-logic';

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

  const sections = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr');
    const rows = (data ?? [])
      .map((conversation) => ({ conversation, title: conversationTitle(conversation, user?.id), unreadCount: conversation.unreadCount }))
      .filter(({ title }) => !term || title.toLocaleLowerCase('tr').includes(term));
    const { unread, rest } = groupConversations(rows);
    return [
      { title: 'Okunmamış', data: unread },
      { title: 'Tüm Sohbetler', data: rest },
    ].filter((section) => section.data.length > 0);
  }, [data, search, user?.id]);
  const totalUnread = (data ?? []).reduce((sum, conversation) => sum + conversation.unreadCount, 0);

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
      <View className="gap-2 pb-2">
        {totalUnread > 0 ? (
          <View className="flex-row px-4">
            <Chip tone="destructive" label={`${totalUnread} yeni`} />
          </View>
        ) : null}
        <SearchBar value={search} onChange={setSearch} placeholder="Kişi veya grup ara…" />
      </View>

      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={({ conversation }) => conversation.id}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text accessibilityRole="header" className="bg-canvas px-4 pb-1 pt-3 font-inter-semibold text-xs uppercase tracking-[1.5px] text-muted-foreground">
              {section.title}
            </Text>
          )}
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
              title={search ? 'Eşleşen sohbet yok' : 'İlk sohbetinizi başlatın'}
              hint={search ? 'Arama ifadesini değiştirin.' : 'Ekip arkadaşlarıyla kayıt ve dosya paylaşın.'}
              actionLabel={search ? undefined : 'Yeni Sohbet'}
              onAction={search ? undefined : () => router.push('/chat/new')}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
