import { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getMetaErrorMessage } from '@/src/api/meta.api';
import { useMetaPermissions, useReplyMetaComment } from '@/src/api/meta.hooks';
import { EmptyState, Field } from '@/src/ui';
import { ModalForm } from '@/src/ui/documents/pickers';
import { toast } from '@/src/ui/toast';

export default function MetaCommentReplyModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; connectionId?: string; author?: string; message?: string }>();
  const { canManageMessages } = useMetaPermissions();
  const [reply, setReply] = useState('');
  const mutation = useReplyMetaComment();

  if (!params.id || !params.connectionId) {
    return (
      <ModalForm title="Yorumu yanıtla" submitLabel="Kapat" onSubmit={() => router.back()}>
        <EmptyState title="Yorum bulunamadı" hint="Listeyi yenileyip tekrar açın." />
      </ModalForm>
    );
  }

  const submit = () => {
    const message = reply.trim();
    if (!message) return;
    mutation.mutate(
      { id: params.id!, connectionId: params.connectionId!, message },
      {
        onSuccess: () => {
          toast.success('Yanıt yayınlandı');
          router.back();
        },
        onError: (error) => toast.error(`Yorum yanıtlanamadı: ${getMetaErrorMessage(error)}`),
      },
    );
  };

  return (
    <ModalForm
      title="Yorumu yanıtla"
      submitLabel="Yanıtı yayınla"
      onSubmit={submit}
      loading={mutation.isPending}
      disabled={!canManageMessages || !reply.trim()}
    >
      <Text className="font-inter text-sm text-muted-foreground">Yanıt bağlı Meta hesabından herkese açık yayınlanır.</Text>
      {params.message ? (
        <View className="gap-1 rounded-control border border-border bg-card p-3">
          <Text className="font-inter-semibold text-xs text-muted-foreground">{params.author}</Text>
          <Text className="font-inter text-sm text-foreground">{params.message}</Text>
        </View>
      ) : null}
      <Field
        label="Yanıt"
        value={reply}
        onChangeText={setReply}
        maxLength={800}
        multiline
        textAlignVertical="top"
        style={{ minHeight: 120 }}
      />
      <Text className="font-inter text-xs text-muted-foreground">{reply.length}/800</Text>
    </ModalForm>
  );
}
