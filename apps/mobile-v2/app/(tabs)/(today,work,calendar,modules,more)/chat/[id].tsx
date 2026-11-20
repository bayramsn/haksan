import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, BottomSheetTextInput, BottomSheetView } from '@gorhom/bottom-sheet';
import {
  conversationTitle,
  useConversations,
  useConversationPreferences,
  useDeleteMessage,
  useEditMessage,
  useMarkConversationRead,
  useMessageContext,
  useMessages,
  useForwardMessage,
  usePinMessage,
  usePinnedMessages,
  useSendMessage,
  useSharedChatFiles,
  useToggleReaction,
} from '@/src/api/chat.hooks';
import type { ChatAttachment, ChatMessage, ChatPreferences } from '@/src/api/endpoints';
import { useAuth } from '@/src/auth/AuthProvider';
import { useCan } from '@/src/auth/AuthProvider';
import { isChatMessageTarget } from '@/src/modules/navigate';
import { dayLabel, formatTime } from '@/src/lib/format';
import { chatDraftKey } from '@/src/security/chatDraftStore';
import { useChatDraft } from '@/src/security/useChatDraft';
import { useTheme } from '@/src/theme/theme';
import { DetailHeader, ErrorState, Loading } from '@/src/ui';
import { useNativeCall } from '@/src/calls/provider';
import { useConversationRealtime } from '@/src/realtime/chat';
import { useTyping } from '@/src/realtime/useTyping';
import { files } from '@/src/api/endpoints';
import { downloadAndShareFile, pickDocument, pickImage, uploadChatAttachment, type LocalUpload, type UploadedAttachment } from '@/src/native/files';
import * as Location from 'expo-location';

