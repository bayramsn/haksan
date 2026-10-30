import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCreateDelivery } from '@/src/api/logistics.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDate } from '@/src/lib/format';
import { Button } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { DeliveryFormFields } from '@/src/ui/service/DeliveryForm';
import { buildDeliveryPayload, deliveryDraft, type DeliveryDraft } from '@/src/ui/service/logistics';

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

/** Web CreateDeliveryDialog ("Yeni Teslimat"). */
export default function DeliveryCreateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ companyId?: string; companyName?: string }>();
  const canCreate = useCan('shipments.create');
  const create = useCreateDelivery();
  const [draft, setDraft] = useState<DeliveryDraft>(() => ({ ...deliveryDraft(null), companyId: first(params.companyId) }));
  const [companyName, setCompanyName] = useState(first(params.companyName));
  const [companyError, setCompanyError] = useState<string>();

  if (!canCreate) return <Redirect href={'/modules/deliveries' as Href} />;

  const submit = () => {
    if (!draft.companyId) {
      setCompanyError('Müşteri seçiniz');
      toast.error('Müşteri seçiniz');
      return;
    }
    const built = buildDeliveryPayload(draft);
    if ('error' in built) return toast.error(built.error);
    create.mutate(built.body, {
      onSuccess: (row) => {
        toast.success(`Teslimat kaydı oluşturuldu · ${row.company?.shortName ?? row.company?.legalTitle ?? companyName ?? 'Firma'} · ${formatDate(row.deliveryDate ?? draft.deliveryDate)}`);
        router.back();
      },
      onError: (error) => toast.error(`Teslimat kaydedilemedi: ${error.message}`),
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni Teslimat / Kurulum Tutanağı', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <Text className="font-inter text-[13px] text-muted-foreground">DR.MAK kurulum tutanağı formatında teslimat bilgilerini girin.</Text>
          <DeliveryFormFields
            draft={draft}
            companyName={companyName}
            companyError={companyError}
            onChange={(next) => {
              if (next.companyId !== draft.companyId) {
                setCompanyError(undefined);
                setCompanyName('');
              }
              setDraft(next);
            }}
          />
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <Button className="flex-1" label="Vazgeç" variant="ghost" disabled={create.isPending} onPress={() => router.back()} />
          <Button className="flex-[2]" label="Teslimatı Kaydet" loading={create.isPending} disabled={create.isPending} onPress={submit} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
