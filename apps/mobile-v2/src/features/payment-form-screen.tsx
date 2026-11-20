import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { paymentCreateSchema, type PaymentCreateInput } from '@haksan/shared';
import { useQueryClient } from '@tanstack/react-query';
import { usePayment } from '@/src/api/finance.hooks';
import { finance } from '@/src/api/endpoints';
import { ops } from '@/src/api/ops.endpoints';
import { dayText } from '@/src/api/service.endpoints';
import { parseDecimal } from '@/src/lib/format';
import { useCan } from '@/src/auth/AuthProvider';
import { pickDocument, uploadEntityAttachment, type LocalUpload } from '@/src/native/files';
import { CompanyPickerField, type PickedCompany } from '@/src/features/CompanyPickerField';
import { Button, ErrorState, Eyebrow, Field, FilterChips, Loading } from '@/src/ui';

type FormState = {
  direction: 'in' | 'out';
  companyId: string;
  amount: string;
  currencyCode: string;
  paymentDate: string;
  paymentMethod: 'bank_transfer' | 'cash' | 'credit_card' | 'check' | 'other';
  invoiceNo: string;
  notes: string;
  /** Web'deki "Fiş / Fatura" seçimi: dosya türü her zaman commercial_invoice_pdf, seçim açıklamaya yazılır. */
  docLabel: 'Fiş' | 'Fatura';
};

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Banka Havalesi' },
  { value: 'cash', label: 'Nakit' },
  { value: 'credit_card', label: 'Kredi Kartı' },
  { value: 'check', label: 'Çek' },
  { value: 'other', label: 'Diğer' },
] as const;

const DOCUMENT_TYPES = [
  { value: 'Fiş', label: 'Fiş' },
  { value: 'Fatura', label: 'Fatura' },
] as const;

// Web PAYMENT_CURRENCIES ile aynı sabit liste.
const CURRENCIES = [{ value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }, { value: 'TRY', label: 'TRY' }];

