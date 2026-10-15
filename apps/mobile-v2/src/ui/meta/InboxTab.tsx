import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';

import { getMetaErrorMessage } from '@/src/api/meta.api';
import { useMetaComments, useMetaConversations, useSetMetaCommentHidden } from '@/src/api/meta.hooks';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { useTheme } from '@/src/theme/theme';
import { Chip, SearchBar } from '@/src/ui';
import { ChoiceChips } from '@/src/ui/reports/parts';
import { toast } from '@/src/ui/toast';
import { PLATFORM_LABELS, formatMetaDate, type MetaComment } from '@/src/ui/meta/metaNormalize';
import { useActiveConnectionId } from '@/src/ui/meta/CampaignsTab';
import { ConnectionSelect, LoadMore, MetaButton, MetaSection, QueryState } from '@/src/ui/meta/parts';

type View_ = 'messages' | 'comments';

function Conversations({ connectionId, canManage }: { connectionId: string; canManage: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim());
  const conversations = useMetaConversations({ connectionId, search: q || undefined });
  const items = conversations.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <MetaSection title="Ortak mesaj kutusu" description="Instagram, Messenger ve WhatsApp konuşmalarını CRM bağlamıyla yönetin.">
      <View className="-mx-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Kişi veya mesaj ara" />
      </View>
      <QueryState
        loading={conversations.isLoading}
        error={conversations.isError}
        errorMessage={getMetaErrorMessage(conversations.error)}
        onRetry={() => void conversations.refetch()}
        empty={items.length === 0}
        emptyIcon="chatbubbles-outline"
        emptyTitle="Konuşma bulunamadı"
        emptyHint="Müşteriler mesaj gönderdiğinde konuşmalar burada açılır."
      >
        {items.map((conversation) => (
          <Pressable
            key={`${conversation.connectionId}:${conversation.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${conversation.participantName} konuşmasını aç`}
            onPress={() =>
              router.push({
                pathname: '/modal/meta-conversation',
                params: {
                  id: conversation.id,
                  connectionId: conversation.connectionId,
                  platform: conversation.platform,
                  name: conversation.participantName,
                  canReply: canManage && conversation.canReply ? '1' : '0',
                },
              } as unknown as Href)
            }
            className="min-h-[44px] flex-row items-center gap-3 border-t border-border py-3 active:opacity-70"
          >
            <View className="flex-1 gap-0.5">
              <View className="flex-row items-center gap-2">
                <Text className="shrink font-inter-semibold text-sm text-foreground" numberOfLines={1}>{conversation.participantName}</Text>
                <Chip tone="info" label={PLATFORM_LABELS[conversation.platform] ?? conversation.platform} />
              </View>
              <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>{conversation.preview || 'Mesaj önizlemesi yok'}</Text>
              <Text className="font-inter text-[11px] text-muted-foreground">{formatMetaDate(conversation.lastMessageAt)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
        ))}
        <LoadMore visible={Boolean(conversations.hasNextPage)} loading={conversations.isFetchingNextPage} onPress={() => void conversations.fetchNextPage()} />
      </QueryState>
    </MetaSection>
  );
}

function Comments({ connectionId, canManage }: { connectionId: string; canManage: boolean }) {
  const router = useRouter();
  const comments = useMetaComments(connectionId);
  const visibility = useSetMetaCommentHidden();
  const items = comments.data ?? [];

  const confirmVisibility = (comment: MetaComment) =>
    Alert.alert(
      'Yorum görünürlüğünü değiştir',
      `Yorum ${comment.isHidden ? 'yeniden gösterilecek' : 'gizlenecek'}. İşlem Meta gönderisine uygulanır.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: comment.isHidden ? 'Yorumu göster' : 'Yorumu gizle',
          style: comment.isHidden ? 'default' : 'destructive',
          onPress: () =>
            visibility.mutate(
              { id: comment.id, connectionId: comment.connectionId, hidden: !comment.isHidden },
              {
                onSuccess: () => toast.success('Yorum görünürlüğü güncellendi'),
                onError: (error) => toast.error(`Yorum güncellenemedi: ${getMetaErrorMessage(error)}`),
              },
            ),
        },
      ],
    );

  return (
    <MetaSection title="Yorum yönetimi" description="Instagram ve Facebook yorumlarını yanıtlayın veya gerektiğinde gizleyin.">
      <QueryState
        loading={comments.isLoading}
        error={comments.isError}
        errorMessage={getMetaErrorMessage(comments.error)}
        onRetry={() => void comments.refetch()}
        empty={items.length === 0}
        emptyIcon="chatbox-ellipses-outline"
        emptyTitle="Yorum bulunamadı"
        emptyHint="Bağlı gönderilere gelen yorumlar burada yönetilebilir."
      >
        {items.map((comment) => (
          <View key={comment.id} className="gap-1.5 border-t border-border py-3">
            <View className="flex-row items-center gap-2">
              <Text className="shrink font-inter-semibold text-sm text-foreground" numberOfLines={1}>{comment.authorName}</Text>
              <Chip tone="info" label={PLATFORM_LABELS[comment.platform]} />
              {comment.isHidden ? <Chip tone="neutral" label="Gizli" /> : null}
            </View>
            <Text className="font-inter text-sm text-foreground">{comment.message}</Text>
            <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>
              {comment.postName ?? 'Gönderi bilgisi yok'} · {formatMetaDate(comment.createdAt)}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <MetaButton
                icon="arrow-undo-outline"
                label="Yanıtla"
                disabled={!canManage || !comment.canReply}
                onPress={() =>
                  router.push({
                    pathname: '/modal/meta-comment-reply',
                    params: { id: comment.id, connectionId: comment.connectionId, author: comment.authorName, message: comment.message.slice(0, 300) },
                  } as unknown as Href)
                }
              />
              <MetaButton
                icon={comment.isHidden ? 'eye-outline' : 'eye-off-outline'}
                label={comment.isHidden ? 'Yorumu göster' : 'Yorumu gizle'}
                disabled={!canManage || visibility.isPending}
                onPress={() => confirmVisibility(comment)}
              />
            </View>
          </View>
        ))}
      </QueryState>
    </MetaSection>
  );
}

export function InboxTab({ canManage }: { canManage: boolean }) {
  const [view, setView] = useState<View_>('messages');
  const { active, connectionId, setConnectionId } = useActiveConnectionId();
  return (
    <View className="gap-4">
      <View className="gap-3">
        <ChoiceChips
          label="Gelen kutusu görünümü"
          options={[
            { value: 'messages' as View_, label: 'Mesajlar' },
            { value: 'comments' as View_, label: 'Yorumlar' },
          ]}
          value={view}
          onChange={setView}
        />
        <ConnectionSelect connections={active} value={connectionId} onChange={setConnectionId} label="Meta mesaj bağlantısı" />
      </View>
      {connectionId ? (
        view === 'messages' ? (
          <Conversations connectionId={connectionId} canManage={canManage} />
        ) : (
          <Comments connectionId={connectionId} canManage={canManage} />
        )
      ) : null}
    </View>
  );
}
