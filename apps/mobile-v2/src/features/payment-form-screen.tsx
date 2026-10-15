import { useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { paymentCreateSchema, type FileDocumentTypeCode, type PaymentCreateInput } from '@haksan/shared';
import { useCompanyList } from '@/src/api/companies.hooks';
import { useLookup } from '@/src/api/crm.hooks';
import { useCreatePayment } from '@/src/api/finance.hooks';
import type { CompanyListItem } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { pickDocument, uploadEntityAttachment, type LocalUpload } from '@/src/native/files';
import { useTheme } from '@/src/theme/theme';
import { Button, EmptyState, ErrorState, Eyebrow, Field, FilterChips, Loading, SearchBar } from '@/src/ui';

type FormState = {
  direction: 'in' | 'out';
  companyId: string;
  amount: string;
  currencyCode: string;
  paymentDate: string;
  paymentMethod: 'bank_transfer' | 'cash' | 'credit_card' | 'check' | 'other';
  invoiceNo: string;
  notes: string;
  documentTypeCode: Extract<FileDocumentTypeCode, 'commercial_invoice_pdf' | 'accounting_invoice_pdf'>;
};

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Havale/EFT' },
  { value: 'cash', label: 'Nakit' },
  { value: 'credit_card', label: 'Kredi Kartı' },
  { value: 'check', label: 'Çek' },
  { value: 'other', label: 'Diğer' },
] as const;

