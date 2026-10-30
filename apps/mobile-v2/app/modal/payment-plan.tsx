import { useAllQuoteList } from '@/src/api/quotes.hooks';
import { PickerField, QuotePickerSheet } from '@/src/ui/documents/pickers';
import type { SheetHandle } from '@/src/ui/pickers/HostedSheet';
/**
 * Ödeme planı — web CreatePaymentPlanDialog’un mobil karşılığı.
 * Vadeli yöntemlerde taksit alacakları oluşturur; peşin/leasingde yalnız yöntemi kaydeder.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  OPPORTUNITY_PAYMENT_METHODS,
  requiresPaymentPlan,
  type OpportunityPaymentMethodCode,
} from '@haksan/shared';
import { useCreateReceivable } from '@/src/api/finance.hooks';
import { useLookup, useOpportunity, useQuote, useUpdateOpportunity } from '@/src/api/crm.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatAmount } from '@/src/lib/format';
import { Button, Card, Eyebrow, Field, Loading } from '@/src/ui';
import { Segmented } from '@/src/ui/finance/kit';
import { DateTextField } from '@/src/ui/select/DateTextField';
import { buildPlanReceivable, recalculatePlanRows, type PlanInstallment } from '@/src/features/receivable-form';
import { toast } from '@/src/ui/toast';

const CURRENCIES = ['USD', 'EUR', 'TRY'] as const;
type Currency = (typeof CURRENCIES)[number];

const METHOD_LABELS: Record<OpportunityPaymentMethodCode, string> = {
  undecided: 'Belirlenmedi',
  cash: 'Peşin',
  wire_transfer: 'Havale',
  promissory_note: 'Senet',
  term: 'Vadeli',
  installment: 'Taksit',
  leasing: 'Leasing',
  letter_of_credit: 'Akreditif',
  cheque: 'Çek',
};

const METHOD_OPTIONS = (OPPORTUNITY_PAYMENT_METHODS as readonly OpportunityPaymentMethodCode[])
  .filter((code) => code !== 'undecided')
  .map((value) => ({ value, label: METHOD_LABELS[value] }));

type Installment = PlanInstallment;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function dayPlus(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildInstallments(total: number, count: number, termDays: number): Installment[] {
  if (total <= 0 || count <= 0) return [];
  const unit = Number((total / count).toFixed(2));
  const today = new Date();
  const firstTerm = Math.max(0, Math.trunc(termDays || 0));
  return recalculatePlanRows([], Array.from({ length: count }, (_, index) => ({
    amount: String(index === 0 ? Number((total - unit * (count - 1)).toFixed(2)) : unit),
    dueDate: dayPlus(today, firstTerm + 30 * index),
  })));
}

export default function PaymentPlanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    opportunityId?: string;
    companyId?: string;
    companyName?: string;
    quoteId?: string;
  }>();
  const opportunityId = first(params.opportunityId);
  const canCreate = useCan('receivables.create');
  const canUpdateOpp = useCan('opportunities.update');
  const detail = useOpportunity(opportunityId);
  const quotes = useAllQuoteList(
    { opportunityId: opportunityId || undefined },
    Boolean(opportunityId),
  );
  const createReceivable = useCreateReceivable();
  const updateOpp = useUpdateOpportunity();

  const companyId = first(params.companyId) || detail.data?.company?.id || '';
  const companyName =
    first(params.companyName) ||
    detail.data?.company?.shortName ||
    detail.data?.company?.legalTitle ||
    detail.data?.leadCompanyTitle ||
    '';

  const [paymentMethod, setPaymentMethod] = useState<OpportunityPaymentMethodCode>('term');
  const [amount, setAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState<Currency>('USD');
  const [quoteId, setQuoteId] = useState(first(params.quoteId));
  const selectedQuote = useQuote(quoteId);
  const currencies = useLookup('currencies');
  const selectedCurrency = currencies.data?.find((item) => item.id === selectedQuote.data?.currencyId)?.code;
  const quoteSheet = useRef<SheetHandle>(null);
  const [installmentCount, setInstallmentCount] = useState('3');
  const [termDays, setTermDays] = useState('30');
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [paymentTerms, setPaymentTerms] = useState('');
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const quoteItems = quotes.data?.items ?? [];
  const planNeeded = requiresPaymentPlan(paymentMethod);
  const count = Math.min(24, Math.max(1, Number(installmentCount) || 1));

  useEffect(() => {
    if (hydrated || (!detail.data && !quoteItems.length && !first(params.quoteId))) return;
    if (first(params.quoteId) && selectedQuote.isPending) return;
    if (opportunityId && (quotes.isPending || quotes.isError)) return;
    if (first(params.quoteId) && selectedQuote.data?.currencyId && currencies.isPending) return;
    const approved = quoteItems.find((q) => q.status?.code === 'approved');
    const latest = quoteItems[0];
    const initial = quoteItems.find((q) => q.id === first(params.quoteId)) ?? (first(params.quoteId) ? selectedQuote.data : null) ?? approved ?? latest;
    const total = initial ? Number(initial.grandTotal) : Number(detail.data?.estimatedValue ?? 0);
    const currency = ((initial && 'currency' in initial ? initial.currency?.code : selectedCurrency) ?? detail.data?.currency?.code ?? 'USD') as string;
    setQuoteId(initial?.id ?? first(params.quoteId));
    setAmount(total > 0 ? String(total) : '');
    setCurrencyCode((CURRENCIES as readonly string[]).includes(currency) ? (currency as Currency) : 'USD');
    setPaymentTerms(detail.data?.paymentTerms ?? '');
    setTermDays(detail.data?.paymentTermDays != null ? String(detail.data.paymentTermDays) : '30');
    const method = detail.data?.paymentMethod;
    if (method && (OPPORTUNITY_PAYMENT_METHODS as readonly string[]).includes(method) && method !== 'undecided') {
      setPaymentMethod(method as OpportunityPaymentMethodCode);
    }
    setHydrated(true);
  }, [detail.data, quoteItems, params.quoteId, hydrated, selectedQuote.data, selectedQuote.isPending, selectedCurrency, opportunityId, quotes.isPending, quotes.isError, currencies.isPending]);

  useEffect(() => {
    if (!planNeeded) {
      setInstallments([]);
      return;
    }
    const total = Number(amount.replace(',', '.'));
    if (!Number.isFinite(total) || total <= 0) {
      setInstallments([]);
      return;
    }
    setInstallments((previous) => recalculatePlanRows(previous, buildInstallments(total, count, Number(termDays) || 0)));
  }, [amount, count, termDays, planNeeded]);

  const sum = useMemo(
    () => installments.reduce((acc, row) => acc + (Number(row.amount.replace(',', '.')) || 0), 0),
    [installments],
  );
  const totalAmount = Number(amount.replace(',', '.')) || 0;
  const matched = Math.abs(totalAmount - sum) < 0.01;

  if (!canCreate) return <Redirect href={'/modules/receivables' as Href} />;
  if (!opportunityId && !companyId) {
    return <Redirect href={'/modules/opportunities' as Href} />;
  }

  async function submit() {
    if (saving || (opportunityId && (quotes.isPending || quotes.isError))) return;
    if (!companyId) {
      toast.error('Firma seçili değil');
      return;
    }
    if (planNeeded) {
      if (!matched || totalAmount <= 0 || installments.length === 0) {
        toast.error('Taksitlerin toplamı plan tutarı ile eşleşmelidir');
        return;
      }
      if (installments.some((row) => !row.dueDate.trim())) {
        toast.error('Her taksit için vade tarihi girin');
        return;
      }
    }
    const productHint = detail.data?.requestedMachine || detail.data?.title || 'Fırsat';
    const prepared = planNeeded ? installments.map((row, index) => buildPlanReceivable({
      row, method: paymentMethod, companyId, currencyCode, quoteId: quoteId || undefined,
      baseNote: installments.length > 1 ? `${METHOD_LABELS[paymentMethod]} ${index + 1}/${installments.length} - ${productHint}` : `${METHOD_LABELS[paymentMethod]} - ${productHint}`,
    })) : [];
    const invalidIndex = prepared.findIndex((row) => !row.ok);
    if (invalidIndex >= 0) {
      const invalid = prepared[invalidIndex]!;
      if (!invalid.ok) toast.error(`${invalidIndex + 1}. taksit: ${Object.values(invalid.errors).join(' ')}`);
      return;
    }
    setSaving(true);
    try {
      if (opportunityId && canUpdateOpp) {
        await updateOpp.mutateAsync({
          id: opportunityId,
          paymentTerms: paymentTerms.trim() || undefined,
          paymentTermDays: Number(termDays) || null,
          paymentMethod,
        });
      }
      if (planNeeded) {
        for (const row of prepared) {
          if (!row.ok) continue;
          await createReceivable.mutateAsync({ ...row.body, dueDate: row.body.dueDate.toISOString() });
        }
      }
      toast.success(
        planNeeded
          ? 'Ödeme planı oluşturuldu'
          : 'Ödeme yöntemi kaydedildi; bu yöntemde plan gerekmiyor.',
      );
      router.back();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ödeme planı oluşturulamadı');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Ödeme Planı', headerShown: true }} />
      {opportunityId && detail.isPending ? (
        <Loading />
      ) : (
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerClassName="gap-3 p-4 pb-10" keyboardShouldPersistTaps="handled">
            <Text className="font-inter text-[13px] leading-[18px] text-muted-foreground">
              {companyName || 'Firma'} için vadeli alacak ödeme planı oluşturun.
            </Text>

            <Card className="gap-3">
              <Eyebrow>Ödeme yöntemi</Eyebrow>
              <Segmented
                value={paymentMethod}
                options={METHOD_OPTIONS}
                onChange={(value) => setPaymentMethod(value)}
              />
              {!planNeeded ? (
                <Text className="font-inter text-[12px] text-muted-foreground">
                  Peşin ve leasingde CRM’de taksit satırı tutulmaz; yalnız yöntem kaydedilir.
                </Text>
              ) : null}
            </Card>

            <PickerField label="Teklif (opsiyonel)" icon="document-text-outline"
              value={selectedQuote.data ? `${selectedQuote.data.documentNo} · ${formatAmount(selectedQuote.data.grandTotal, selectedCurrency ?? currencyCode)}` : quoteItems.find((item) => item.id === quoteId)?.documentNo ?? (quoteId ? 'Seçili teklif' : null)}
              placeholder="Kayıtlı tekliflerden seçin" onPress={() => quoteSheet.current?.present()}
              onClear={() => setQuoteId('')} />

            {planNeeded ? (
              <Card className="gap-3">
                <Eyebrow>Plan</Eyebrow>
                <Field
                  label="Toplam tutar *"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                />
                <View className="gap-1.5">
                  <Text className="font-inter-medium text-xs text-muted-foreground">Para birimi</Text>
                  <View className="flex-row gap-2">
                    {CURRENCIES.map((code) => {
                      const active = currencyCode === code;
                      return (
                        <Pressable
                          key={code}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: active }}
                          onPress={() => setCurrencyCode(code)}
                          className={`min-h-11 flex-1 items-center justify-center rounded-control border ${active ? 'border-primary bg-secondary' : 'border-border bg-card'}`}
                        >
                          <Text className={`font-inter-semibold text-xs ${active ? 'text-primary' : 'text-foreground'}`}>{code}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Field
                      label="Taksit sayısı"
                      value={installmentCount}
                      onChangeText={(v) => setInstallmentCount(v.replace(/\D/g, ''))}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  </View>
                  <View className="flex-1">
                    <Field
                      label="İlk vade (gün)"
                      value={termDays}
                      onChangeText={(v) => setTermDays(v.replace(/\D/g, ''))}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  </View>
                </View>
                <Button
                  label="Eşit dağıt"
                  variant="ghost"
                  onPress={() => setInstallments((previous) => recalculatePlanRows(previous, buildInstallments(totalAmount, count, Number(termDays) || 0)))}
                />
                {!matched && installments.length > 0 ? (
                  <Text className="font-inter text-[12px] text-destructive">
                    Fark: {formatAmount(totalAmount - sum, currencyCode)}
                  </Text>
                ) : null}
                {installments.map((row, index) => (
                  <View key={`inst-${index}`} className="gap-2 rounded-control border border-border bg-muted/30 p-3">
                    <Text className="font-inter-medium text-xs text-muted-foreground">
                      {index + 1}. taksit
                    </Text>
                    <Field
                      label="Tutar"
                      value={row.amount}
                      onChangeText={(value) =>
                        setInstallments((current) =>
                          current.map((item, i) => (i === index ? { ...item, amount: value } : item)),
                        )
                      }
                      keyboardType="decimal-pad"
                    />
                    <DateTextField
                      label="Vade"
                      value={row.dueDate}
                      onChangeText={(dueDate) =>
                        setInstallments((current) =>
                          current.map((item, i) => (i === index ? { ...item, dueDate } : item)),
                        )
                      }
                    />
                    {paymentMethod === 'cheque' || paymentMethod === 'promissory_note' ? <View className="gap-2 border-t border-border pt-3">
                      <Field label={paymentMethod === 'cheque' ? 'Çek numarası *' : 'Senet numarası *'} value={row.documentNo} maxLength={128}
                        onChangeText={(documentNo) => setInstallments((current) => current.map((item, i) => i === index ? { ...item, documentNo } : item))} />
                      <Field label={paymentMethod === 'cheque' ? 'Hesap sahibi *' : 'Borçlu / düzenleyen *'} value={row.issuer} maxLength={128}
                        onChangeText={(issuer) => setInstallments((current) => current.map((item, i) => i === index ? { ...item, issuer } : item))} />
                      {paymentMethod === 'cheque' ? <>
                        <Field label="Banka *" value={row.bankName} maxLength={128}
                          onChangeText={(bankName) => setInstallments((current) => current.map((item, i) => i === index ? { ...item, bankName } : item))} />
                        <Field label="Şube" value={row.branchName} maxLength={128}
                          onChangeText={(branchName) => setInstallments((current) => current.map((item, i) => i === index ? { ...item, branchName } : item))} />
                      </> : null}
                    </View> : null}
                  </View>
                ))}
              </Card>
            ) : null}

            <Card className="gap-3">
              <Eyebrow>Ödeme şartları</Eyebrow>
              <Field
                label="Ödeme şartları"
                value={paymentTerms}
                onChangeText={setPaymentTerms}
                multiline
                numberOfLines={3}
                placeholder="Kart ve belgelerde görünen ödeme koşulları"
                className="min-h-[72px] rounded-control border border-transparent bg-input-background px-3.5 py-2.5 font-inter text-base text-foreground"
              />
            </Card>
          </ScrollView>
          <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
            <View className="flex-1">
              <Button label="Vazgeç" variant="ghost" onPress={() => router.back()} disabled={saving} />
            </View>
            <View className="flex-[2]">
              <Button
                label={saving ? 'Kaydediliyor…' : planNeeded ? 'Planı Oluştur' : 'Yöntemi Kaydet'}
                loading={saving}
                disabled={Boolean(opportunityId) && (quotes.isPending || quotes.isError)}
                onPress={() => void submit()}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
      {quotes.error ? <View className="px-4"><Text accessibilityRole="alert" className="text-destructive">Teklifler tam yüklenemedi. Ödeme planı hazırlamadan önce yeniden deneyin.</Text><Button label="Teklifleri yeniden yükle" variant="ghost" onPress={() => void quotes.refetch()} /></View> : null}
      <QuotePickerSheet sheetRef={quoteSheet} selectedId={quoteId} companyId={companyId || undefined} opportunityId={opportunityId || undefined}
        onSelect={(quote) => {
          setQuoteId(quote.id);
          setAmount(String(Number(quote.grandTotal) || 0));
          const code = quote.currency?.code;
          if (code && (CURRENCIES as readonly string[]).includes(code)) setCurrencyCode(code as Currency);
        }} />
    </SafeAreaView>
  );
}
