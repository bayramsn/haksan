import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useLookup } from '@/src/api/crm.hooks';
import { useCreateCommercialInvoice, useUpdateCommercialInvoice } from '@/src/api/commercial-docs.hooks';
import { useCommercialDocument } from '@/src/api/documents.hooks';
import type { QuoteListItem } from '@/src/api/endpoints';
import { useQuoteDetail } from '@/src/api/quotes.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatAmount } from '@/src/lib/format';
import { DetailSkeleton, ErrorState, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { ChoiceChips, ModalForm, PickerField, QuotePickerSheet } from '@/src/ui/documents/pickers';
import { formatDay, parseDay } from '@/src/ui/documents/quote-logic';
import { DateTextField } from '@/src/ui/select/DateTextField';

/**
 * Ticari fatura kaydı: `?quoteId=` ile tekliften oluşturma, `?id=` ile
 * numara / tarih / durum düzenleme (commercialInvoiceCreate/UpdateSchema).
 */
export default function CommercialInvoiceFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ quoteId?: string; id?: string }>();
  const documentId = typeof params.id === 'string' ? params.id : '';
  const isEdit = Boolean(documentId);
  const canCreate = useCan('commercial_invoices.create');
  const canUpdate = useCan('commercial_invoices.update');
  const existing = useCommercialDocument('invoice', documentId);
  const statuses = useLookup('invoice-statuses');
  const currencies = useLookup('currencies');
  const [quoteId, setQuoteId] = useState(typeof params.quoteId === 'string' ? params.quoteId : '');
  const [quoteLabel, setQuoteLabel] = useState<string | null>(null);
  const quote = useQuoteDetail(quoteId);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(formatDay(new Date()));
  const [statusCode, setStatusCode] = useState('draft');
  const [hydrated, setHydrated] = useState(!isEdit);
  const sheet = useRef<BottomSheetModal>(null);
  const create = useCreateCommercialInvoice();
  const update = useUpdateCommercialInvoice();

  const doc = existing.data as Record<string, unknown> | undefined;
  useEffect(() => {
    if (!isEdit || hydrated || !doc) return;
    setInvoiceNo(typeof doc.invoiceNo === 'string' ? doc.invoiceNo : '');
    if (typeof doc.invoiceDate === 'string' && doc.invoiceDate) setDate(doc.invoiceDate.slice(0, 10));
    const status = doc.status as { code?: string } | null | undefined;
    if (status?.code) setStatusCode(status.code);
    if (typeof doc.quoteId === 'string') setQuoteId(doc.quoteId);
    setHydrated(true);
  }, [doc, hydrated, isEdit]);

  if (isEdit ? !canUpdate : !canCreate) return <Redirect href="/(tabs)/modules/documents" />;

  function submit() {
    if (!quoteId) return toast.error('Bağlı teklif seçiniz');
    const day = parseDay(date);
    if (!day) return toast.error('Tarih biçimi: YYYY-AA-GG');
    const no = invoiceNo.trim();
    const fail = (error: Error) => toast.error(error.message);
    if (isEdit) {
      update.mutate(
        { id: documentId, body: { ...(no ? { invoiceNo: no } : {}), invoiceDate: day.toISOString(), statusCode } },
        {
          onSuccess: () => {
            toast.success('Ticari fatura güncellendi');
            router.back();
          },
          onError: fail,
        }
      );
      return;
    }
    create.mutate(
      { quoteId, invoiceNo: no || undefined, invoiceDate: day.toISOString(), statusCode },
      {
        onSuccess: () => {
          toast.success('Ticari fatura oluşturuldu');
          router.back();
        },
        onError: fail,
      }
    );
  }

  const statusOptions = (statuses.data ?? []).map((status) => ({ value: status.code, label: status.name }));
  const currencyCode = currencies.data?.find((item) => item.id === quote.data?.currencyId)?.code ?? 'USD';
  const quoteSummary = quote.data
    ? `${quote.data.documentNo} · R${quote.data.revisionNo} · ${formatAmount(quote.data.grandTotal, currencyCode)}`
    : quoteLabel;

  return (
    <>
      <ModalForm
        title={isEdit ? 'Ticari Fatura Düzenle' : 'Yeni Ticari Fatura'}
        submitLabel={isEdit ? 'Kaydet' : 'Ticari Fatura Oluştur'}
        onSubmit={submit}
        loading={create.isPending || update.isPending}
        disabled={!hydrated || !quoteId}
      >
        {isEdit && existing.error ? (
          <ErrorState message={existing.error.message} onRetry={() => void existing.refetch()} />
        ) : !hydrated ? (
          <DetailSkeleton />
        ) : (
          <View className="gap-4">
            <PickerField
              label="Bağlı Teklif *"
              value={quoteSummary}
              placeholder="Teklif no ile arayın…"
              icon="document-text-outline"
              onPress={() => sheet.current?.present()}
              disabled={isEdit || typeof params.quoteId === 'string'}
            />
            <Field
              label="Fatura No"
              value={invoiceNo}
              onChangeText={setInvoiceNo}
              placeholder={isEdit ? undefined : 'Otomatik'}
              maxLength={64}
            />
            <DateTextField
              label="Fatura Tarihi"
              value={date}
              onChangeText={setDate}
            />
            {statusOptions.length ? (
              <ChoiceChips label="Durum" options={statusOptions} value={statusCode} onChange={setStatusCode} />
            ) : statuses.error ? (
              <Text className="font-inter text-xs text-muted-foreground">Durum listesi alınamadı; kayıt taslak olarak açılır.</Text>
            ) : null}
            <Text className="font-inter text-xs text-muted-foreground">
              Kalemler ve tutarlar bağlı teklif revizyonundan alınır; fatura PDF’ini Belgeler ekranından yükleyebilirsiniz.
            </Text>
          </View>
        )}
      </ModalForm>
      <QuotePickerSheet
        sheetRef={sheet}
        selectedId={quoteId}
        onSelect={(next: QuoteListItem) => {
          setQuoteId(next.id);
          setQuoteLabel(`${next.documentNo} · R${next.revisionNo}`);
        }}
      />
    </>
  );
}
