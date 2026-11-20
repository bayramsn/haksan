import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCreateReceivable } from '@/src/api/finance.hooks';
import { useQuoteList } from '@/src/api/crm.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { CompanyPickerField, type PickedCompany } from '@/src/features/CompanyPickerField';
import { parseDecimal } from '@/src/lib/format';
import { Button, Field, FilterChips } from '@/src/ui';
import { toast } from '@/src/ui/toast';

const CURRENCIES = [{ value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }, { value: 'TRY', label: 'TRY' }];

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Beklenen tahsilat — web CreateReceivableDialog: USD, vade bugün, isteğe bağlı teklif bağı. */
export default function NewReceivableScreen() {
  const router = useRouter();
  const canCreate = useCan('receivables.create');
  const canReadQuotes = useCan('quotes.read');
  const params = useLocalSearchParams<{ companyId?: string; companyName?: string; quoteId?: string }>();
  const create = useCreateReceivable();

  const initialCompanyId = first(params.companyId);
  const [company, setCompany] = useState<PickedCompany | null>(initialCompanyId ? { id: initialCompanyId, name: first(params.companyName) } : null);
  const [quoteId, setQuoteId] = useState<string | null>(first(params.quoteId) || null);
  const [amount, setAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [dueDate, setDueDate] = useState(today());
  const [invoiceNo, setInvoiceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const quotes = useQuoteList({ companyId: company?.id }, Boolean(company?.id) && canReadQuotes);
  const quoteOptions = (quotes.data?.items ?? []).map((quote) => ({ value: quote.id, label: `${quote.documentNo} · R${quote.revisionNo}` }));

  if (!canCreate) return <Redirect href="/modules/receivables" />;

  function submit() {
    const nextErrors: Record<string, string | undefined> = {};
    if (!company) nextErrors.companyId = 'Firma seçiniz.';
    const value = parseDecimal(amount);
    if (!Number.isFinite(value) || value <= 0) nextErrors.amount = 'Geçerli bir tutar giriniz.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())) nextErrors.dueDate = 'Vade tarihi giriniz (YYYY-AA-GG).';
    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors);
      return;
    }
    create.mutate(
      {
        companyId: company!.id,
        quoteId: quoteId || undefined,
        amount: value,
        currencyCode,
        dueDate: new Date(dueDate.trim()),
        movementType: 'manual',
        invoiceNo: invoiceNo.trim() || undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Tahsilat (beklenen) eklendi');
          router.back();
        },
        onError: (error) => toast.error(error.message),
      }
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Tahsilat Ekle', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-4 p-4 pb-8" keyboardShouldPersistTaps="handled">
          <CompanyPickerField
            required
            value={company}
            error={errors.companyId}
            onChange={(next) => { setCompany(next); setQuoteId(null); setErrors((p) => ({ ...p, companyId: undefined })); }}
          />
          {quoteOptions.length ? (
            <View className="gap-1.5">
              <Text className="font-inter-medium text-[13px] text-muted-foreground">Teklif (opsiyonel)</Text>
              <FilterChips options={quoteOptions} value={quoteId} onChange={setQuoteId} allLabel="Bağlama" />
            </View>
          ) : null}
          <Field label="Tutar *" value={amount} onChangeText={(v) => { setAmount(v); setErrors((p) => ({ ...p, amount: undefined })); }} keyboardType="decimal-pad" placeholder="0" error={errors.amount} />
          <View className="gap-1.5">
            <Text className="font-inter-medium text-[13px] text-muted-foreground">Para birimi</Text>
            <FilterChips options={CURRENCIES} value={currencyCode} onChange={(v) => v && setCurrencyCode(v)} allLabel="" />
          </View>
          <Field
            label="Vade tarihi *"
            value={dueDate}
            onChangeText={(v) => { setDueDate(v); setErrors((p) => ({ ...p, dueDate: undefined })); }}
            placeholder="YYYY-AA-GG"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            error={errors.dueDate}
          />
          <Field label="Fatura no" value={invoiceNo} onChangeText={setInvoiceNo} maxLength={64} placeholder="FTR-2026-001" />
          <Field label="Notlar" value={notes} onChangeText={setNotes} multiline numberOfLines={3} maxLength={2000} />
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label="Tahsilat Ekle" loading={create.isPending} disabled={create.isPending} onPress={submit} /></View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
