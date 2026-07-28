import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { chatService, fileService, type ChatAttachment } from '@/src/api/services';
import { PageHeader } from '@/src/ui/PageHeader';
import { Screen } from '@/src/ui/Screen';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { cardElevated, pressFade } from '@/src/theme/styles';

type Props = { conversationId: string };

type Msg = {
  id: string;
  body: string | null;
  createdAt: string;
  kind?: string;
  attachments?: ChatAttachment[];
  sender?: { fullName?: string };
  senderName?: string;
  isMine?: boolean;
};

/** Sesli mesaj balonu — expo-audio ile oynat/duraklat. */
function VoiceBubble({ url }: { url: string }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const toggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish) player.seekTo(0);
    player.play();
  };
  const seconds = Math.max(0, Math.round((status.duration || 0) - (status.currentTime || 0)));
  return (
    <Pressable onPress={toggle} style={({ pressed }) => [styles.voiceChip, pressFade(pressed)]}>
      <Ionicons name={status.playing ? 'pause' : 'play'} size={18} color={colors.primary} />
      <Text style={styles.voiceLabel}>Sesli mesaj{status.duration ? ` · ${seconds}sn` : ''}</Text>
    </Pressable>
  );
}

/** Stitch #11 Sohbet — mesaj thread */
export function ChatThreadScreen({ conversationId }: Props) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [title, setTitle] = useState('Sohbet');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const listRef = useRef<FlatList>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const load = useCallback(async () => {
    const [conv, msgRes] = await Promise.all([
      chatService.conversation(conversationId),
      chatService.messages(conversationId, { limit: 80 }),
    ]);
    setTitle(String((conv as { title?: string }).title ?? 'Sohbet'));
    const rows = (msgRes.messages ?? []) as Msg[];
    setMessages(rows.reverse());
    void chatService.markRead(conversationId);
  }, [conversationId]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    try {
      const msg = (await chatService.sendMessage(conversationId, { body })) as Msg;
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } finally {
      setSending(false);
    }
  };

  // ── Sesli mesaj: kaydet → yükle → gönder ──
  const startRecording = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const stopAndSendRecording = async () => {
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) return;
    setUploadingVoice(true);
    try {
      const blob = await (await fetch(uri)).blob();
      const up = await fileService.signedUpload({
        bucket: 'erp-service-documents',
        entityType: 'chat_conversation',
        entityId: conversationId,
        filename: `voice-${Date.now()}.m4a`,
        mimeType: 'audio/mp4',
        extension: 'm4a',
        sizeBytes: blob.size,
      });
      await fileService.uploadBinary(up, blob, 'audio/mp4');
      const msg = (await chatService.sendMessage(conversationId, { attachmentFileIds: [up.fileId] })) as Msg;
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } finally {
      setUploadingVoice(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <PageHeader roundedBottom={false}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressFade(pressed)]} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
      </PageHeader>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <FlatList
          ref={listRef}
          style={styles.flex}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.isMine ? styles.mine : styles.theirs]}>
              {!item.isMine && item.sender?.fullName ? (
                <Text style={styles.sender}>{item.sender.fullName}</Text>
              ) : null}
              {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
              {(item.attachments ?? []).map((a: ChatAttachment) =>
                a.mimeType.startsWith('audio/') ? (
                  <VoiceBubble key={a.fileId} url={a.url} />
                ) : (
                  <View key={a.fileId} style={styles.fileChip}>
                    <Ionicons name={a.isImage ? 'image' : 'document'} size={16} color={colors.primary} />
                    <Text style={styles.fileName} numberOfLines={1}>{a.filename}</Text>
                  </View>
                ),
              )}
              <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
            </View>
          )}
        />
        {recorderState.isRecording && (
          <View style={styles.recordingBar}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>Kayıt yapılıyor… {Math.round((recorderState.durationMillis ?? 0) / 1000)}sn</Text>
          </View>
        )}
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <TextInput
            style={styles.input}
            placeholder="Mesaj yazın…"
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
          />
          {recorderState.isRecording ? (
            <Pressable onPress={() => void stopAndSendRecording()} style={[styles.send, styles.recording]}>
              <Ionicons name="stop" size={20} color="#fff" />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void startRecording()}
              style={[styles.mic, uploadingVoice && styles.sendDisabled]}
              disabled={uploadingVoice}
            >
              {uploadingVoice ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="mic" size={20} color={colors.primary} />
              )}
            </Pressable>
          )}
          <Pressable onPress={() => void send()} style={[styles.send, sending && styles.sendDisabled]} disabled={sending}>
            <Ionicons name="send" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  back: { marginBottom: spacing.xs, alignSelf: 'flex-start' },
  headerTitle: { ...typography.headline, color: '#fff' },
  list: { padding: layout.screenPadding, gap: spacing.sm, flexGrow: 1 },
  bubble: { maxWidth: '82%', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primarySoft },
  theirs: { alignSelf: 'flex-start', ...cardElevated },
  sender: { ...typography.caption, color: colors.primary, marginBottom: 4 },
  body: { ...typography.body, color: colors.textPrimary },
  time: { ...typography.caption, color: colors.textMuted, marginTop: 4, alignSelf: 'flex-end' },
  voiceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  voiceLabel: { ...typography.caption, color: colors.textPrimary },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    maxWidth: 220,
  },
  fileName: { ...typography.caption, color: colors.textPrimary, flexShrink: 1 },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: 6,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#cf060c' },
  recordingText: { ...typography.caption, color: colors.textMuted },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    minHeight: layout.touchMin,
    maxHeight: 120,
    borderRadius: radius.sm,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    ...typography.body,
    color: colors.textPrimary,
  },
  mic: {
    width: layout.touchMin,
    height: layout.touchMin,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  send: {
    width: layout.touchMin,
    height: layout.touchMin,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recording: { backgroundColor: '#cf060c' },
  sendDisabled: { opacity: 0.6 },
});
