import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import type { CreateGroupInput, SendMessageInput } from '@haksan/shared';
import { chat, type ChatMessage, type Conversation } from './endpoints';
import { useChatRealtimeConnected } from '@/src/realtime/chat';
import { chatKeys } from './chat.keys';

type MessagePage = { messages: ChatMessage[]; hasMore: boolean };

function updateMessageCache(
  previous: InfiniteData<MessagePage, string | undefined> | undefined,
  update: (messages: ChatMessage[]) => ChatMessage[]
): InfiniteData<MessagePage, string | undefined> | undefined {
  if (!previous) return previous;
  return {
    ...previous,
    pages: previous.pages.map((page) => ({ ...page, messages: update(page.messages) })),
  };
}

export function useConversations() {
  const realtimeConnected = useChatRealtimeConnected();
  return useQuery({
    queryKey: chatKeys.conversations,
    queryFn: () => chat.conversations(),
    // Socket devre dışıysa/bağlanamıyorsa güvenilir polling fallback'i sürer.
    staleTime: 30 * 1000,
    refetchInterval: realtimeConnected ? false : 60 * 1000,
  });
}

export function useStartDm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => chat.startDm(userId),
    onSuccess: (conversation) => {
      qc.setQueryData<Conversation[]>(chatKeys.conversations, (previous) => [
        conversation,
        ...(previous ?? []).filter((item) => item.id !== conversation.id),
      ]);
    },
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGroupInput) => chat.createGroup(input),
    onSuccess: (conversation) => {
      qc.setQueryData<Conversation[]>(chatKeys.conversations, (previous) => [
        conversation,
        ...(previous ?? []).filter((item) => item.id !== conversation.id),
      ]);
    },
  });
}

export function useChatUnreadCount(): number {
  const { data } = useConversations();
  return (data ?? []).reduce((sum, c) => sum + c.unreadCount, 0);
}

export function useMessages(conversationId: string) {
  const realtimeConnected = useChatRealtimeConnected();
  return useInfiniteQuery({
    queryKey: chatKeys.messages(conversationId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => chat.messages(conversationId, { limit: 50, before: pageParam }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.messages[0]?.createdAt : undefined,
    select: (result) => {
      // API her sayfayı eskiden yeniye döndürür, ancak infinite-query sayfaları
      // en yeni sayfadan eskiye doğru biriktirir. Ekrana tek kronolojik dizi ver.
      const seen = new Set<string>();
      const messages = [...result.pages]
        .reverse()
        .flatMap((page) => page.messages)
        .filter((message) => {
          if (seen.has(message.id)) return false;
          seen.add(message.id);
          return true;
        });
      return { messages, hasMore: result.pages.at(-1)?.hasMore ?? false };
    },
    staleTime: 15 * 1000,
    refetchInterval: realtimeConnected ? false : 20 * 1000,
  });
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageInput) => chat.send(conversationId, input),
    onSuccess: (message) => {
      // Gönderilen mesajı listeye ekle: tam tazeleme beklemeden görünsün.
      qc.setQueryData<InfiniteData<MessagePage, string | undefined>>(
        chatKeys.messages(conversationId),
        (previous) => {
          const firstPage = previous?.pages[0];
          if (!firstPage) return previous;
          const pages = [...previous.pages];
          pages[0] = { ...firstPage, messages: [...firstPage.messages, message] };
          return { ...previous, pages };
        }
      );
      void qc.invalidateQueries({ queryKey: chatKeys.conversations });
    },
  });
}

export function useEditMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: string }) => chat.editMessage(messageId, body),
    onSuccess: (updated) => {
      qc.setQueryData<InfiniteData<MessagePage, string | undefined>>(
        chatKeys.messages(conversationId),
        (previous) => updateMessageCache(previous, (messages) =>
          messages.map((message) => message.id === updated.id ? updated : message)
        )
      );
    },
  });
}

export function useToggleReaction(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      chat.toggleReaction(messageId, emoji),
    onSuccess: (result) => {
      qc.setQueryData<InfiniteData<MessagePage, string | undefined>>(
        chatKeys.messages(conversationId),
        (previous) => updateMessageCache(previous, (messages) =>
          messages.map((message) =>
            message.id === result.messageId ? { ...message, reactions: result.reactions } : message
          )
        )
      );
    },
  });
}

export function useDeleteMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => chat.deleteMessage(messageId),
    onSuccess: (_result, messageId) => {
      qc.setQueryData<InfiniteData<MessagePage, string | undefined>>(
        chatKeys.messages(conversationId),
        (previous) => updateMessageCache(previous, (messages) => messages.filter((message) => message.id !== messageId))
      );
      void qc.invalidateQueries({ queryKey: chatKeys.conversations });
    },
  });
}

/** Konuşma açıldığında okundu bilgisini sunucuya bildirir (rozet sıfırlanır). */
export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => chat.markRead(conversationId),
    onSuccess: (_data, conversationId) => {
      qc.setQueryData<Conversation[]>(chatKeys.conversations, (prev) =>
        prev?.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
      );
    },
  });
}

/** DM/grup başlığı: grupta `title`, DM'de karşıdaki kişinin adı. */
export function conversationTitle(conversation: Conversation, myUserId: string | undefined): string {
  if (conversation.title) return conversation.title;
  const other = conversation.members.find((m) => m.userId !== myUserId);
  return other?.fullName ?? 'Sohbet';
}
