import { useHierarchyBack } from '@/src/modules/useHierarchyBack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import {
  useConversations,
  useDeleteMessage,
  useEditMessage,
  useMarkConversationRead,
  useMessages,
  useSendMessage,
  useToggleReaction,
} from '@/src/api/chat.hooks';
import { useChatConversation, useChatSearch, useChatWebRtcConfig } from '@/src/api/crm-general.hooks';
import type { ChatConversationDetail } from '@/src/api/crm-general.api';
import type { ChatMessage } from '@/src/api/endpoints';
import { mediaUrl } from '@/src/api/config';
import { useAuth } from '@/src/auth/AuthProvider';
import { useCan } from '@/src/auth/AuthProvider';
import { dayLabel, formatTime } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { EmptyState, ErrorState, Loading } from '@/src/ui';
import {
  CHAT_EMOJIS,
  REF_TYPE_LABELS,
  canManageGroup,
  canSearchMessages,
  conversationDisplayName,
  isSeenByOther,
  memberSubtitle,
  normalizeAttachment,
  parseRefCard,
  refCardRoute,
  type NormalizedAttachment,
} from '@/src/ui/crm/chat-logic';
import { useConversationRealtime } from '@/src/realtime/chat';
import { files } from '@/src/api/endpoints';
import { downloadAndShareFile, pickDocument, pickImage, uploadChatAttachment, type LocalUpload, type UploadedAttachment } from '@/src/native/files';
import * as Location from 'expo-location';
import { useGlassTabClearance } from '@/src/ui/LiquidGlassTabBarBackground';

