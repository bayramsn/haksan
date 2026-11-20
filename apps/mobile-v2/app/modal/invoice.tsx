import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { accountingInvoiceCreateSchema, accountingInvoiceUpdateSchema } from '@haksan/shared';
import { useAccountingInvoice } from '@/src/api/finance.hooks';
import { ops } from '@/src/api/ops.endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { parseDecimal } from '@/src/lib/format';
import { dayText } from '@/src/api/service.endpoints';
import { CompanyPickerField } from '@/src/features/CompanyPickerField';
import { Button, ErrorState, Eyebrow, Field, FilterChips, Loading } from '@/src/ui';

type PaymentType = 'cash' | 'leasing' | 'term';
type Installment = { installmentNo: number; dueDate: string; amount: number };
// Web CreateAccountingInvoiceDialog sabitleri.
const PAYMENT_TYPES: { value: PaymentType; label: string }[] = [
  { value: 'cash', label: 'Peşin' },
  { value: 'leasing', label: 'Leasing' },
  { value: 'term', label: 'Vadeli' },
];
const CURRENCIES = [{ value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }, { value: 'TRY', label: 'TRY' }];
const VAT_RATE_OPTIONS = ['20', '18', '10', '8', '1', '0'];
const DAY_MS = 24 * 60 * 60 * 1000;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const money = (value: number) => value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (value: string) => {
  const parsed = parseDecimal(value || '0');
  return Number.isFinite(parsed) ? parsed : 0;
};
const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
function todayIso(): string {
  // Yerel gün (UTC değil): gece 00-03 arası dünün tarihi gelmesin.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Web addDaysToDateInput: YYYY-AA-GG + gün (UTC tarih aritmetiği, web ile aynı sonuç). */
function addDays(dateText: string, days: number): string {
  const base = new Date(dateText);
  return Number.isNaN(base.getTime()) ? '' : new Date(base.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}
/** Web previewInstallments: genel toplam vade sayısına bölünür, son taksit kalanı alır. */
function buildInstallments(total: number, countText: string, firstDue: string, invoiceDate: string, lastDue: string): Installment[] {
  const count = Math.max(1, Math.trunc(Number(countText)) || 1);
  if (!Number.isFinite(total) || total <= 0) return [];
  const base = Math.floor((total / count) * 100) / 100;
  const start = new Date(firstDue || invoiceDate);
  if (Number.isNaN(start.getTime())) return [];
  const end = lastDue ? new Date(lastDue) : null;
  const step = end && count > 1 ? (end.getTime() - start.getTime()) / (count - 1) : 30 * DAY_MS;
  let allocated = 0;
  return Array.from({ length: count }, (_, i) => {
    const amount = i === count - 1 ? Math.round((total - allocated) * 100) / 100 : base;
    allocated += amount;
    return { installmentNo: i + 1, dueDate: new Date(start.getTime() + step * i).toISOString().slice(0, 10), amount };
  });
}

/**
 * Muhasebe faturası — web CreateAccountingInvoiceDialog'un başlık + vade planı kısmı.
 * Aynı alanlar, aynı varsayılanlar ve aynı gövde (peşinde 0 gün, taksit dizisi, ilk/son
 * vade). Satış sözleşmesinden vade önerisi kullanıcı vadeye dokunana kadar uygulanır.
 * ponytail: kalem tablosu (ürün/seri no/indirim, stok düşümü) webde; mobil fatura kalemsiz kaydedilir.
 */
export default function InvoiceFormScreen() {
  const params = useLocalSearchParams<{ id?: string; companyId?: string; companyName?: string; type?: string }>();
  const editId = first(params.id);
  const router = useRouter();
  const qc = useQueryClient();
  const allowed = useCan(editId ? 'accounting_invoices.update' : 'accounting_invoices.create');
  const existing = useAccountingInvoice(editId);

  const [type, setType] = useState<'sales' | 'purchase'>(first(params.type) === 'purchase' ? 'purchase' : 'sales');
  const [category, setCategory] = useState<'commercial' | 'administrative'>('commercial');
  const [companyId, setCompanyId] = useState(first(params.companyId));
  const [companyName, setCompanyName] = useState(first(params.companyName));
  const [invoiceNo, setInvoiceNo] = useState('');
  const [orderNo, setOrderNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [expectedDate, setExpectedDate] = useState('');
  const [amount, setAmount] = useState('');
  const [vatRate, setVatRate] = useState('20');
  const [vatAmount, setVatAmount] = useState('0');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [termDays, setTermDays] = useState('');
  const [previousTermDays, setPreviousTermDays] = useState('');
  const [termChangeReason, setTermChangeReason] = useState('');
  const [incoterm, setIncoterm] = useState('');
  const [shipmentReference, setShipmentReference] = useState('');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [lastDueDate, setLastDueDate] = useState('');
  const [installmentCount, setInstallmentCount] = useState('1');
  const [notes, setNotes] = useState('');
  const [quoteId, setQuoteId] = useState<string | undefined>();
  const [salesOrderId, setSalesOrderId] = useState<string | undefined>();
  const [termTouched, setTermTouched] = useState(false);
  const [contractHint, setContractHint] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(!editId);

  useEffect(() => {
    const row = existing.data;
    if (!editId || hydrated || !row) return;
    const net = Number(row.amount);
    const vat = Number(row.vatAmount);
    setType(row.type === 'purchase' ? 'purchase' : 'sales');
    setCategory(row.invoiceCategory === 'administrative' ? 'administrative' : 'commercial');
    setCompanyId(row.companyId);
    setCompanyName(row.company?.shortName ?? row.company?.legalTitle ?? '');
    setInvoiceNo(row.invoiceNo);
    setOrderNo(row.orderNo ?? '');
    setInvoiceDate(dayText(row.invoiceDate));
    setExpectedDate(dayText(row.expectedDate));
    setAmount(String(net).replace('.', ','));
    // Web deriveVatRate: oran tutardan türetilir, KDV tutarı ayrı alan olarak korunur.
    setVatRate(net > 0 && vat > 0 ? String(roundMoney((vat / net) * 100)) : '20');
    setVatAmount(String(vat).replace('.', ','));
    setCurrencyCode(row.currency?.code ?? 'USD');
    setPaymentType((['cash', 'leasing', 'term'].includes(row.paymentType) ? row.paymentType : 'cash') as PaymentType);
    setTermDays(row.paymentTermDays != null ? String(row.paymentTermDays) : '');
    setPreviousTermDays(row.previousPaymentTermDays != null ? String(row.previousPaymentTermDays) : '');
    setTermChangeReason(row.termChangeReason ?? '');
    setIncoterm(row.incoterm ?? '');
    setShipmentReference(row.shipmentReference ?? '');
    setFirstDueDate(dayText(row.firstDueDate));
    setLastDueDate(dayText(row.lastDueDate));
    setInstallmentCount(String(row.installmentCount ?? row.installments?.length ?? 1));
    setNotes(row.notes ?? '');
    setQuoteId(row.quoteId ?? undefined);
    setSalesOrderId(row.salesOrderId ?? undefined);
    setHydrated(true);
  }, [editId, existing.data, hydrated]);

  // Web: satış faturasında sözleşmeden vade önerisi; kullanıcı vadeye dokunmadıysa uygulanır.
  useEffect(() => {
    if (editId || type !== 'sales' || !companyId) {
      setContractHint(null);
      return;
    }
    let alive = true;
    ops.invoiceTermSuggestion({ companyId, quoteId })
      .then((s) => {
        if (!alive) return;
        if (s.source !== 'contract' || s.paymentTermDays == null) return setContractHint(null);
        setContractHint(`Vade sözleşmeden alındı${s.contractNo ? ` (${s.contractNo})` : ''}: ${s.paymentTermDays} gün`);
        if (!termTouched) {
          setPaymentType('term');
          setTermDays(String(s.paymentTermDays));
          setFirstDueDate(addDays(invoiceDate, Number(s.paymentTermDays)));
        }
      })
      .catch(() => { if (alive) setContractHint(null); });
    return () => { alive = false; };
  }, [editId, type, companyId, invoiceDate, quoteId, termTouched]);

  const totals = useMemo(() => {
    const net = roundMoney(Math.max(num(amount), 0));
    const vat = roundMoney(Math.max(num(vatAmount), 0));
    return { amount: net, vatRate: Math.max(num(vatRate), 0), vatAmount: vat, grandTotal: roundMoney(net + vat) };
  }, [amount, vatAmount, vatRate]);
  const installments = useMemo(
    () => buildInstallments(totals.grandTotal, installmentCount, firstDueDate, invoiceDate, lastDueDate),
    [totals.grandTotal, installmentCount, firstDueDate, invoiceDate, lastDueDate],
  );

  if (!allowed) return <Redirect href="/modules/invoices" />;
  if (editId && !hydrated) return existing.error ? <ErrorState message={existing.error.message} onRetry={() => void existing.refetch()} /> : <Loading />;

  const isAdministrative = category === 'administrative';
  const vatFor = (net: string, rate: string) => String(roundMoney(Math.max(num(net), 0) * (Math.max(num(rate), 0) / 100))).replace('.', ',');

  function changePaymentType(next: PaymentType) {
    setTermTouched(true);
    setPaymentType(next);
    if (next === 'cash') {
      setTermDays('');
      setFirstDueDate('');
    }
  }
  function changeTermDays(value: string) {
    setTermTouched(true);
    setTermDays(value);
    if (value.trim()) {
      setPaymentType('term');
      setFirstDueDate(addDays(invoiceDate, Math.max(0, Math.trunc(num(value)))));
    }
  }

  function save() {
    setError('');
    if (!companyId) return setError('Firma seçin.');
    if (!(totals.amount > 0)) return setError('Geçerli matrah girin.');
    for (const [label, value] of [['Fatura tarihi', invoiceDate], ['Beklenen tarih', expectedDate], ['İlk vade', firstDueDate], ['Son vade', lastDueDate]] as const) {
      if (value.trim() && !isDay(value)) return setError(`${label} biçimi: YYYY-AA-GG`);
    }
    // Web gövdesi: düzenlemede boş metin alanı temizler, oluşturmada gönderilmez.
    const text = (value: string) => (editId ? value.trim() : value.trim() || undefined);
    const days = (value: string) => (value.trim() === '' ? undefined : Math.max(0, Math.trunc(num(value))));
    const sendInstallments = paymentType !== 'term' || Boolean(termDays.trim()) || Boolean(firstDueDate);
    const body = {
      companyId,
      invoiceCategory: category,
      invoiceNo: invoiceNo.trim(),
      invoiceDate: new Date(invoiceDate),
      amount: totals.amount,
      vatRate: totals.vatRate,
      vatAmount: totals.vatAmount,
      grandTotal: totals.grandTotal,
      currencyCode,
      paymentType,
      paymentTermDays: paymentType === 'cash' ? 0 : days(termDays),
      previousPaymentTermDays: days(previousTermDays),
      termChangeReason: text(termChangeReason),
      incoterm: isAdministrative ? (editId ? '' : undefined) : text(incoterm),
      shipmentReference: text(shipmentReference),
      orderNo: text(orderNo),
      expectedDate: expectedDate.trim() ? new Date(expectedDate) : undefined,
      quoteId,
      salesOrderId,
      firstDueDate: firstDueDate ? new Date(firstDueDate) : undefined,
      lastDueDate: lastDueDate ? new Date(lastDueDate) : undefined,
      installmentCount: Math.trunc(Number(installmentCount)) || 1,
      notes: notes || undefined,
      installments: sendInstallments ? installments.map((row) => ({ ...row, dueDate: new Date(row.dueDate) })) : undefined,
    };
    const parsed = editId
      ? accountingInvoiceUpdateSchema.safeParse(body)
      : accountingInvoiceCreateSchema.safeParse({ ...body, type });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Alanları kontrol edin.');
    setSaving(true);
    (editId ? ops.updateInvoice(editId, parsed.data) : ops.createInvoice(parsed.data as Parameters<typeof ops.createInvoice>[0]))
      .then(async (saved) => {
        await Promise.all([qc.invalidateQueries({ queryKey: ['finance'] }), qc.invalidateQueries({ queryKey: ['companies'] })]);
        if (editId) router.back();
        else router.replace(`/modules/invoices/${saved.id}` as Href);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Fatura kaydedilemedi.'))
      .finally(() => setSaving(false));
  }

  const label = (text: string) => <Text className="font-inter-medium text-[13px] text-muted-foreground">{text}</Text>;
  const vatOptions = (VAT_RATE_OPTIONS.includes(vatRate) ? VAT_RATE_OPTIONS : [vatRate, ...VAT_RATE_OPTIONS]).map((rate) => ({ value: rate, label: `%${rate}` }));

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: editId ? 'Faturayı Düzenle' : 'Muhasebe Faturası', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <View className="gap-3">
            <Eyebrow>Fatura</Eyebrow>
            <View className="gap-1.5">
              {label('Fatura sınıfı')}
              {editId ? <Text className="font-inter text-sm text-foreground">{isAdministrative ? 'İdari' : 'Ticari'}</Text> : (
                <FilterChips options={[{ value: 'commercial', label: 'Ticari' }, { value: 'administrative', label: 'İdari' }]} value={category} onChange={(value) => { if (!value) return; setCategory(value); if (value === 'administrative') setIncoterm(''); }} allLabel="" />
              )}
            </View>
            <View className="gap-1.5">
              {label('Fatura yönü')}
              {editId ? <Text className="font-inter text-sm text-foreground">{type === 'sales' ? 'Satış Faturası' : 'Alış Faturası'}</Text> : (
                <FilterChips options={[{ value: 'sales', label: 'Satış Faturası' }, { value: 'purchase', label: 'Alış Faturası' }]} value={type} onChange={(value) => value && setType(value)} allLabel="" />
              )}
            </View>
            <CompanyPickerField required value={companyId ? { id: companyId, name: companyName } : null} onChange={(company) => { setCompanyId(company.id); setCompanyName(company.name); }} />
            <Field label="Fatura no *" value={invoiceNo} onChangeText={setInvoiceNo} maxLength={64} autoCapitalize="characters" />
            <Field label="Sipariş no" value={orderNo} onChangeText={setOrderNo} maxLength={64} placeholder="Opsiyonel" />
            <View className="gap-1.5">{label('Para birimi')}<FilterChips options={CURRENCIES} value={currencyCode} onChange={(value) => value && setCurrencyCode(value)} allLabel="" /></View>
            <Field label="Fatura tarihi" value={invoiceDate} onChangeText={setInvoiceDate} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation" maxLength={10} />
            <Field label="Beklenen tarih" value={expectedDate} onChangeText={setExpectedDate} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation" maxLength={10} />
            {isAdministrative ? null : <Field label="Incoterm" value={incoterm} onChangeText={setIncoterm} maxLength={64} placeholder="EXW / FOB / CIF" autoCapitalize="characters" />}
            <Field label="Referans" value={shipmentReference} onChangeText={setShipmentReference} maxLength={128} placeholder="İrsaliye / talep no" />
          </View>

          <View className="gap-3">
            <Eyebrow>Tutar</Eyebrow>
            <Field label="Matrah" value={amount} onChangeText={(value) => { setAmount(value); setVatAmount(vatFor(value, vatRate)); }} keyboardType="decimal-pad" placeholder="0,00" />
            <View className="gap-1.5">{label('KDV oranı')}<FilterChips options={vatOptions} value={vatRate} onChange={(value) => { if (!value) return; setVatRate(value); setVatAmount(vatFor(amount, value)); }} allLabel="" /></View>
            <Field label="KDV tutarı" value={vatAmount} onChangeText={setVatAmount} keyboardType="decimal-pad" />
            <Text className="font-inter-semibold text-sm text-foreground">Genel toplam: {money(totals.grandTotal)} {currencyCode}</Text>
          </View>

          <View className="gap-3">
            <Eyebrow>Ödeme ve vade planı</Eyebrow>
            <View className="gap-1.5">{label('Ödeme tipi')}<FilterChips options={PAYMENT_TYPES} value={paymentType} onChange={(value) => value && changePaymentType(value)} allLabel="" /></View>
            <Field label="Yeni vade (gün)" value={termDays} onChangeText={changeTermDays} keyboardType="number-pad" maxLength={4} placeholder="0" />
            {contractHint ? <Text className="font-inter text-xs text-primary">{contractHint}</Text> : null}
            <Field label="Önceki vade (gün)" value={previousTermDays} onChangeText={setPreviousTermDays} keyboardType="number-pad" maxLength={4} placeholder="Opsiyonel" />
            <Field label="Vade notu" value={termChangeReason} onChangeText={setTermChangeReason} maxLength={500} placeholder="Opsiyonel" />
            <Field label="İlk vade" value={firstDueDate} onChangeText={(value) => { setTermTouched(true); setFirstDueDate(value); }} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation" maxLength={10} />
            <Field label="Son vade" value={lastDueDate} onChangeText={setLastDueDate} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation" maxLength={10} />
            <Field label="Vade sayısı" value={installmentCount} onChangeText={setInstallmentCount} keyboardType="number-pad" maxLength={3} />
            {installments.map((row) => (
              <View key={row.installmentNo} className="flex-row justify-between border-b border-border py-1.5">
                <Text className="font-inter text-sm text-muted-foreground">{row.installmentNo}. vade · {row.dueDate}</Text>
                <Text className="font-inter-medium text-sm text-foreground">{money(row.amount)} {currencyCode}</Text>
              </View>
            ))}
            <Field label="Notlar" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
            {editId ? null : <Text className="font-inter text-xs text-muted-foreground">Ürün/seri numaralı kalemler (stok düşümü ve kurulum açılışı) webdeki fatura ekranından eklenir.</Text>}
          </View>
          {error ? <Text accessibilityRole="alert" className="font-inter text-sm text-destructive">{error}</Text> : null}
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label={editId ? 'Güncelle' : 'Faturayı Kaydet'} loading={saving} disabled={saving} onPress={save} /></View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