function Bubble({
  message,
  mine,
  showSender,
  focused,
  mentionedMe,
  onPress,
  onLongPress,
  onReaction,
  onOpenAttachment,
  onOpenLocation,
}: {
  message: ChatMessage;
  mine: boolean;
  showSender: boolean;
  focused: boolean;
  mentionedMe: boolean;
  onPress?: () => void;
  onLongPress: () => void;
  onReaction: (emoji: string) => void;
  onOpenAttachment: (file: ChatMessage['attachments'][number]) => void;
  onOpenLocation: (location: NonNullable<ChatMessage['location']>) => void;
}) {
  if (message.kind === 'system') {
    return (
      <View className="items-center py-2">
        <Text className="rounded-full bg-muted px-3 py-1 font-inter text-[11px] text-muted-foreground">
          {message.body}
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${message.senderName}: ${message.body ?? 'Ek mesajı'}`}
      accessibilityHint={onPress ? "Mesajın sohbetteki yerini açar" : "Mesaj işlemleri için basılı tutun"}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      onLongPress={onLongPress}
      className={`my-1 max-w-[82%] ${mine ? 'self-end' : 'self-start'}`}
    >
      {showSender && !mine ? (
        <Text className="mb-0.5 px-1 font-inter-semibold text-[12px] text-primary">{message.senderName}</Text>
      ) : null}
      <View
        className={`rounded-overlay border px-3 py-2 ${
          focused || mentionedMe ? 'border-primary bg-primary-soft' : mine ? 'border-secondary bg-secondary' : 'border-border bg-card'
        }`}
      >
        {mentionedMe ? <Text className="mb-1 font-inter-semibold text-[11px] text-primary">Sizden bahsedildi</Text> : null}
        {message.forwardedFromId ? (
          <Text className="mb-1 font-inter-medium text-[11px] text-muted-foreground">İletildi</Text>
        ) : null}
        {message.pinnedAt ? (
          <Text className="mb-1 font-inter-medium text-[11px] text-muted-foreground">Sabitlendi</Text>
        ) : null}
        {message.replyTo ? (
          <View className="mb-1.5 border-l-2 border-primary pl-2">
            <Text className="font-inter-medium text-[11px] text-primary">{message.replyTo.senderName}</Text>
            <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>
              {message.replyTo.preview}
            </Text>
          </View>
        ) : null}

        {message.body ? (
          <Text className="font-inter text-[15px] leading-[1.35] text-foreground">{message.body}</Text>
        ) : null}

        {message.attachments.map((file) => (
          <Pressable
            key={file.fileId}
            accessibilityRole="button"
            accessibilityLabel={`${file.filename} dosyasını aç`}
            onPress={() => onOpenAttachment(file)}
            className="mt-1.5 min-h-11 flex-row items-center gap-2 rounded-control active:bg-muted"
          >
            <Ionicons name="document-outline" size={15} color="#5f697a" />
            <Text className="flex-1 font-inter text-[13px] text-foreground" numberOfLines={1}>
              {file.filename}
            </Text>
            <Ionicons name="share-outline" size={15} color="#5f697a" />
          </Pressable>
        ))}

        {message.location ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${message.location.label ?? 'Konum'} haritada aç`}
            onPress={() => onOpenLocation(message.location!)}
            className="mt-1.5 min-h-11 flex-row items-center gap-2 rounded-control active:bg-muted"
          >
            <Ionicons name="location-outline" size={15} color="#5f697a" />
            <Text className="flex-1 font-inter text-[13px] text-foreground">{message.location.label ?? 'Konum'}</Text>
            <Ionicons name="open-outline" size={15} color="#5f697a" />
          </Pressable>
        ) : null}

        <View className={`mt-1 flex-row items-center gap-1 ${mine ? 'justify-end' : ''}`}>
          <Text className={`font-inter text-[10px] text-muted-foreground ${mine ? 'text-right' : ''}`}>
            {formatTime(message.createdAt)}
            {message.editedAt ? ' · düzenlendi' : ''}
          </Text>
          {mine ? <Ionicons name="checkmark-done" size={14} color="#ef4444" /> : null}
        </View>
      </View>
      {message.reactions.length > 0 ? (
        <View className={`mt-1 flex-row flex-wrap gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
          {message.reactions.map((reaction) => (
            <Pressable
              key={reaction.emoji}
              accessibilityRole="button"
              accessibilityLabel={`${reaction.emoji} tepkisi, ${reaction.count} kişi`}
              accessibilityState={{ selected: reaction.mine }}
              onPress={() => onReaction(reaction.emoji)}
              className={`min-h-11 min-w-11 flex-row items-center justify-center gap-1 rounded-full border px-2 ${reaction.mine ? 'border-primary bg-primary-soft' : 'border-border bg-card'}`}
            >
              <Text className="text-sm">{reaction.emoji}</Text>
              <Text className="font-inter-semibold text-[11px] text-muted-foreground">{reaction.count}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const QUICK_REACTIONS = ['👍', '❤️', '🎉', '👀', '✅'] as const;

type MessageRow = { message: ChatMessage; showSender: boolean; dayBreak: string | null };
type ViewMode = 'live' | 'search' | 'pinned' | 'context' | 'files';
const NO_MESSAGES: ChatMessage[] = [];
const viewTitles = {
  pinned: 'Sabitlenen mesajlar',
  context: 'Mesajın sohbet içindeki yeri',
  files: 'Paylaşılan dosyalar',
} as const;
const MESSAGE_UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export default function ConversationRoute() {
  const { id, title, messageId } = useLocalSearchParams<{ id: string; title?: string; messageId?: string }>();
  const { user } = useAuth();
  const draftKey = chatDraftKey(user?.tenantId, user?.id, id);
  return <ConversationScreen key={draftKey ?? id} id={id} title={title} notificationMessageId={messageId} draftKey={draftKey} />;
}

function ConversationScreen({ id, title, notificationMessageId, draftKey }: {
  id: string;
  title?: string;
  notificationMessageId?: string;
  draftKey: string | null;
}) {
  const { user } = useAuth();
  const call = useNativeCall();
  const canCreateTask = useCan('tasks.create');
  const canCreateFiles = useCan('files.create');
  const canReadFiles = useCan('files.read');
  const { colors } = useTheme();
  const headerHeight = useHeaderHeight();
  const [mode, setMode] = useState<ViewMode>(() => notificationMessageId && MESSAGE_UUID.test(notificationMessageId) ? 'context' : 'live');
  const [focusId, setFocusId] = useState<string | null>(() => notificationMessageId && MESSAGE_UUID.test(notificationMessageId) ? notificationMessageId : null);
  const [searchText, setSearchText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const openForwardAfterDismiss = useRef(false);
  const [destinationSearch, setDestinationSearch] = useState('');
  const listRef = useRef<FlatList<MessageRow>>(null);
  const scrollRetry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollAttempts = useRef(0);
  const savedDraft = useChatDraft(draftKey);
  const [editDraft, setEditDraft] = useState('');
  const composerRef = useRef<TextInput>(null);
  const [cursor, setCursor] = useState(0);
  const [composerFocused, setComposerFocused] = useState(false);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const typing = useTyping(id, user?.id);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<UploadedAttachment[]>([]);
  const [pendingLocation, setPendingLocation] = useState<{ latitude: number; longitude: number; label?: string } | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const actionSheetRef = useRef<BottomSheetModal>(null);
  const forwardSheetRef = useRef<BottomSheetModal>(null);
  const menuSheetRef = useRef<BottomSheetModal>(null);
  const addSheetRef = useRef<BottomSheetModal>(null);
  const pendingAttachmentsRef = useRef<UploadedAttachment[]>([]);
  const mountedRef = useRef(true);
  useConversationRealtime(id);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const orphaned = pendingAttachmentsRef.current;
      pendingAttachmentsRef.current = [];
      for (const attachment of orphaned) void files.remove(attachment.fileId).catch(() => {});
    };
  }, []);

  const live = useMessages(id);
  const search = useMessages(id, mode === 'search' ? searchTerm : '');
  const pinned = usePinnedMessages(id, mode === 'pinned');
  const context = useMessageContext(id, mode === 'context' ? focusId : null);
  const sharedFiles = useSharedChatFiles(id, mode === 'files' && canReadFiles);
  const preferences = useConversationPreferences(id);
  const pin = usePinMessage(id);
  const forward = useForwardMessage();
  const activeQuery = mode === 'search' ? search : mode === 'pinned' ? pinned : mode === 'context' ? context : live;
  const activeMessages = (mode === 'pinned' ? pinned.data
    : mode === 'context' ? context.data?.messages
    : mode === 'search' ? search.data?.messages : live.data?.messages) ?? NO_MESSAGES;
  const waitingForSearch = mode === 'search' && searchText.trim() !== searchTerm;
  const showSearchPrompt = mode === 'search' && searchText.trim().length < 2;
  const pagedQuery = mode === 'search' ? search : mode === 'live' ? live : null;

  useEffect(() => {
    if (notificationMessageId && MESSAGE_UUID.test(notificationMessageId)) {
      setFocusId(notificationMessageId);
      setMode('context');
    }
  }, [notificationMessageId]);

  useEffect(() => {
    const timeout = setTimeout(() => setSearchTerm(searchText.trim()), 350);
    return () => clearTimeout(timeout);
  }, [searchText]);

  const conversations = useConversations();
  const send = useSendMessage(id);
  const edit = useEditMessage(id);
  const toggleReaction = useToggleReaction(id);
  const remove = useDeleteMessage(id);
  const markRead = useMarkConversationRead();

  // Geçmiş bir mesaja bakmak yeni mesajları okundu saymasın.
  useEffect(() => {
    if (id && mode === 'live') markRead.mutate(id);
    // markRead her render'da yeni referans; yalnızca id değişince çalışmalı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mode]);

  /** `inverted` liste en yeni mesajı altta tutar; ters sıralı veri ister. */
  const rows = useMemo<MessageRow[]>(() => {
    const messages = activeMessages;
    return messages
      .map((message, index) => ({
        message,
        // Aynı kişinin peş peşe mesajlarında ad tekrarlanmasın.
        showSender: messages[index - 1]?.senderId !== message.senderId,
        // Gün değiştiyse araya tarih ayracı.
        dayBreak:
          index === 0 || dayLabel(messages[index - 1]?.createdAt) !== dayLabel(message.createdAt)
            ? dayLabel(message.createdAt)
            : null,
      }))
      .reverse();
  }, [activeMessages]);

  const focusIndex = mode === 'context' ? rows.findIndex(({ message }) => message.id === focusId) : -1;
  useEffect(() => {
    scrollAttempts.current = 0;
    if (focusIndex < 0) return;
    const frame = requestAnimationFrame(() => listRef.current?.scrollToIndex({
      index: focusIndex, viewPosition: 0.5, animated: false,
    }));
    return () => {
      cancelAnimationFrame(frame);
      if (scrollRetry.current) clearTimeout(scrollRetry.current);
    };
  }, [focusIndex, focusId]);

  function focusMessage(messageId: string) {
    setFocusId(messageId);
    setMode('context');
  }

  const conversation = conversations.data?.find((item) => item.id === id);
  const isSuperAdmin = user?.roles.includes('super_admin') ?? false;
  const canPost = !conversation?.onlyAdminsCanPost || conversation.myRole === 'admin' || isSuperAdmin;
  const canPin = Boolean(conversation && (conversation.type === 'dm' || conversation.myRole === 'admin' || isSuperAdmin));
  const destinations = (conversations.data ?? []).filter((candidate) =>
    (!candidate.onlyAdminsCanPost || candidate.myRole === 'admin' || isSuperAdmin) &&
    conversationTitle(candidate, user?.id).toLocaleLowerCase('tr').includes(destinationSearch.trim().toLocaleLowerCase('tr'))
  );
  const composerEnabled = Boolean(editing) || canPost;
  const draft = editing ? editDraft : savedDraft.text;
  const composerBusy = send.isPending || edit.isPending || attachmentBusy;
  const hasComposerContent = editing
    ? draft.trim().length > 0
    : draft.trim().length > 0 || pendingAttachments.length > 0 || Boolean(pendingLocation);

  useEffect(() => {
    if (mode !== 'live' || editing || !canPost) typing.stop();
  }, [mode, editing, canPost, typing.stop]);

  const mentionMatch = composerFocused && !editing && conversation?.type === 'group'
    ? /(?:^|\s)@([^@\n]{0,80})$/.exec(draft.slice(0, cursor)) : null;
  const mentionQuery = mentionMatch?.[1]?.toLocaleLowerCase('tr') ?? '';
  const mentionCandidates = mentionMatch ? (conversation?.members ?? []).filter((member) =>
    member.userId !== user?.id && member.fullName.toLocaleLowerCase('tr').includes(mentionQuery)
  ).slice(0, 8) : [];

  function changeDraft(value: string) {
    if (editing) setEditDraft(value);
    else {
      savedDraft.update(value);
      if (mode === 'live' && canPost) typing.update(value);
    }
  }

  function selectMention(member: NonNullable<typeof conversation>['members'][number]) {
    if (!mentionMatch) return;
    const start = draft.lastIndexOf('@', cursor - 1);
    const inserted = `@${member.fullName} `;
    const next = draft.slice(0, start) + inserted + draft.slice(cursor);
    if (next.length > 4000) return;
    setMentionIds((previous) => [...new Set([...previous, member.userId])]);
    changeDraft(next);
    setCursor(start + inserted.length);
    composerRef.current?.focus();
  }

  async function submit() {
    const body = draft.trim();
    if (!hasComposerContent || composerBusy) return;
    typing.stop();
    if (editing) {
      edit.mutate(
        { messageId: editing.id, body },
        {
          onSuccess: () => { setEditing(null); setEditDraft(''); },
          onError: (error) => Alert.alert('Mesaj düzenlenemedi', error.message),
        }
      );
      return;
    }
    const sentRevision = savedDraft.currentRevision();
    const sentAttachments = pendingAttachmentsRef.current;
    // Navigation during send must not remove files the server is linking.
    pendingAttachmentsRef.current = [];
    try {
      await send.mutateAsync({
        ...(body ? { body } : {}),
        mentionUserIds: (conversation?.members ?? []).filter((member) =>
          mentionIds.includes(member.userId) && body.includes(`@${member.fullName}`)
        ).map((member) => member.userId),
        ...(replyTo?.id ? { replyToId: replyTo.id } : {}),
        ...(sentAttachments.length ? { attachmentFileIds: sentAttachments.map((item) => item.fileId) } : {}),
        ...(pendingLocation ? { location: pendingLocation } : {}),
      });
      if (body) savedDraft.clearSent(sentRevision);
      if (savedDraft.currentRevision() === sentRevision) setMentionIds([]);
      if (!mountedRef.current) return;
      setMode('live');
      setPendingAttachments([]);
      setPendingLocation(null);
      setReplyTo(null);
    } catch (error) {
      if (!mountedRef.current) {
        for (const attachment of sentAttachments) void files.remove(attachment.fileId).catch(() => {});
        return;
      }
      pendingAttachmentsRef.current = sentAttachments;
      Alert.alert('Mesaj gönderilemedi', error instanceof Error ? error.message : 'Tekrar deneyin.');
    }
  }

  async function addAttachment(picker: () => Promise<LocalUpload | null>) {
    if (pendingAttachmentsRef.current.length >= 10) {
      Alert.alert('Ek sınırı', 'Bir mesaja en fazla 10 dosya eklenebilir.');
      return;
    }
    setAttachmentBusy(true);
    try {
      const local = await picker();
      if (!local) return;
      const uploaded = await uploadChatAttachment(id, local);
      if (!mountedRef.current) {
        void files.remove(uploaded.fileId).catch(() => {});
        return;
      }
      const next = [...pendingAttachmentsRef.current, uploaded];
      pendingAttachmentsRef.current = next;
      setPendingAttachments(next);
    } catch (error) {
      Alert.alert('Dosya eklenemedi', error instanceof Error ? error.message : 'Dosya yüklenemedi.');
    } finally {
      if (mountedRef.current) setAttachmentBusy(false);
    }
  }

  function removePendingAttachment(fileId: string) {
    const next = pendingAttachmentsRef.current.filter((item) => item.fileId !== fileId);
    pendingAttachmentsRef.current = next;
    setPendingAttachments(next);
    void files.remove(fileId).catch(() => {});
  }

  async function addCurrentLocation() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Konum paylaşmak için konum izni gerekli.');
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Konum alınamadı; tekrar deneyin.')), 15_000)),
      ]);
      setPendingLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        label: 'Mevcut konum',
      });
    } catch (error) {
      Alert.alert('Konum eklenemedi', error instanceof Error ? error.message : 'Konum alınamadı.');
    }
  }

  function openAddMenu() {
    addSheetRef.current?.present();
  }

  async function openAttachment(file: ChatAttachment) {
    if (!canReadFiles) {
      Alert.alert('Yetki gerekli', 'Bu dosyayı açma yetkiniz yok.');
      return;
    }
    try {
      await downloadAndShareFile(file.fileId);
    } catch (error) {
      Alert.alert('Dosya açılamadı', error instanceof Error ? error.message : 'Dosya indirilemedi.');
    }
  }

  async function openLocation(location: NonNullable<ChatMessage['location']>) {
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    const url = Platform.select({
      ios: `maps:0,0?q=${encodeURIComponent(location.label ?? 'Konum')}@${latitude},${longitude}`,
      default: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(location.label ?? 'Konum')})`,
    });
    if (url && (await Linking.canOpenURL(url))) await Linking.openURL(url);
    else await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
  }

  function changePreferences(next: ChatPreferences) {
    if (!conversation || preferences.isPending) return;
    preferences.mutate(next, { onError: (error) => Alert.alert('Sohbet ayarı kaydedilemedi', error.message) });
  }

  function openView(next: ViewMode) {
    menuSheetRef.current?.dismiss();
    setMode(next);
  }

  function openActions(message: ChatMessage) {
    if (message.kind === 'system') return;
    setSelectedMessage(message);
    actionSheetRef.current?.present();
  }

  function react(messageId: string, emoji: string) {
    toggleReaction.mutate({ messageId, emoji }, {
      onError: (error) => Alert.alert('Tepki eklenemedi', error.message),
    });
  }

  function beginReply(message: ChatMessage) {
    setEditing(null);
    setReplyTo(message);
    actionSheetRef.current?.dismiss();
  }

  function beginEdit(message: ChatMessage) {
    setReplyTo(null);
    setEditing(message);
    setEditDraft(message.body ?? '');
    actionSheetRef.current?.dismiss();
  }

  function confirmDelete(message: ChatMessage) {
    actionSheetRef.current?.dismiss();
    Alert.alert('Mesajı sil', 'Bu mesaj sohbetten kaldırılacak. Devam edilsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => remove.mutate(message.id, {
          onError: (error) => Alert.alert('Mesaj silinemedi', error.message),
        }),
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
      <DetailHeader
        title={title ?? (conversation ? conversationTitle(conversation, user?.id) : 'Sohbet')}
        actions={[
          ...(conversation?.type === 'dm' && call.supported ? [
            { icon: 'call-outline' as const, label: 'Sesli ara', onPress: () => { void call.startCall(id, conversationTitle(conversation, user?.id), 'audio'); } },
            { icon: 'videocam-outline' as const, label: 'Görüntülü ara', onPress: () => { void call.startCall(id, conversationTitle(conversation, user?.id), 'video'); } },
          ] : []),
          { icon: 'search-outline', label: 'Sohbette ara', onPress: () => setMode(mode === 'search' ? 'live' : 'search') },
          { icon: 'ellipsis-horizontal', label: 'Sohbet seçenekleri', onPress: () => menuSheetRef.current?.present() },
        ]}
      />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        // Ekran native başlığın altından başlıyor; klavye hesabı onu da bilmeli.
        keyboardVerticalOffset={process.env.EXPO_OS === 'ios' ? headerHeight + 8 : 0}
      >
        {mode !== 'live' ? (
          <View className="flex-row items-center gap-2 border-b border-border bg-card px-4 py-2">
            {mode === 'search' ? (
              <TextInput
                accessibilityLabel="Sohbette mesaj ara"
                autoFocus
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Sohbette ara…"
                placeholderTextColor={colors.mutedForeground}
                maxLength={100}
                className="min-h-11 flex-1 rounded-control bg-muted px-3 font-inter text-foreground"
              />
            ) : (
              <Text className="flex-1 font-inter-semibold text-sm text-foreground">
                {viewTitles[mode]}
              </Text>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="Son mesajlara dön" onPress={() => setMode('live')} className="h-11 w-11 items-center justify-center">
              <Ionicons name="close" size={21} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ) : null}
        {mode === 'files' ? (
          !canReadFiles ? (
            <Text className="px-4 py-8 text-center font-inter text-sm text-muted-foreground">Dosyaları görüntüleme yetkiniz yok.</Text>
          ) : sharedFiles.isPending ? <Loading /> : sharedFiles.error ? (
            <ErrorState message={sharedFiles.error.message} onRetry={() => void sharedFiles.refetch()} />
          ) : (
            <FlatList
              data={sharedFiles.data}
              keyExtractor={(file) => file.fileId}
              refreshing={sharedFiles.isRefetching}
              onRefresh={() => void sharedFiles.refetch()}
              ListEmptyComponent={<Text className="px-4 py-8 text-center font-inter text-sm text-muted-foreground">Henüz dosya paylaşılmamış.</Text>}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.filename} dosyasını aç`}
                  onPress={() => void openAttachment(item)}
                  className="min-h-14 flex-row items-center gap-3 border-b border-border px-4 py-2 active:bg-muted"
                >
                  <Ionicons name="document-outline" size={22} color={colors.primary} />
                  <Text className="flex-1 font-inter-medium text-[15px] text-foreground" numberOfLines={2}>{item.filename}</Text>
                  <Ionicons name="share-outline" size={19} color={colors.mutedForeground} />
                </Pressable>
              )}
            />
          )
        ) : showSearchPrompt ? (
          <Text className="flex-1 px-4 pt-8 text-center font-inter text-sm text-muted-foreground">Aramak için en az iki karakter yazın.</Text>
        ) : waitingForSearch || activeQuery.isPending ? (
          <Loading />
        ) : activeQuery.error ? (
          <ErrorState message={activeQuery.error.message} onRetry={() => void activeQuery.refetch()} />
        ) : (
          <FlatList
            key={mode}
            ref={listRef}
            inverted={rows.length > 0}
            data={rows}
            keyExtractor={({ message }) => message.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
            onEndReachedThreshold={0.3}
            onEndReached={() => {
              if (pagedQuery?.hasNextPage && !pagedQuery.isFetchingNextPage) void pagedQuery.fetchNextPage();
            }}
            onScrollToIndexFailed={({ index, averageItemLength }) => {
              if (mode !== 'context' || index !== focusIndex || scrollAttempts.current >= 3) return;
              scrollAttempts.current += 1;
              listRef.current?.scrollToOffset({ offset: Math.max(0, index * averageItemLength), animated: false });
              if (scrollRetry.current) clearTimeout(scrollRetry.current);
              scrollRetry.current = setTimeout(() => listRef.current?.scrollToIndex({
                index, viewPosition: 0.5, animated: false,
              }), 120);
            }}
            ListEmptyComponent={<Text className="py-8 text-center font-inter text-sm text-muted-foreground">
              {mode === 'search' ? 'Eşleşen mesaj bulunamadı.' : mode === 'pinned' ? 'Sabitlenen mesaj yok.' : mode === 'context' ? 'Bu mesaj artık görüntülenemiyor.' : 'Henüz mesaj yok.'}
            </Text>}
            ListFooterComponent={pagedQuery?.isFetchingNextPage ? <Loading /> : null}
            renderItem={({ item }) => (
              <View>
                <Bubble
                  message={item.message}
                  mine={item.message.senderId === user?.id}
                  mentionedMe={Boolean(user?.id && item.message.mentionUserIds?.includes(user.id))}
                  showSender={item.showSender}
                  focused={mode === 'context' && item.message.id === focusId}
                  onPress={mode === 'pinned' || mode === 'search' ? () => focusMessage(item.message.id) : undefined}
                  onLongPress={() => openActions(item.message)}
                  onReaction={(emoji) => react(item.message.id, emoji)}
                  onOpenAttachment={(file) => void openAttachment(file)}
                  onOpenLocation={(location) => void openLocation(location)}
                />
                {/* inverted listede ayraç mesajın ALTINDA render edilir, ekranda üstünde görünür. */}
                {item.dayBreak ? (
                  <View className="items-center py-2">
                    <Text className="rounded-full bg-muted px-3 py-1 font-inter text-[11px] text-muted-foreground">
                      {item.dayBreak}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          />
        )}

        {mode === 'live' && typing.names.length > 0 ? (
          <Text accessibilityLiveRegion="polite" className="px-4 py-1 font-inter text-xs text-muted-foreground">
            {typing.names.slice(0, 3).join(', ')}{typing.names.length > 3 ? ' ve diğerleri' : ''} yazıyor…
          </Text>
        ) : null}
        {mode === 'live' ? <View className="border-t border-border bg-card px-3 py-2">
          {mentionCandidates.length > 0 ? (
            <View accessibilityLabel="Bahsedilecek grup üyesini seçin" className="mb-2 rounded-lg border border-border bg-card">
              {mentionCandidates.map((member) => (
                <Pressable key={member.userId} accessibilityRole="button" accessibilityLabel={`${member.fullName} kişisinden bahset`}
                  onPress={() => selectMention(member)} className="min-h-11 justify-center px-3 py-2">
                  <Text className="font-inter-medium text-sm text-primary">@{member.fullName}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {!editing && (pendingAttachments.length > 0 || pendingLocation) ? (
            <View className="mb-2 flex-row flex-wrap gap-2">
              {pendingAttachments.map((attachment) => (
                <Pressable
                  key={attachment.fileId}
                  accessibilityRole="button"
                  accessibilityLabel={`${attachment.fileName} ekini kaldır`}
                  disabled={composerBusy}
                  onPress={() => removePendingAttachment(attachment.fileId)}
                  className="min-h-11 max-w-[82%] flex-row items-center gap-2 rounded-full bg-muted px-3"
                >
                  <Ionicons name="document-outline" size={15} color={colors.mutedForeground} />
                  <Text className="max-w-[190px] font-inter text-xs text-foreground" numberOfLines={1}>{attachment.fileName}</Text>
                  <Ionicons name="close" size={15} color={colors.mutedForeground} />
                </Pressable>
              ))}
              {pendingLocation ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Konum ekini kaldır"
                  disabled={composerBusy}
                  onPress={() => setPendingLocation(null)}
                  className="min-h-11 flex-row items-center gap-2 rounded-full bg-muted px-3"
                >
                  <Ionicons name="location-outline" size={15} color={colors.mutedForeground} />
                  <Text className="font-inter text-xs text-foreground">Mevcut konum</Text>
                  <Ionicons name="close" size={15} color={colors.mutedForeground} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {editing || replyTo ? (
            <View className="mb-2 flex-row items-center gap-2 rounded-control bg-muted px-3 py-2">
              <View className="flex-1 gap-0.5">
                <Text className="font-inter-semibold text-xs text-primary">
                  {editing ? 'Mesaj düzenleniyor' : `${replyTo?.senderName} yanıtlanıyor`}
                </Text>
                <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
                  {(editing ?? replyTo)?.body ?? 'Ek mesajı'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="İşlemi iptal et"
                onPress={() => {
                  setEditing(null);
                  setReplyTo(null);
                  setEditDraft('');
                }}
                className="h-11 w-11 items-center justify-center"
              >
                <Ionicons name="close" size={19} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ) : null}
          {!editing && savedDraft.storageError ? (
            <Text className="mb-1 font-inter text-xs text-muted-foreground">Taslak cihaza kaydedilemedi. Uygulama açıkken korunur.</Text>
          ) : null}
          <View className="flex-row items-end gap-2 pb-2">
            {!editing ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={canCreateFiles ? 'Mesaja dosya, fotoğraf veya konum ekle' : 'Mesaja konum ekle'}
                accessibilityState={{ disabled: !composerEnabled || composerBusy }}
                disabled={!composerEnabled || composerBusy}
                onPress={openAddMenu}
                className="h-11 w-11 items-center justify-center active:opacity-60"
              >
                <Ionicons name={attachmentBusy ? 'hourglass-outline' : 'attach-outline'} size={24} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
            <View className="flex-1 flex-row items-center rounded-[20px] border border-border bg-card px-3">
              <TextInput
                ref={composerRef}
                accessibilityLabel={editing ? 'Mesajı düzenle' : 'Mesaj'}
                value={draft}
                onChangeText={changeDraft}
                onSelectionChange={(event) => setCursor(event.nativeEvent.selection.end)}
                onFocus={() => setComposerFocused(true)}
                onBlur={() => { setComposerFocused(false); typing.stop(); }}
                placeholder={composerEnabled ? 'Mesajınızı yazın...' : 'Yalnız grup yöneticileri mesaj gönderebilir'}
                placeholderTextColor={colors.mutedForeground}
                multiline
                editable={composerEnabled}
                maxLength={4000}
                className="max-h-28 min-h-[44px] flex-1 py-3 font-inter text-base text-foreground"
              />
              <Ionicons name="happy-outline" size={22} color={colors.mutedForeground} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={editing ? 'Değişikliği kaydet' : 'Gönder'}
              accessibilityState={{ disabled: !composerEnabled || (!hasComposerContent && draft.length === 0) || composerBusy }}
              disabled={!composerEnabled || composerBusy}
              onPress={draft.length > 0 || hasComposerContent ? submit : undefined}
              className={`h-11 w-11 items-center justify-center rounded-full bg-primary ${
                !composerEnabled || composerBusy ? 'opacity-40' : 'active:opacity-80'
              }`}
            >
              <Ionicons name={editing ? 'checkmark' : (draft.length > 0 || hasComposerContent ? 'send' : 'mic')} size={18} color={colors.primaryForeground} />
            </Pressable>
          </View>
        </View> : null}
      </KeyboardAvoidingView>

      <BottomSheetModal
        ref={menuSheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-1 px-5 pb-10 pt-2">
          <Text className="pb-1 font-inter-semibold text-base text-foreground">Sohbet seçenekleri</Text>
          <ChatMenuItem icon="pin-outline" label="Sabitlenen mesajlar" onPress={() => openView('pinned')} />
          {canReadFiles ? <ChatMenuItem icon="folder-open-outline" label="Paylaşılan dosyalar" onPress={() => openView('files')} /> : null}
          {conversation ? (
            <>
              <ChatMenuItem
                icon={conversation.isFavorite ? 'star' : 'star-outline'}
                label={conversation.isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                disabled={preferences.isPending}
                onPress={() => changePreferences({ isFavorite: !conversation.isFavorite })}
              />
              <ChatMenuItem
                icon={conversation.isMuted ? 'notifications-outline' : 'notifications-off-outline'}
                label={conversation.isMuted ? 'Sesi aç' : 'Sessize al'}
                disabled={preferences.isPending}
                onPress={() => changePreferences({ isMuted: !conversation.isMuted })}
              />
              {conversation.isMuted ? (
                <Text className="px-2 font-inter text-xs text-muted-foreground">Bahsetme bildirimleri açık kalır.</Text>
              ) : null}
              {conversation.type === 'group' ? (
                <ChatMenuItem icon="people-outline" label="Grup üyeleri" onPress={() => {
                  menuSheetRef.current?.dismiss();
                  router.push(`/chat/members?id=${encodeURIComponent(id)}`);
                }} />
              ) : null}
            </>
          ) : null}
        </BottomSheetView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={addSheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-2 px-5 pb-10 pt-2">
          <Text className="pb-1 font-inter-semibold text-base text-foreground">Mesaja ekle</Text>
          {canCreateFiles ? (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  addSheetRef.current?.dismiss();
                  void addAttachment(pickDocument);
                }}
                className="min-h-12 flex-row items-center gap-3 rounded-control px-2 active:bg-muted"
              >
                <Ionicons name="document-attach-outline" size={21} color={colors.foreground} />
                <Text className="font-inter-medium text-base text-foreground">Belge</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  addSheetRef.current?.dismiss();
                  void addAttachment(() => pickImage('library'));
                }}
                className="min-h-12 flex-row items-center gap-3 rounded-control px-2 active:bg-muted"
              >
                <Ionicons name="images-outline" size={21} color={colors.foreground} />
                <Text className="font-inter-medium text-base text-foreground">Galeriden fotoğraf</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  addSheetRef.current?.dismiss();
                  void addAttachment(() => pickImage('camera'));
                }}
                className="min-h-12 flex-row items-center gap-3 rounded-control px-2 active:bg-muted"
              >
                <Ionicons name="camera-outline" size={21} color={colors.foreground} />
                <Text className="font-inter-medium text-base text-foreground">Fotoğraf çek</Text>
              </Pressable>
            </>
          ) : (
            <Text className="font-inter text-xs leading-5 text-muted-foreground">
              Dosya ve fotoğraf eklemek için dosya oluşturma yetkisi gerekir.
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              addSheetRef.current?.dismiss();
              void addCurrentLocation();
            }}
            className="min-h-12 flex-row items-center gap-3 rounded-control px-2 active:bg-muted"
          >
            <Ionicons name="location-outline" size={21} color={colors.foreground} />
            <Text className="font-inter-medium text-base text-foreground">Mevcut konum</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={forwardSheetRef}
        snapPoints={['75%']}
        enableDynamicSizing={false}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
          <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
            <Text className="pb-3 font-inter-semibold text-base text-foreground">Mesajı ilet</Text>
            <BottomSheetTextInput
              accessibilityLabel="İletilecek sohbeti ara"
              placeholder="Sohbet ara…"
              placeholderTextColor={colors.mutedForeground}
              value={destinationSearch}
              onChangeText={setDestinationSearch}
              maxLength={100}
              className="mb-2 min-h-11 rounded-control bg-muted px-3 font-inter text-foreground"
            />
            {destinations.length === 0 ? (
              <Text className="py-4 font-inter text-sm text-muted-foreground">Uygun sohbet bulunamadı.</Text>
            ) : destinations.map((destination) => (
              <Pressable
                key={destination.id}
                accessibilityRole="button"
                accessibilityLabel={`${conversationTitle(destination, user?.id)} sohbetine ilet`}
                disabled={forward.isPending}
                onPress={() => {
                  if (!selectedMessage || forward.isPending) return;
                  forward.mutate({ messageId: selectedMessage.id, conversationId: destination.id }, {
                    onSuccess: () => {
                      forwardSheetRef.current?.dismiss();
                      Alert.alert('Mesaj iletildi', conversationTitle(destination, user?.id));
                    },
                    onError: (error) => Alert.alert('Mesaj iletilemedi', error.message),
                  });
                }}
                className="min-h-12 flex-row items-center justify-between gap-3 rounded-control px-2 active:bg-muted"
              >
                <Text className="flex-1 font-inter-medium text-base text-foreground" numberOfLines={1}>{conversationTitle(destination, user?.id)}</Text>
                <Ionicons name="arrow-redo-outline" size={19} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </BottomSheetScrollView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={actionSheetRef}
        enableDynamicSizing
        onDismiss={() => {
          if (!openForwardAfterDismiss.current) return;
          openForwardAfterDismiss.current = false;
          forwardSheetRef.current?.present();
        }}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-3 px-5 pb-10 pt-2">
          <Text className="font-inter-semibold text-base text-foreground">Mesaj işlemleri</Text>
          <View className="flex-row justify-between gap-2">
            {QUICK_REACTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={`${emoji} tepkisi ver`}
                disabled={!selectedMessage || toggleReaction.isPending}
                onPress={() => {
                  if (!selectedMessage) return;
                  react(selectedMessage.id, emoji);
                  actionSheetRef.current?.dismiss();
                }}
                className="h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card active:opacity-70"
              >
                <Text className="text-xl">{emoji}</Text>
              </Pressable>
            ))}
          </View>
          {selectedMessage ? (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={() => { setMode('live'); beginReply(selectedMessage); }}
                className="min-h-11 flex-row items-center gap-3 rounded-control px-2 active:bg-muted"
              >
                <Ionicons name="arrow-undo-outline" size={20} color={colors.foreground} />
                <Text className="font-inter-medium text-base text-foreground">Yanıtla</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setDestinationSearch('');
                  openForwardAfterDismiss.current = true;
                  actionSheetRef.current?.dismiss();
                }}
                className="min-h-11 flex-row items-center gap-3 rounded-control px-2 active:bg-muted"
              >
                <Ionicons name="arrow-redo-outline" size={20} color={colors.foreground} />
                <Text className="font-inter-medium text-base text-foreground">İlet</Text>
              </Pressable>
              {canPin ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={pin.isPending}
                  onPress={() => {
                    pin.mutate({ messageId: selectedMessage.id, pinned: !selectedMessage.pinnedAt }, {
                      onSuccess: () => actionSheetRef.current?.dismiss(),
                      onError: (error) => Alert.alert('Sabitleme değiştirilemedi', error.message),
                    });
                  }}
                  className="min-h-11 flex-row items-center gap-3 rounded-control px-2 active:bg-muted"
                >
                  <Ionicons name="pin-outline" size={20} color={colors.foreground} />
                  <Text className="font-inter-medium text-base text-foreground">{selectedMessage.pinnedAt ? 'Sabitlemeyi kaldır' : 'Sabitle'}</Text>
                </Pressable>
              ) : null}
              {canCreateTask ? (
                <ChatMenuItem icon="checkbox-outline" label="Görev oluştur" onPress={() => {
                  const chatSource = `${id}:${selectedMessage.id}`;
                  if (!isChatMessageTarget(chatSource)) return;
                  actionSheetRef.current?.dismiss();
                  router.push({ pathname: '/modal/task', params: { chatSource } });
                }} />
              ) : null}
              {selectedMessage.senderId === user?.id && selectedMessage.body ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => { setMode('live'); beginEdit(selectedMessage); }}
                  className="min-h-11 flex-row items-center gap-3 rounded-control px-2 active:bg-muted"
                >
                  <Ionicons name="create-outline" size={20} color={colors.foreground} />
                  <Text className="font-inter-medium text-base text-foreground">Düzenle</Text>
                </Pressable>
              ) : null}
              {selectedMessage.senderId === user?.id || isSuperAdmin || conversation?.myRole === 'admin' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => confirmDelete(selectedMessage)}
                  className="min-h-11 flex-row items-center gap-3 rounded-control px-2 active:bg-destructive-soft"
                >
                  <Ionicons name="trash-outline" size={20} color={colors.destructive} />
                  <Text className="font-inter-medium text-base text-destructive">Sil</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

function ChatMenuItem({ icon, label, disabled, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-11 flex-row items-center gap-3 rounded-control px-2 active:bg-muted ${disabled ? 'opacity-50' : ''}`}
    >
      <Ionicons name={icon} size={20} color={colors.foreground} />
      <Text className="font-inter-medium text-base text-foreground">{label}</Text>
    </Pressable>
  );
}
