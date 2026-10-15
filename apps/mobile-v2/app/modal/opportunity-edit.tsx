import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useOpportunity, useUpdateOpportunity } from '@/src/api/crm.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { Button, ErrorState, Eyebrow, Field, Loading } from '@/src/ui';
import { DateTimeField } from '@/src/ui/pickers/DateTimeField';
import { ProductSelect } from '@/src/ui/select/fields';
import { toast } from '@/src/ui/toast';

const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'] as const;
type Currency = (typeof CURRENCIES)[number];

type Form = {
  title: string;
  requestedMachine: string;
  estimatedValue: string;
  currencyCode: Currency;
  probability: string;
  expectedCloseDate: Date | null;
  description: string;
  paymentTerms: string;
  contractTerms: string;
};

/** Kapanış tarihi gün olarak saklanır; yerel takvim günü gönderilir. */
function dayString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDay(value: string | null | undefined): Date | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

/** Fırsat kartının ticari alanları (web SalesCaseDetail düzenleme alanları). */
export default function OpportunityEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const opportunityId = typeof id === 'string' ? id : '';
  const canUpdate = useCan('opportunities.update');
  const detail = useOpportunity(opportunityId);
  const update = useUpdateOpportunity();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const loaded = useRef(false);

  useEffect(() => {
    const data = detail.data;
    if (!data || loaded.current) return;
    loaded.current = true;
    const currency = (CURRENCIES as readonly string[]).includes(data.currency?.code ?? '') ? (data.currency!.code as Currency) : 'USD';
    setForm({
      title: data.title ?? '',
      requestedMachine: data.requestedMachine ?? '',
      estimatedValue: data.estimatedValue != null ? String(Number(data.estimatedValue)) : '',
      currencyCode: currency,
      probability: String(data.probability ?? 50),
      expectedCloseDate: parseDay(data.expectedCloseDate),
      description: data.description ?? '',
      paymentTerms: data.paymentTerms ?? '',
      contractTerms: data.contractTerms ?? '',
    });
  }, [detail.data]);

  if (!canUpdate || !opportunityId) return <Redirect href={'/(tabs)/modules/opportunities' as Href} />;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  function submit() {
    if (!form) return;
    const next: Partial<Record<keyof Form, string>> = {};
    if (!form.title.trim()) next.title = 'Başlık zorunludur.';
    const value = form.estimatedValue.trim() ? Number(form.estimatedValue.replace(',', '.')) : null;
    if (value !== null && (!Number.isFinite(value) || value < 0)) next.estimatedValue = 'Pozitif bir tutar girin.';
    const probability = Number(form.probability);
    if (!Number.isInteger(probability) || probability < 0 || probability > 100) next.probability = '0-100 arası bir oran girin.';
    if (Object.values(next).some(Boolean)) {
      setErrors(next);
      return;
    }
    update.mutate(
      {
        id: opportunityId,
        title: form.title.trim(),
        requestedMachine: form.requestedMachine.trim(),
        ...(value !== null ? { estimatedValue: value } : {}),
        currencyCode: form.currencyCode,
        probability,
        ...(form.expectedCloseDate ? { expectedCloseDate: dayString(form.expectedCloseDate) } : {}),
        description: form.description.trim(),
        paymentTerms: form.paymentTerms.trim(),
        contractTerms: form.contractTerms.trim(),
      },
      {
        onSuccess: () => {
          toast.success('Fırsat güncellendi');
          router.back();
        },
        onError: (error) => toast.error(`Fırsat güncellenemedi: ${error.message}`),
      }
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Fırsatı Düzenle', headerShown: true }} />
      {detail.isPending ? (
        <Loading />
      ) : detail.error || !form ? (
        <ErrorState message={detail.error?.message ?? 'Kayıt yüklenemedi.'} onRetry={() => void detail.refetch()} />
      ) : (
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
            <View className="gap-3">
              <Eyebrow>Kart</Eyebrow>
              <Field label="Başlık *" value={form.title} onChangeText={(v) => set('title', v)} maxLength={255} error={errors.title} />
              <ProductSelect
                label="Talep edilen makine"
                value={form.requestedMachine}
                clearable
                placeholder="Katalogdan arayın veya yazın"
                onSelect={(item) => set('requestedMachine', item?.label ?? '')}
              />
              <Field label="Açıklama" value={form.description} onChangeText={(v) => set('description', v)} maxLength={4000} multiline numberOfLines={4} />
            </View>
            <View className="gap-3">
              <Eyebrow>Ticari</Eyebrow>
              <Field
                label="Tahmini tutar"
                value={form.estimatedValue}
                onChangeText={(v) => set('estimatedValue', v)}
                keyboardType="decimal-pad"
                error={errors.estimatedValue}
              />
              <View className="gap-1.5">
                <Text className="font-inter-medium text-xs text-muted-foreground">Para birimi</Text>
                <View className="flex-row gap-2">
                  {CURRENCIES.map((code) => {
                    const active = form.currencyCode === code;
                    return (
                      <Pressable
                        key={code}
                        accessibilityRole="radio"
                        accessibilityLabel={code}
                        accessibilityState={{ selected: active }}
                        onPress={() => set('currencyCode', code)}
                        className={`min-h-11 flex-1 items-center justify-center rounded-control border ${active ? 'border-primary bg-secondary' : 'border-border bg-card'}`}
                      >
                        <Text className={`font-inter-semibold text-xs ${active ? 'text-primary' : 'text-foreground'}`}>{code}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <Field
                label="Olasılık (%)"
                value={form.probability}
                onChangeText={(v) => set('probability', v)}
                keyboardType="number-pad"
                error={errors.probability}
              />
              <DateTimeField
                label="Beklenen kapanış"
                mode="date"
                value={form.expectedCloseDate}
                onChange={(v) => set('expectedCloseDate', v)}
                placeholder="Tarih seçin"
                clearable
              />
            </View>
            <View className="gap-3">
              <Eyebrow>Şartlar</Eyebrow>
              <Field label="Ödeme şartları" value={form.paymentTerms} onChangeText={(v) => set('paymentTerms', v)} maxLength={2000} multiline numberOfLines={3} />
              <Field label="Sözleşme şartları" value={form.contractTerms} onChangeText={(v) => set('contractTerms', v)} maxLength={4000} multiline numberOfLines={3} />
            </View>
          </ScrollView>
          <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
            <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
            <View className="flex-[2]"><Button label="Kaydet" loading={update.isPending} onPress={submit} /></View>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