const DOCUMENT_TYPES = [
  { value: 'commercial_invoice_pdf', label: 'Fatura' },
  { value: 'accounting_invoice_pdf', label: 'Fiş' },
] as const;

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
  const params = useLocalSearchParams<{ direction?: string | string[]; companyId?: string | string[]; companyName?: string | string[] }>();
  const router = useRouter();
  const { colors } = useTheme();
  const allowed = useCan('payments.create');
  const canUploadFiles = useCan('files.create');
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
    documentTypeCode: 'commercial_invoice_pdf',
  });
  const [attachment, setAttachment] = useState<LocalUpload | null>(null);
  const [companySearch, setCompanySearch] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | 'attachment', string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const companySheet = useRef<BottomSheetModal>(null);
  const currencies = useLookup('currencies');
  const create = useCreatePayment();
  const companyList = useCompanyList(useMemo(() => ({
    search: clean(companySearch),
    sortBy: 'name' as const,
    sortDir: 'asc' as const,
  }), [companySearch]));

  if (!allowed) return <Redirect href="/(tabs)/modules/payments" />;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => previous[key] ? { ...previous, [key]: undefined } : previous);
    setFormError(null);
  };

  const chooseCompany = (company: CompanyListItem) => {
    set('companyId', company.id);
    setCompanyName(company.shortName ?? company.legalTitle);
    companySheet.current?.dismiss();
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
    const amount = Number(form.amount.replace(',', '.'));
    const nextErrors: typeof errors = {};
    if (!form.companyId) nextErrors.companyId = 'Firma seçin.';
    if (!Number.isFinite(amount) || amount <= 0) nextErrors.amount = 'Sıfırdan büyük geçerli bir tutar girin.';
    if (!paymentDate) nextErrors.paymentDate = 'Tarihi YYYY-AA-GG biçiminde girin.';
    if (canUploadFiles && !attachment) nextErrors.attachment = 'Fatura veya fiş dosyası seçin.';
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
    const parsed = paymentCreateSchema.safeParse(candidate);
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setErrors(Object.fromEntries(Object.entries(fields).map(([key, messages]) => [key, messages?.[0]])) as typeof errors);
      setFormError('Zorunlu veya biçimi hatalı alanları kontrol edin.');
      return;
    }
    create.mutate(parsed.data as PaymentCreateInput, {
      onSuccess: async (created) => {
        if (attachment && canUploadFiles) {
          try {
            await uploadEntityAttachment({
              bucket: 'erp-invoice-documents',
              entityType: 'company',
              entityId: form.companyId,
              documentTypeCode: form.documentTypeCode,
              description: `Kasa hareketi #${created.id.toUpperCase()} · ${form.documentTypeCode === 'commercial_invoice_pdf' ? 'Fatura' : 'Fiş'}`,
              local: attachment,
            });
          } catch (error) {
            Alert.alert(
              'Hareket kaydedildi, dosya yüklenemedi',
              error instanceof Error ? error.message : 'Dosyayı daha sonra firma kartından yükleyin.',
            );
          }
        }
        router.replace(`/(tabs)/modules/payments/${created.id}` as Href);
      },
      onError: (error) => setFormError(error.message),
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni kasa hareketi', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <View className="gap-3">
            <Eyebrow>Hareket</Eyebrow>
            <FilterChips options={[{ value: 'in', label: 'Tahsilat / Giren' }, { value: 'out', label: 'Ödeme / Çıkan' }]} value={form.direction} onChange={(value) => value && set('direction', value)} allLabel="" />
            <Pressable accessibilityRole="button" accessibilityLabel="Firma seç" onPress={() => companySheet.current?.present()} className={`min-h-12 flex-row items-center gap-3 rounded-control border bg-card px-3 py-2 ${errors.companyId ? 'border-destructive' : 'border-border'} active:opacity-70`}>
              <Ionicons name="business-outline" size={19} color={colors.primary} />
              <View className="flex-1 gap-0.5"><Text className="font-inter-medium text-xs text-muted-foreground">Firma *</Text><Text className="font-inter text-base text-foreground" numberOfLines={1}>{companyName || 'Firma seçin'}</Text></View>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </Pressable>
            {errors.companyId ? <Text className="font-inter text-xs text-destructive">{errors.companyId}</Text> : null}
            <Field label="Tutar *" value={form.amount} onChangeText={(value) => set('amount', value)} keyboardType="decimal-pad" placeholder="0,00" error={errors.amount} />
            <View className="gap-1.5"><Text className="font-inter-medium text-[13px] text-muted-foreground">Para birimi *</Text>{currencies.isPending ? <Loading /> : currencies.error ? <ErrorState message={currencies.error.message} onRetry={() => void currencies.refetch()} /> : <FilterChips options={(currencies.data ?? []).map((item) => ({ value: item.code, label: item.code }))} value={form.currencyCode} onChange={(value) => value && set('currencyCode', value)} allLabel="" />}</View>
            <Field label="Ödeme tarihi *" value={form.paymentDate} onChangeText={(value) => set('paymentDate', value)} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation" maxLength={10} error={errors.paymentDate} />
            <View className="gap-1.5"><Text className="font-inter-medium text-[13px] text-muted-foreground">Ödeme yöntemi *</Text><FilterChips options={[...PAYMENT_METHODS]} value={form.paymentMethod} onChange={(value) => value && set('paymentMethod', value)} allLabel="" /></View>
            <Field label="Fatura / belge no" value={form.invoiceNo} onChangeText={(value) => set('invoiceNo', value)} maxLength={64} error={errors.invoiceNo} />
            <Field label="Notlar" value={form.notes} onChangeText={(value) => set('notes', value)} multiline maxLength={2000} error={errors.notes} className="min-h-20 rounded-control border border-border bg-input-background px-3 py-2 font-inter text-base text-foreground" />
          </View>

          <View className="gap-3">
            <Eyebrow>Fatura / Fiş</Eyebrow>
            {canUploadFiles ? (
              <>
                <FilterChips options={[...DOCUMENT_TYPES]} value={form.documentTypeCode} onChange={(value) => value && set('documentTypeCode', value)} allLabel="" />
                <Button label={attachment ? 'Dosyayı Değiştir' : 'Dosya Seç'} variant="ghost" onPress={() => void selectFile()} />
                {attachment ? <Text className="font-inter text-xs text-muted-foreground">{attachment.name} · {(attachment.sizeBytes / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KB</Text> : null}
                {errors.attachment ? <Text className="font-inter text-xs text-destructive">{errors.attachment}</Text> : null}
              </>
            ) : <Text className="font-inter text-xs text-warning">Dosya yükleme yetkiniz olmadığı için hareket dosyasız kaydedilecek.</Text>}
          </View>

          <Text className="font-inter text-xs text-muted-foreground">Kasa hareketi çevrimiçi kaydedilir; firma görünürlüğü, bölüm ve para birimi sunucuda yeniden doğrulanır.</Text>
          {formError ? <Text selectable accessibilityLiveRegion="assertive" className="font-inter text-sm text-destructive">{formError}</Text> : null}
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3"><View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View><View className="flex-[2]"><Button label={form.direction === 'in' ? 'Tahsilatı Kaydet' : 'Ödemeyi Kaydet'} loading={create.isPending} onPress={submit} /></View></View>
      </KeyboardAvoidingView>

      <BottomSheetModal ref={companySheet} snapPoints={['80%']} enableDynamicSizing={false} backgroundStyle={{ backgroundColor: colors.card }} handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }} backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}>
        <BottomSheetView className="gap-3 px-4 pb-2"><Text className="font-inter-semibold text-base text-foreground">Firma seçin</Text><SearchBar value={companySearch} onChange={setCompanySearch} placeholder="Firma ara" /></BottomSheetView>
        <BottomSheetFlatList
          data={companyList.data?.items ?? []}
          keyExtractor={(item: CompanyListItem) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }: { item: CompanyListItem }) => <Pressable accessibilityRole="button" accessibilityState={{ selected: item.id === form.companyId }} onPress={() => chooseCompany(item)} className="min-h-[56px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"><Ionicons name="business-outline" size={19} color={item.id === form.companyId ? colors.primary : colors.mutedForeground} /><View className="flex-1"><Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>{item.shortName ?? item.legalTitle}</Text>{item.shortName ? <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>{item.legalTitle}</Text> : null}</View>{item.id === form.companyId ? <Ionicons name="checkmark" size={19} color={colors.primary} /> : null}</Pressable>}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (companyList.hasNextPage && !companyList.isFetchingNextPage) void companyList.fetchNextPage(); }}
          ListEmptyComponent={companyList.isPending ? <Loading /> : companyList.error ? <ErrorState message={companyList.error.message} onRetry={() => void companyList.refetch()} /> : <EmptyState title="Firma bulunamadı" />}
          ListFooterComponent={companyList.isFetchingNextPage ? <Loading /> : null}
        />
      </BottomSheetModal>
    </SafeAreaView>
  );
}
