import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCreateReceivable } from '@/src/api/finance.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import type { OpportunityPaymentMethodCode } from '@haksan/shared';
import { buildReceivableDraft, RECEIVABLE_METHOD_OPTIONS } from '@/src/features/receivable-form';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { Button, Field } from '@/src/ui';
import { CompanyPicker } from '@/src/ui/pickers/CompanyPicker';
import { toast } from '@/src/ui/toast';
import { DateTextField } from '@/src/ui/select/DateTextField';
import { LookupSelect } from '@/src/ui/select/fields';

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

/** Bağımsız tek alacak kaydı; fırsatın toplu plan akışı payment-plan ekranındadır. */
export default function NewReceivableScreen() {
  const router = useRouter();
  const canCreate = useCan('receivables.create');
  const params = useLocalSearchParams<{ companyId?: string; companyName?: string }>();
  const create = useCreateReceivable();

  const [companyId, setCompanyId] = useState(first(params.companyId));
  const [companyName, setCompanyName] = useState(first(params.companyName));
  const [amount, setAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState('TRY');
  const [dueDate, setDueDate] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<OpportunityPaymentMethodCode>('undecided');
  const [documentRef, setDocumentRef] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  if (!canCreate) return <Redirect href="/modules/receivables" />;

  function submit() {
    if (create.isPending) return;
    const result = buildReceivableDraft({ companyId, amount, currencyCode, dueDate, invoiceNo, paymentMethod, documentRef, notes });
    if (!result.ok) { setErrors(result.errors); return; }
    create.mutate(
      { ...result.body, dueDate: result.body.dueDate.toISOString() },
      {
        onSuccess: () => {
          toast.success('Alacak kaydı oluşturuldu');
          router.back();
        },
        onError: (error) => toast.error(error.message),
      }
    );
  }


  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni Alacak', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-8" keyboardShouldPersistTaps="handled">
          <CompanyPicker label="Firma *" value={companyId ? { id: companyId, name: companyName || 'Seçili firma' } : null} error={errors.companyId}
            onChange={(next) => { setCompanyId(next?.id ?? ''); setCompanyName(next?.name ?? ''); setErrors((current) => ({ ...current, companyId: undefined })); }} />

          <Field label="Tutar *" value={amount} keyboardType="decimal-pad" error={errors.amount}
            onChangeText={(value) => { setAmount(value); setErrors((current) => ({ ...current, amount: undefined })); }} />
          <LookupSelect name="currencies" label="Para birimi *" value={currencyCode} onChange={setCurrencyCode} clearable={false} error={errors.currencyCode} />

          <DateTextField
            label="Vade tarihi *"
            value={dueDate}
            onChangeText={(v) => { setDueDate(v); setErrors((p) => ({ ...p, dueDate: undefined })); }}
            error={errors.dueDate}
          />
          <OptionPicker label="Ödeme yöntemi" value={paymentMethod} options={RECEIVABLE_METHOD_OPTIONS}
            onChange={(value) => setPaymentMethod(value as OpportunityPaymentMethodCode)} searchable error={errors.paymentMethod} />
          <Field label="Belge referansı / çek-senet no" value={documentRef} onChangeText={setDocumentRef} maxLength={128} error={errors.documentRef} />
          <Field label="Fatura no" value={invoiceNo} onChangeText={setInvoiceNo} maxLength={64} error={errors.invoiceNo} />
          <Field
            label="Not"
            value={notes}
            onChangeText={setNotes}
            maxLength={2000}
            error={errors.notes}
            multiline
            numberOfLines={3}
            className="min-h-[80px] rounded-control border border-border bg-card px-3.5 py-3 text-base text-foreground"
          />
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label="Kaydet" loading={create.isPending} onPress={submit} /></View>
        </View>
      </KeyboardAvoidingView>

    </SafeAreaView>
  );
}
