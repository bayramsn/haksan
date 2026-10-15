import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';

import { getMetaErrorMessage } from '@/src/api/meta.api';
import { useMetaMessages, useSendMetaMessage } from '@/src/api/meta.hooks';
import { useTheme } from '@/src/theme/theme';
import { EmptyState, ErrorState, ListSkeleton } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { PLATFORM_LABELS, formatMetaDate, type MetaPlatform } from '@/src/ui/meta/metaNormalize';
import { Notice } from '@/src/ui/meta/parts';

const PLATFORMS: MetaPlatform[] = ['facebook', 'instagram', 'messenger', 'whatsapp'];

export default function MetaConversationModal() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; connectionId?: string; platform?: string; name?: string; canReply?: string }>();
  const conversationId = params.id ?? '';
  const connectionId = params.connectionId ?? '';
  const platform: MetaPlatform = PLATFORMS.includes(params.platform as MetaPlatform) ? (params.platform as MetaPlatform) : 'messenger';
  const canReply = params.canReply === '1';
  const messages = useMetaMessages(conversationId, connectionId);
  const send = useSendMetaMessage();
  const [text, setText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const submit = () => {
    const body = text.trim();
    if (!body || !canReply) return;
    send.mutate(
      { conversationId, connectionId, channel: platform, text: body },
      {
        onSuccess: () => {
          setText('');
          toast.success('Mesaj gönderildi');
        },
        onError: (error) => toast.error(`Mesaj gönderilemedi: ${getMetaErrorMessage(error)}`),
      },
    );
  };

  const title = params.name || 'Konuşma';

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title, headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <View className="border-b border-border px-4 py-2">
          <Text className="font-inter text-xs text-muted-foreground">{PLATFORM_LABELS[platform]} · Atama yok</Text>
        </View>
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerClassName="gap-2 p-4"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {!conversationId || !connectionId ? (
            <EmptyState icon="chatbubbles-outline" title="Bir konuşma seçin" hint="Mesaj geçmişini okumak ve yanıtlamak için listeden bir konuşma açın." />
          ) : messages.isLoading ? (
            <ListSkeleton />
          ) : messages.isError ? (
            <ErrorState message={getMetaErrorMessage(messages.error)} onRetry={() => void messages.refetch()} />
          ) : (messages.data?.length ?? 0) === 0 ? (
            <EmptyState icon="chatbubble-outline" title="Mesaj geçmişi boş" hint="Yeni mesajlar burada tarih sırasıyla görünür." />
          ) : (
            messages.data?.map((message) => {
              const outbound = message.direction === 'outbound';
              return (
                <View key={message.id} className={`max-w-[82%] gap-1 rounded-surface px-3 py-2 ${outbound ? 'self-end bg-primary' : 'self-start border border-border bg-card'}`}>
                  <Text selectable className="font-inter text-sm" style={{ color: outbound ? colors.primaryForeground : colors.foreground }}>{message.body}</Text>
                  <Text className="font-inter text-[10px]" style={{ color: outbound ? colors.primaryForeground : colors.mutedForeground }}>
                    {formatMetaDate(message.createdAt)}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
        {!canReply ? (
          <View className="px-4 pb-2">
            <Notice tone="warning" icon="alert-circle-outline" text="Yanıt penceresi kapalı veya yanıt yetkiniz yok. WhatsApp için onaylı şablon gerekebilir." />
          </View>
        ) : null}
        <View className="flex-row items-end gap-2 border-t border-border bg-card px-3 py-2">
          <TextInput
            accessibilityLabel="Mesaj"
            value={text}
            onChangeText={setText}
            maxLength={1000}
            multiline
            editable={canReply && !send.isPending}
            placeholder="Yanıtınızı yazın"
            placeholderTextColor={colors.mutedForeground}
            className="max-h-32 min-h-[44px] flex-1 rounded-control bg-input-background px-3 py-2.5 font-inter text-base text-foreground"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mesajı gönder"
            accessibilityState={{ disabled: !canReply || !text.trim() || send.isPending }}
            disabled={!canReply || !text.trim() || send.isPending}
            onPress={submit}
            className={`h-11 w-11 items-center justify-center rounded-full bg-primary active:opacity-70 ${!canReply || !text.trim() || send.isPending ? 'opacity-40' : ''}`}
          >
            <Ionicons name="send" size={18} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