function Bubble({
  message,
  mine,
  showSender,
  seen,
  onLongPress,
  onReaction,
  onOpenAttachment,
  onOpenLocation,
}: {
  message: ChatMessage;
  mine: boolean;
  showSender: boolean;
  seen: boolean;
  onLongPress: () => void;
  onReaction: (emoji: string) => void;
  onOpenAttachment: (file: NormalizedAttachment) => void;
  onOpenLocation: (location: NonNullable<ChatMessage['location']>) => void;
}) {
  const { colors } = useTheme();
  const attachments = useMemo(
    () => (message.attachments as unknown[]).map(normalizeAttachment).filter((item): item is NormalizedAttachment => Boolean(item)),
    [message.attachments],
  );
  const refCard = parseRefCard(message.refCard);
  const refRoute = refCard ? refCardRoute(refCard) : null;

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
      accessibilityLabel={`${message.senderName}: ${message.body ?? refCard?.title ?? 'Ek mesajı'}`}
      accessibilityHint="Mesaj işlemleri için basılı tutun"
      onLongPress={onLongPress}
      className={`my-1 max-w-[82%] ${mine ? 'self-end' : 'self-start'}`}
    >
      {showSender && !mine ? (
        <Text className="mb-0.5 px-1 font-inter-semibold text-[12px] text-primary">{message.senderName}</Text>
      ) : null}
      <View
        className={`rounded-overlay border px-3 py-2 ${
          mine ? 'border-secondary bg-secondary' : 'border-border bg-card'
        }`}
      >
        {message.replyTo ? (
          <View className="mb-1.5 border-l-2 border-primary pl-2">
            <Text className="font-inter-medium text-[11px] text-primary">{message.replyTo.senderName}</Text>
            <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>
              {message.replyTo.preview}
            </Text>
          </View>
        ) : null}

        {message.body ? (
          <Text selectable className="font-inter text-[15px] leading-[1.35] text-foreground">{message.body}</Text>
        ) : null}

        {refCard ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${REF_TYPE_LABELS[refCard.type] ?? 'Kayıt'}: ${refCard.title}`}
            accessibilityState={{ disabled: !refRoute }}
            disabled={!refRoute}
            onPress={() => refRoute && router.push(refRoute as Href)}
            className="mt-1.5 min-h-11 flex-row items-center gap-2 rounded-control border border-border bg-card px-2.5 py-2 active:opacity-70"
          >
            <Ionicons name={refCard.missing ? 'alert-circle-outline' : 'link-outline'} size={16} color={refCard.missing ? colors.mutedForeground : colors.primary} />
            <View className="flex-1">
              <Text className="font-inter-medium text-[11px] uppercase text-muted-foreground">{REF_TYPE_LABELS[refCard.type] ?? 'Kayıt'}</Text>
              <Text className="font-inter-semibold text-[13px] text-foreground" numberOfLines={2}>{refCard.title}</Text>
              {refCard.subtitle ? (
                <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>{refCard.subtitle}</Text>
              ) : null}
            </View>
            {refRoute ? <Ionicons name="chevron-forward" size={15} color={colors.mutedForeground} /> : null}
          </Pressable>
        ) : null}

        {attachments.map((file) => {
          const imageUri = file.isImage ? mediaUrl(file.url) : null;
          return imageUri ? (
            <Pressable
              key={file.fileId}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${file.filename} görselini aç`}
              onPress={() => onOpenAttachment(file)}
              className="mt-1.5 overflow-hidden rounded-control active:opacity-80"
            >
              <Image source={{ uri: imageUri }} style={{ width: 220, height: 160 }} resizeMode="cover" accessibilityIgnoresInvertColors />
            </Pressable>
          ) : (
            <Pressable
              key={file.fileId}
              accessibilityRole="button"
              accessibilityLabel={`${file.filename} dosyasını aç`}
              onPress={() => onOpenAttachment(file)}
              className="mt-1.5 min-h-11 flex-row items-center gap-2 rounded-control active:bg-muted"
            >
              <Ionicons name="document-outline" size={15} color={colors.mutedForeground} />
              <Text className="flex-1 font-inter text-[13px] text-foreground" numberOfLines={1}>
                {file.filename}
              </Text>
              <Ionicons name="share-outline" size={15} color={colors.mutedForeground} />
            </Pressable>
          );
        })}

        {message.location ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${message.location.label ?? 'Konum'} haritada aç`}
            onPress={() => onOpenLocation(message.location!)}
            className="mt-1.5 min-h-11 flex-row items-center gap-2 rounded-control active:bg-muted"
          >
            <Ionicons name="location-outline" size={15} color={colors.mutedForeground} />
            <Text className="flex-1 font-inter text-[13px] text-foreground">{message.location.label ?? 'Konum'}</Text>
            <Ionicons name="open-outline" size={15} color={colors.mutedForeground} />
          </Pressable>
        ) : null}

        <View className={`mt-1 flex-row items-center gap-1 ${mine ? 'justify-end' : ''}`}>
          <Text className={`font-inter text-[10px] text-muted-foreground ${mine ? 'text-right' : ''}`}>
            {formatTime(message.createdAt)}
            {message.editedAt ? ' · düzenlendi' : ''}
          </Text>
          {mine ? (
            <Ionicons
              accessibilityLabel={seen ? 'Okundu' : 'Gönderildi'}
              name={seen ? 'checkmark-done' : 'checkmark'}
              size={14}
              color={seen ? colors.info : colors.mutedForeground}
            />
          ) : null}
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

function HeaderIconButton({
  icon,
  label,
  onPress,
  active,
  busy,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  busy?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, selected: active }}
      disabled={busy}
      onPress={onPress}
      className={`h-11 w-11 items-center justify-center rounded-[12px] border active:bg-muted ${active ? 'border-primary bg-primary-soft' : 'border-border bg-card'} ${busy ? 'opacity-50' : ''}`}
    >
      <Ionicons name={icon} size={19} color={active ? colors.primary : colors.foreground} />
    </Pressable>
  );
}

export default function ConversationScreen() {
  const { goBack } = useHierarchyBack();
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const { user } = useAuth();
  const canCreateFiles = useCan('files.create');
  const canReadFiles = useCan('files.read');
  const { colors } = useTheme();
  const tabClearance = useGlassTabClearance();
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<UploadedAttachment[]>([]);
  const [pendingLocation, setPendingLocation] = useState<{ latitude: number; longitude: number; label?: string } | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const actionSheetRef = useRef<BottomSheetModal>(null);
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

  const { data, isPending, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } = useMessages(id);
  const conversations = useConversations();
  const detailQuery = useChatConversation(id);
  const search = useChatSearch(id, showSearch ? searchTerm : '');
  const webrtc = useChatWebRtcConfig();
  const send = useSendMessage(id);
  const edit = useEditMessage(id);
  const toggleReaction = useToggleReaction(id);
  const remove = useDeleteMessage(id);
  const markRead = useMarkConversationRead();

  // Ekran açıldığında okundu bildir; rozet takılı kalmasın.
  useEffect(() => {
    if (id) markRead.mutate(id);
    // markRead her render'da yeni referans; yalnızca id değişince çalışmalı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const searching = showSearch && canSearchMessages(searchTerm);

  /** `inverted` liste en yeni mesajı altta tutar; ters sıralı veri ister. */
  const rows = useMemo(() => {
    const messages = searching ? search.data ?? [] : data?.messages ?? [];
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
  }, [data, search.data, searching]);

  const detail: ChatConversationDetail | undefined = detailQuery.data;
  const conversation = conversations.data?.find((item) => item.id === id);
  const isSuperAdmin = user?.roles.includes('super_admin') ?? false;
  const myRole = detail?.myRole ?? conversation?.myRole;
  const onlyAdmins = detail?.onlyAdminsCanPost ?? conversation?.onlyAdminsCanPost ?? false;
  const canPost = !onlyAdmins || myRole === 'admin' || isSuperAdmin;
  const isGroup = (detail?.type ?? conversation?.type) === 'group';
  const headerTitle = detail ? conversationDisplayName(detail, user?.id, title ?? 'Sohbet') : title ?? 'Sohbet';
  const headerSubtitle = memberSubtitle(detail, user?.id);
  const composerEnabled = Boolean(editing) || canPost;
  const composerBusy = send.isPending || edit.isPending || attachmentBusy;
  const hasComposerContent = editing
    ? draft.trim().length > 0
    : draft.trim().length > 0 || pendingAttachments.length > 0 || Boolean(pendingLocation);

  function submit() {
    const body = draft.trim();
    if (!hasComposerContent || composerBusy) return;
    setDraft('');
    setShowEmoji(false);
    if (editing) {
      edit.mutate(
        { messageId: editing.id, body },
        {
          onSuccess: () => setEditing(null),
          onError: (error) => {
            setDraft(body);
            Alert.alert('Mesaj düzenlenemedi', error.message);
          },
        }
      );
      return;
    }
    send.mutate(
      {
        ...(body ? { body } : {}),
        ...(replyTo?.id ? { replyToId: replyTo.id } : {}),
        ...(pendingAttachments.length ? { attachmentFileIds: pendingAttachments.map((item) => item.fileId) } : {}),
        ...(pendingLocation ? { location: pendingLocation } : {}),
      },
      {
        onSuccess: () => {
          pendingAttachmentsRef.current = [];
          setPendingAttachments([]);
          setPendingLocation(null);
          setReplyTo(null);
        },
        // Gönderilemezse yazılan metin kaybolmasın.
        onError: (error) => {
          setDraft(body);
          Alert.alert('Mesaj gönderilemedi', error.message);
        },
      }
    );
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

  async function openAttachment(file: NormalizedAttachment) {
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

  /**
   * Web sesli/görüntülü arama WebRTC kullanır. Sunucu ICE yapılandırması
   * okunur; mobil derlemede WebRTC yerel modülü olmadığından arama başlatılamaz.
   */
  async function startCall() {
    const result = await webrtc.refetch();
    if (result.error) {
      Alert.alert('Arama başlatılamadı', result.error.message);
      return;
    }
    Alert.alert(
      'Arama bu cihazda desteklenmiyor',
      'Sesli ve görüntülü arama şimdilik yalnız web uygulamasında kullanılabilir. Mobil uygulamaya arama modülü eklendiğinde bu düğme doğrudan aramayı başlatacak.',
    );
  }

  function toggleSearch() {
    const next = !showSearch;
    setShowSearch(next);
    if (!next) {
      setSearchDraft('');
      setSearchTerm('');
    }
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
    setDraft(message.body ?? '');
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

  const listError = searching ? search.error : error;
  const listPending = searching ? search.isPending : isPending;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <View className="flex-row items-center gap-2.5 border-b border-border bg-card px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sohbet listesine dön"
          onPress={() => goBack()}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-60 -ml-2"
        >
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <View className="h-11 w-11 items-center justify-center rounded-full bg-secondary">
          <Ionicons name={isGroup ? 'people' : 'person'} size={20} color={colors.secondaryForeground} />
        </View>
        <View className="flex-1 justify-center gap-0.5">
          <Text accessibilityRole="header" className="font-inter-semibold text-[16px] text-foreground" numberOfLines={1}>
            {headerTitle}
          </Text>
          {headerSubtitle ? (
            <Text className="font-inter text-[13px] text-muted-foreground" numberOfLines={1}>
              {headerSubtitle}
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-1">
          <HeaderIconButton icon="search-outline" label="Mesajlarda ara" active={showSearch} onPress={toggleSearch} />
          {detail?.type === 'dm' ? (
            <HeaderIconButton icon="call-outline" label="Sesli arama başlat" busy={webrtc.isFetching} onPress={() => void startCall()} />
          ) : null}
          {detail?.type === 'group' ? (
            <HeaderIconButton
              icon="settings-outline"
              label="Grup ayarları"
              onPress={() => router.push(`/modal/chat-group-settings?id=${encodeURIComponent(id)}` as Href)}
            />
          ) : null}
        </View>
      </View>

      {showSearch ? (
        <View className="flex-row items-center gap-2 border-b border-border bg-card px-4 py-2">
          <View className="min-h-11 flex-1 flex-row items-center gap-2 rounded-control bg-input-background px-3">
            <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
            <TextInput
              autoFocus
              accessibilityLabel="Bu sohbette ara"
              value={searchDraft}
              onChangeText={setSearchDraft}
              onSubmitEditing={() => setSearchTerm(searchDraft)}
              returnKeyType="search"
              placeholder="Bu sohbette en az 2 karakterle ara…"
              placeholderTextColor={colors.mutedForeground}
              className="min-h-11 flex-1 font-inter text-sm text-foreground"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ara"
            accessibilityState={{ disabled: !canSearchMessages(searchDraft) }}
            disabled={!canSearchMessages(searchDraft)}
            onPress={() => setSearchTerm(searchDraft)}
            className={`h-11 items-center justify-center rounded-control bg-primary px-4 ${canSearchMessages(searchDraft) ? 'active:opacity-80' : 'opacity-40'}`}
          >
            <Text className="font-inter-semibold text-sm text-primary-foreground">Ara</Text>
          </Pressable>
          {searching && search.data ? (
            <Text className="font-inter text-xs text-muted-foreground">{search.data.length} sonuç</Text>
          ) : null}
        </View>
      ) : null}

      <KeyboardAvoidingView
        className="flex-1"
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={process.env.EXPO_OS === 'ios' ? 8 : 0}
      >
        {listPending ? (
          <Loading />
        ) : listError ? (
          <ErrorState message={listError.message} onRetry={() => void (searching ? search.refetch() : refetch())} />
        ) : rows.length === 0 ? (
          <View className="flex-1 justify-center">
            <EmptyState
              icon="chatbubbles-outline"
              title={searching ? 'Eşleşen mesaj bulunamadı' : 'Sohbet hazır'}
              hint={searching ? 'Başka bir kelimeyle tekrar arayın.' : 'İlk mesajı gönderin veya firma, teklif ve servis kaydı paylaşın.'}
            />
          </View>
        ) : (
          <FlatList
            inverted
            data={rows}
            keyExtractor={({ message }) => message.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
            onEndReachedThreshold={0.3}
            onEndReached={() => {
              if (!searching && hasNextPage && !isFetchingNextPage) void fetchNextPage();
            }}
            ListFooterComponent={isFetchingNextPage && !searching ? <Loading /> : null}
            renderItem={({ item }) => (
              <View>
                <Bubble
                  message={item.message}
                  mine={item.message.senderId === user?.id}
                  showSender={item.showSender && isGroup}
                  seen={isSeenByOther(item.message, detail, user?.id)}
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

        <View className="border-t border-border bg-card px-3 py-2" style={{ marginBottom: tabClearance }}>
          {!editing && (pendingAttachments.length > 0 || pendingLocation) ? (
            <View className="mb-2 flex-row flex-wrap gap-2">
              {pendingAttachments.map((attachment) => (
                <Pressable
                  key={attachment.fileId}
                  accessibilityRole="button"
                  accessibilityLabel={`${attachment.fileName} ekini kaldır`}
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
                  setDraft('');
                }}
                className="h-11 w-11 items-center justify-center"
              >
                <Ionicons name="close" size={19} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ) : null}
          {showEmoji && composerEnabled ? (
            <View className="mb-2 flex-row flex-wrap justify-between gap-y-1">
              {CHAT_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  accessibilityRole="button"
                  accessibilityLabel={`${emoji} ekle`}
                  onPress={() => setDraft((value) => `${value}${emoji}`)}
                  className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
                >
                  <Text className="text-xl">{emoji}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View className="flex-row items-end gap-2 pb-2">
            {!editing ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={canCreateFiles ? 'Mesaja dosya, fotoğraf, konum veya kayıt ekle' : 'Mesaja konum veya kayıt ekle'}
                accessibilityState={{ disabled: !composerEnabled || attachmentBusy }}
                disabled={!composerEnabled || attachmentBusy}
                onPress={() => addSheetRef.current?.present()}
                className="h-11 w-11 items-center justify-center active:opacity-60"
              >
                <Ionicons name={attachmentBusy ? 'hourglass-outline' : 'attach-outline'} size={24} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
            <View className="flex-1 flex-row items-center rounded-[20px] border border-border bg-card pl-3">
              <TextInput
                accessibilityLabel={editing ? 'Mesajı düzenle' : 'Mesaj'}
                value={draft}
                onChangeText={setDraft}
                placeholder={composerEnabled ? (editing ? 'Mesajı düzenleyin…' : 'Mesaj yazın…') : 'Yalnız grup yöneticileri mesaj gönderebilir'}
                placeholderTextColor={colors.mutedForeground}
                multiline
                editable={composerEnabled}
                maxLength={4000}
                className="max-h-28 min-h-[44px] flex-1 py-3 font-inter text-base text-foreground"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Emoji ekle"
                accessibilityState={{ selected: showEmoji, disabled: !composerEnabled }}
                disabled={!composerEnabled}
                onPress={() => setShowEmoji((value) => !value)}
                className="h-11 w-11 items-center justify-center active:opacity-60"
              >
                <Ionicons name={showEmoji ? 'happy' : 'happy-outline'} size={22} color={showEmoji ? colors.primary : colors.mutedForeground} />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={editing ? 'Değişikliği kaydet' : 'Gönder'}
              accessibilityState={{ disabled: !composerEnabled || !hasComposerContent || composerBusy }}
              disabled={!composerEnabled || !hasComposerContent || composerBusy}
              onPress={submit}
              className={`h-11 w-11 items-center justify-center rounded-full bg-primary ${
                !composerEnabled || !hasComposerContent || composerBusy ? 'opacity-40' : 'active:opacity-80'
              }`}
            >
              <Ionicons name={editing ? 'checkmark' : 'send'} size={18} color={colors.primaryForeground} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

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
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              addSheetRef.current?.dismiss();
              router.push(`/modal/chat-share-record?conversationId=${encodeURIComponent(id)}` as Href);
            }}
            className="min-h-12 flex-row items-center gap-3 rounded-control px-2 active:bg-muted"
          >
            <Ionicons name="link-outline" size={21} color={colors.foreground} />
            <Text className="font-inter-medium text-base text-foreground">Kayıt paylaş</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={actionSheetRef}
        enableDynamicSizing
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
                onPress={() => beginReply(selectedMessage)}
                className="min-h-11 flex-row items-center gap-3 rounded-control px-2 active:bg-muted"
              >
                <Ionicons name="arrow-undo-outline" size={20} color={colors.foreground} />
                <Text className="font-inter-medium text-base text-foreground">Yanıtla</Text>
              </Pressable>
              {selectedMessage.senderId === user?.id && selectedMessage.body ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => beginEdit(selectedMessage)}
                  className="min-h-11 flex-row items-center gap-3 rounded-control px-2 active:bg-muted"
                >
                  <Ionicons name="create-outline" size={20} color={colors.foreground} />
                  <Text className="font-inter-medium text-base text-foreground">Düzenle</Text>
                </Pressable>
              ) : null}
              {selectedMessage.senderId === user?.id || isSuperAdmin || canManageGroup(detail, isSuperAdmin) || myRole === 'admin' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => confirmDelete(selectedMessage)}
                  className="min-h-11 flex-row items-center gap-3 rounded-control px-2 active:bg-destructive-soft"
                >
                  <Ionicons name="trash-outline" size={20} color={colors.destructive} />
                  <Text className="font-inter-medium text-base text-destructive">Herkesten sil</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
