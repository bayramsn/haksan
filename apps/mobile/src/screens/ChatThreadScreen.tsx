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
import { chatService } from '@/src/api/services';
import { PageHeader } from '@/src/ui/PageHeader';
import { Screen } from '@/src/ui/Screen';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { cardElevated, pressFade } from '@/src/theme/styles';

type Props = { conversationId: string };

type Msg = {
  id: string;
  body: string;
  createdAt: string;
  sender?: { fullName?: string };
  isMine?: boolean;
};

/** Stitch #11 Sohbet — mesaj thread */
export function ChatThreadScreen({ conversationId }: Props) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [title, setTitle] = useState('Sohbet');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

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
              <Text style={styles.body}>{item.body}</Text>
              <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
            </View>
          )}
        />
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <TextInput
            style={styles.input}
            placeholder="Mesaj yazın…"
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
          />
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
  send: {
    width: layout.touchMin,
    height: layout.touchMin,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.6 },
});