const PAYMENT_FILE_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'docx', 'xlsx']);

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function clean(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function today(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function PaymentFormScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; direction?: string | string[]; companyId?: string | string[]; companyName?: string | string[] }>();
  const router = useRouter();
  // `id` varsa düzenleme (web PaymentsPage gibi): yön, firma ve para birimi kilitli, dosya istenmez.
  const editId = first(params.id);
  const allowed = useCan(editId ? 'payments.update' : 'payments.create');
  const existing = usePayment(editId);
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const requestedDirection = first(params.direction) === 'out' ? 'out' : 'in';
  const requestedCompanyId = first(params.companyId);
  const [companyName, setCompanyName] = useState(first(params.companyName));
  const [form, setForm] = useState<FormState>({
    direction: requestedDirection,
    companyId: requestedCompanyId,
    amount: '',
    currencyCode: 'USD',
    paymentDate: today(),
    paymentMethod: 'bank_transfer',
    invoiceNo: '',
    notes: '',
    docLabel: 'Fatura',
  });
  const [attachment, setAttachment] = useState<LocalUpload | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | 'attachment', string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [hydrated, setHydrated] = useState(!editId);
  useEffect(() => {
    const row = existing.data;
    if (!editId || hydrated || !row) return;
    setForm((previous) => ({
      ...previous,
      direction: row.direction === 'out' ? 'out' : 'in',
      companyId: row.companyId,
      amount: String(Number(row.amount)).replace('.', ','),
      currencyCode: row.currency?.code ?? previous.currencyCode,
      paymentDate: dayText(row.paymentDate),
      paymentMethod: (PAYMENT_METHODS.some((item) => item.value === row.paymentMethod) ? row.paymentMethod : 'other') as FormState['paymentMethod'],
      invoiceNo: row.invoiceNo ?? '',
      notes: row.notes ?? '',
    }));
    setCompanyName(row.company?.shortName ?? row.company?.legalTitle ?? '');
    setHydrated(true);
  }, [editId, existing.data, hydrated]);

  if (!allowed) return <Redirect href="/modules/payments" />;
  if (editId && !hydrated) return existing.error ? <ErrorState message={existing.error.message} onRetry={() => void existing.refetch()} /> : <Loading />;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => previous[key] ? { ...previous, [key]: undefined } : previous);
    setFormError(null);
  };

  const chooseCompany = (company: PickedCompany) => {
    set('companyId', company.id);
    setCompanyName(company.name);
  };

  const selectFile = async () => {
    try {
      const picked = await pickDocument();
      if (!picked) return;
      if (!PAYMENT_FILE_EXTENSIONS.has(picked.extension)) {
        Alert.alert('Desteklenmeyen dosya', 'Fatura veya fiş için PDF, PNG, JPG, WEBP, DOCX ya da XLSX seçin.');
        return;
      }
      setAttachment(picked);
      setErrors((previous) => ({ ...previous, attachment: undefined }));
    } catch (error) {
      Alert.alert('Dosya seçilemedi', error instanceof Error ? error.message : 'Dosya okunamadı.');
    }
  };

  const submit = () => {
    setFormError(null);
    const paymentDate = parseDate(form.paymentDate);
    const amount = parseDecimal(form.amount);
    const nextErrors: typeof errors = {};
    if (!form.companyId) nextErrors.companyId = 'Firma seçin.';
    if (!Number.isFinite(amount) || amount <= 0) nextErrors.amount = 'Tutarı 1500 veya 1.500,00 biçiminde, sıfırdan büyük girin.';
    if (!paymentDate) nextErrors.paymentDate = 'Tarihi YYYY-AA-GG biçiminde girin.';
    if (!attachment && !editId) nextErrors.attachment = 'Fatura veya fiş dosyası seçin.';
    if (attachment && attachment.sizeBytes > 25 * 1024 * 1024) nextErrors.attachment = "Dosya boyutu 25 MB'ı aşamaz.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setFormError('Zorunlu veya biçimi hatalı alanları kontrol edin.');
      return;
    }
    const candidate = {
      direction: form.direction,
      companyId: form.companyId,
      amount,
      currencyCode: form.currencyCode,
      paymentDate: paymentDate!,
      paymentMethod: form.paymentMethod,
      invoiceNo: clean(form.invoiceNo),
      notes: clean(form.notes),
    };
    if (editId) {
      setSaving(true);
      // Web ile aynı: boş fatura no / not gönderilmez (sunucudaki değer korunur).
      ops.updatePayment(editId, candidate)
        .then(async () => {
          await Promise.all([qc.invalidateQueries({ queryKey: ['finance'] }), qc.invalidateQueries({ queryKey: ['companies'] })]);
          router.back();
        })
        .catch((error: unknown) => setFormError(error instanceof Error ? error.message : 'Kayıt güncellenemedi.'))
        .finally(() => setSaving(false));
      return;
    }
    const parsed = paymentCreateSchema.safeParse(candidate);
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setErrors(Object.fromEntries(Object.entries(fields).map(([key, messages]) => [key, messages?.[0]])) as typeof errors);
      setFormError('Zorunlu veya biçimi hatalı alanları kontrol edin.');
      return;
    }
    void createMovement(parsed.data as PaymentCreateInput);
  };

  /** Web CreatePaymentDialog akışı: giren harekette önce alacak, sonra ona bağlı ödeme; ardından fatura/fiş. */
  const createMovement = async (data: PaymentCreateInput) => {
    setSaving(true);
    try {
      let paymentId: string;
      if (data.direction === 'in') {
        const receivable = await ops.createReceivable({
          companyId: form.companyId,
          amount: data.amount,
          currencyCode: data.currencyCode,
          dueDate: data.paymentDate,
          movementType: 'manual',
          notes: data.notes,
          invoiceNo: data.invoiceNo,
        });
        const { companyId: _companyId, ...rest } = data;
        paymentId = (await finance.createPayment({ ...rest, receivableId: receivable.id })).id;
      } else {
        paymentId = (await finance.createPayment(data)).id;
      }
      await Promise.all([qc.invalidateQueries({ queryKey: ['finance'] }), qc.invalidateQueries({ queryKey: ['companies'] })]);
      try {
        await uploadEntityAttachment({
          bucket: 'erp-invoice-documents',
          entityType: 'company',
          entityId: form.companyId,
          documentTypeCode: 'commercial_invoice_pdf',
          description: `Kasa hareketi #${paymentId.toUpperCase()} · ${form.docLabel}`,
          local: attachment!,
        });
      } catch (error) {
        Alert.alert('Hareket kaydedildi ancak fatura yüklenemedi', error instanceof Error ? error.message : 'Dosyayı detay ekranından tekrar ekleyebilirsiniz.');
      }
      router.replace(`/modules/payments/${paymentId}` as Href);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Kasa hareketi eklenemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: editId ? 'Kasa hareketini düzenle' : 'Yeni kasa hareketi', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <View className="gap-3">
            <Eyebrow>Hareket</Eyebrow>
            {editId ? <Text className="font-inter text-sm text-foreground">{form.direction === 'in' ? 'Alınan (Giren)' : 'Ödenen (Çıkan)'}</Text> : <FilterChips options={[{ value: 'in', label: 'Alınan (Giren)' }, { value: 'out', label: 'Ödenen (Çıkan)' }]} value={form.direction} onChange={(value) => value && set('direction', value)} allLabel="" />}
            <CompanyPickerField required disabled={Boolean(editId)} value={form.companyId ? { id: form.companyId, name: companyName } : null} error={errors.companyId} onChange={chooseCompany} />
            <Field label="Tutar *" value={form.amount} onChangeText={(value) => set('amount', value)} keyboardType="decimal-pad" placeholder="0,00" error={errors.amount} />
            <View className="gap-1.5"><Text className="font-inter-medium text-[13px] text-muted-foreground">Para birimi</Text>{editId ? <Text className="font-inter text-sm text-foreground">{form.currencyCode}</Text> : <FilterChips options={CURRENCIES} value={form.currencyCode} onChange={(value) => value && set('currencyCode', value)} allLabel="" />}</View>
            <Field label="Ödeme tarihi *" value={form.paymentDate} onChangeText={(value) => set('paymentDate', value)} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation" maxLength={10} error={errors.paymentDate} />
            <View className="gap-1.5"><Text className="font-inter-medium text-[13px] text-muted-foreground">Ödeme yöntemi *</Text><FilterChips options={[...PAYMENT_METHODS]} value={form.paymentMethod} onChange={(value) => value && set('paymentMethod', value)} allLabel="" /></View>
            <Field label="Fatura / belge no" value={form.invoiceNo} onChangeText={(value) => set('invoiceNo', value)} maxLength={64} error={errors.invoiceNo} />
            <Field label="Notlar" value={form.notes} onChangeText={(value) => set('notes', value)} multiline maxLength={2000} error={errors.notes} className="min-h-20 rounded-control border border-border bg-input-background px-3 py-2 font-inter text-base text-foreground" />
          </View>

          <View className="gap-3">
            <Eyebrow>Fiş / Fatura *</Eyebrow>
            {editId ? <Text className="font-inter text-xs text-muted-foreground">Bu harekete bağlı dosyalar firma kartındaki Belgeler bölümünde.</Text> : (
              <>
                <FilterChips options={[...DOCUMENT_TYPES]} value={form.docLabel} onChange={(value) => value && set('docLabel', value)} allLabel="" />
                <Button label={attachment ? 'Dosyayı Değiştir' : 'Dosya Seç'} variant="ghost" onPress={() => void selectFile()} />
                {attachment ? <Text className="font-inter text-xs text-muted-foreground">{attachment.name} · {(attachment.sizeBytes / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KB</Text> : null}
                {errors.attachment ? <Text className="font-inter text-xs text-destructive">{errors.attachment}</Text> : !attachment ? <Text className="font-inter text-xs text-muted-foreground">Hareket kaydı için fatura veya fiş yüklemeniz gerekir.</Text> : null}
              </>
            )}
          </View>

          <Text className="font-inter text-xs text-muted-foreground">Kasa hareketi çevrimiçi kaydedilir; firma görünürlüğü, bölüm ve para birimi sunucuda yeniden doğrulanır.</Text>
          {formError ? <Text selectable accessibilityLiveRegion="assertive" className="font-inter text-sm text-destructive">{formError}</Text> : null}
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3"><View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View><View className="flex-[2]"><Button label={editId ? 'Değişiklikleri Kaydet' : 'Hareketi Kaydet'} loading={saving} disabled={saving} onPress={submit} /></View></View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
