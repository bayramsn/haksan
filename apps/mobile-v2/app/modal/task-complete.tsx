import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useToggleTaskDone } from '@/src/api/tasks.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { Button, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { TASK_COMPLETION_NOTE_MAX_LENGTH, buildCompletionPatch } from '@/src/ui/crm/task-logic';

/** Web TaskCompletionDialog: görev ancak tamamlama notuyla kapanır. */
export default function TaskCompleteScreen() {
  const router = useRouter();
  const { id = '', title = '' } = useLocalSearchParams<{ id: string; title?: string }>();
  const canUpdate = useCan('tasks.update');
  const complete = useToggleTaskDone();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!id || !canUpdate) return <Redirect href="/(tabs)/modules/tasks" />;

  function submit() {
    if (complete.isPending) return;
    const result = buildCompletionPatch(note);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    complete.mutate(
      { id, status: 'done', completionNote: result.patch.completionNote },
      {
        onSuccess: () => {
          toast.success('Görev tamamlama notuyla kaydedildi');
          router.back();
        },
        onError: (cause) => setError(cause.message || 'Görev tamamlanamadı. Tekrar deneyin.'),
      },
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Görevi tamamla', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-3 p-4 pb-8" keyboardShouldPersistTaps="handled">
          <Text className="font-inter text-sm text-muted-foreground">
            {title ? `${title} — ` : ''}Yapılan işi ve sonucunu yazın. Not, görev geçmişine kaydedilir.
          </Text>
          <Field
            label="Tamamlama notu (zorunlu)"
            value={note}
            onChangeText={(value) => {
              setNote(value);
              if (error) setError(null);
            }}
            autoFocus
            editable={!complete.isPending}
            maxLength={TASK_COMPLETION_NOTE_MAX_LENGTH}
            multiline
            placeholder="Örn. Müşteri arandı, teklif iletildi ve teslim tarihi netleştirildi."
            style={{ minHeight: 112, paddingTop: 12 }}
          />
          <Text className="font-inter text-xs text-muted-foreground">
            Not yazmadan görev tamamlanamaz. {note.length}/{TASK_COMPLETION_NOTE_MAX_LENGTH}
          </Text>
          {error ? (
            <Text accessibilityRole="alert" className="font-inter text-sm text-destructive">
              {error}
            </Text>
          ) : null}
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1">
            <Button label="Vazgeç" variant="ghost" disabled={complete.isPending} onPress={() => router.back()} />
          </View>
          <View className="flex-[2]">
            <Button
              label={complete.isPending ? 'Kaydediliyor…' : 'Notu kaydet ve tamamla'}
              loading={complete.isPending}
              disabled={complete.isPending || !note.trim()}
              onPress={submit}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
