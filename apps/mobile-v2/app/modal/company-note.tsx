import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCompany, useUpdateCompanyFields } from '@/src/api/companies.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { Button, ErrorState, Field, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';

const NOTE_MAX_LENGTH = 4000;

/** Web CompanyNotesCard düzenleme penceresi. */
export default function CompanyNoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const canEdit = useCan('companies.update');
  const company = useCompany(id);
  const update = useUpdateCompanyFields(id);
  const [draft, setDraft] = useState('');
  const original = company.data?.notes ?? '';

  useEffect(() => {
    if (company.data) setDraft(company.data.notes ?? '');
  }, [company.data]);

  if (!canEdit) return <Redirect href="/(tabs)/modules/companies" />;

  function save() {
    const next = draft.trim();
    update.mutate(
      { notes: next || null },
      {
        onSuccess: () => {
          toast.success(`Firma notu kaydedildi · ${company.data?.legalTitle ?? ''}`.trim());
          router.back();
        },
        onError: (error) => toast.error(`Firma notu kaydedilemedi · ${error.message || 'API isteği başarısız oldu.'}`),
      },
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Firma Notları', headerShown: true }} />
      {company.isPending ? (
        <Loading />
      ) : company.error ? (
        <ErrorState message={company.error.message} onRetry={() => void company.refetch()} />
      ) : (
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
            <Text className="font-inter-medium text-sm text-foreground">{company.data?.legalTitle}</Text>
            <Field
              label="Not"
              value={draft}
              onChangeText={setDraft}
              placeholder="Firmaya dair notlar…"
              multiline
              maxLength={NOTE_MAX_LENGTH}
              className="min-h-[200px]"
              textAlignVertical="top"
              editable={!update.isPending}
              autoFocus
            />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button label="Vazgeç" variant="ghost" disabled={update.isPending} onPress={() => router.back()} />
              </View>
              <View className="flex-1">
                <Button
                  label={update.isPending ? 'Kaydediliyor…' : 'Kaydet'}
                  loading={update.isPending}
                  disabled={update.isPending || draft === original}
                  onPress={save}
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
