import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Redirect, useRouter } from 'expo-router';
import { useLookup } from '@/src/api/crm.hooks';
import type { ContractInput, DocumentTermsInput, ProformaInput } from '@/src/api/commercial-docs.api';
import { useCreateContract, useCreateProforma, useUpdateContract, useUpdateProforma } from '@/src/api/commercial-docs.hooks';
import { useCommercialDocument } from '@/src/api/documents.hooks';
import type { QuoteListItem } from '@/src/api/endpoints';
import { useQuoteDetail } from '@/src/api/quotes.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatAmount } from '@/src/lib/format';
import { DetailSkeleton, ErrorState, Eyebrow, Field, SubtleCard } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import {
  applyDrafts,
  DocumentDiscountFields,
  DocumentTermsFields,
  DocumentTotalsCard,
  draftsFromRows,
  emptyContractTermsMeta,
  firstPriceError,
  parseDeliveryDays,
  PriceRowsEditor,
  type ContractTermsMeta,
  type PriceDraft,
} from './DocumentFormParts';
import {
  computeDocumentTotals,
  hasDocumentDiscount,
  isStandaloneSnapshot,
  mergeStoredPrices,
  pricesChanged,
  quoteToPriceRows,
  snapshotDiscount,
  snapshotToPriceRows,
  type PriceRow,
} from './document-logic';
import { ModalForm, PickerField, QuotePickerSheet } from './pickers';
import { formatDay, parseDay, parseDecimal } from './quote-logic';
import { DateTextField } from '@/src/ui/select/DateTextField';

type Kind = 'proforma' | 'contract';

const LABEL: Record<Kind, string> = { proforma: 'Proforma', contract: 'Sözleşme' };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const str = (value: unknown) => (typeof value === 'string' ? value : '');
const optionalDays = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : '');

/**
 * Teklife bağlı proforma / sözleşme: oluşturma (web CreateProformaDialog,
 * CreateContractDialog) ve düzenleme (web EditDocumentDialog). Kalem listesi
 * canlı tekliften gelir; belge yalnız fiyat, genel iskonto ve şartları taşır.
 * Şart değişikliği yalnız bu belgeye yazılır, dokunulmadıysa gönderilmez.
 */
export function LinkedDocumentForm({ kind, quoteId: initialQuoteId, documentId }: { kind: Kind; quoteId?: string; documentId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(documentId);
  const canCreate = useCan(kind === 'proforma' ? 'proformas.create' : 'contracts.create');
  const canUpdate = useCan(kind === 'proforma' ? 'proformas.update' : 'contracts.update');
  const existing = useCommercialDocument(kind, documentId ?? '');
  const [quoteId, setQuoteId] = useState(initialQuoteId ?? '');
  const [quoteLabel, setQuoteLabel] = useState<string | null>(null);
  const quote = useQuoteDetail(quoteId);
  const currencies = useLookup('currencies');

  const createProforma = useCreateProforma();
  const createContract = useCreateContract();
  const updateProforma = useUpdateProforma();
  const updateContract = useUpdateContract();
  const busy = createProforma.isPending || createContract.isPending || updateProforma.isPending || updateContract.isPending;

  const [documentNo, setDocumentNo] = useState('');
  const [date, setDate] = useState(formatDay(new Date()));
  const [paymentTermDays, setPaymentTermDays] = useState('');
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [initialRows, setInitialRows] = useState<PriceRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({});
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [payment, setPayment] = useState('');
  const [delivery, setDelivery] = useState('');
  const [warranty, setWarranty] = useState('');
  const [meta, setMeta] = useState<ContractTermsMeta>(emptyContractTermsMeta());
  const [termsDirty, setTermsDirty] = useState(false);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const quoteSheet = useRef<BottomSheetModal>(null);

  const doc = existing.data as (Record<string, unknown> & { quoteId?: string | null }) | undefined;
  const snapshot = record(doc?.documentSnapshot);
  const standalone = isStandaloneSnapshot(snapshot);

  useEffect(() => {
    if (isEdit && doc?.quoteId && !quoteId) setQuoteId(doc.quoteId);
  }, [doc?.quoteId, isEdit, quoteId]);

  useEffect(() => {
    const data = quote.data;
    if (!data || hydratedFor === data.id) return;
    if (isEdit && !doc) return;
    const quoteRows = quoteToPriceRows(data.items as unknown as Record<string, unknown>[]);
    const loaded = isEdit ? mergeStoredPrices(quoteRows, snapshotToPriceRows(snapshot)) : quoteRows;
    setRows(loaded);
    setInitialRows(loaded);
    setDrafts(draftsFromRows(loaded));
    const discount = isEdit ? snapshotDiscount(snapshot) : { amount: 0, percent: 0 };
    setDiscountAmount(discount.amount > 0 ? String(discount.amount) : '');
    setDiscountPercent(discount.percent > 0 ? String(discount.percent) : '');
    const terms = record(isEdit ? (snapshot?.terms ?? doc?.terms) : null) ?? record(data.terms) ?? {};
    setPayment(str(terms.paymentTermsText) || data.paymentTerms || '');
    setDelivery(str(terms.deliveryTermsText) || data.deliveryTerms || '');
    setWarranty(str(terms.warrantyTermsText) || data.warrantyTerms || '');
    setMeta({
      importCostsExcluded: typeof terms.importCostsExcluded === 'boolean' ? terms.importCostsExcluded : true,
      vatIncluded: terms.vatIncluded === true,
      freightPaidBySeller: terms.freightPaidBySeller === true,
      deliveryLocation: str(terms.deliveryLocation),
      estimatedDeliveryDaysMin: optionalDays(terms.estimatedDeliveryDaysMin),
      estimatedDeliveryDaysMax: optionalDays(terms.estimatedDeliveryDaysMax),
    });
    setTermsDirty(false);
    setHydratedFor(data.id);
  }, [doc, hydratedFor, isEdit, quote.data, snapshot]);

  const currencyCode = currencies.data?.find((item) => item.id === quote.data?.currencyId)?.code ?? 'USD';
  const editedRows = useMemo(() => applyDrafts(rows, drafts), [drafts, rows]);
  const documentDiscount = {
    amount: discountAmount.trim() ? parseDecimal(discountAmount) : 0,
    percent: discountPercent.trim() ? parseDecimal(discountPercent) : 0,
  };
  const totals = computeDocumentTotals(
    editedRows.map((row) => ({ ...row, unitPrice: Number.isFinite(row.unitPrice) ? row.unitPrice : 0, discountAmount: Number.isFinite(row.discountAmount) ? row.discountAmount : 0 })),
    {
      quoteDiscountTotal: Number(quote.data?.discountTotal ?? 0) || 0,
      headerDiscountAmount: Number(quote.data?.headerDiscountAmount ?? 0) || 0,
      customsTotal: Number(record(snapshot?.quote)?.customsTotal ?? 0) || 0,
      documentDiscount: Number.isFinite(documentDiscount.amount) && Number.isFinite(documentDiscount.percent) ? documentDiscount : null,
    }
  );

  if (isEdit ? !canUpdate : !canCreate) return <Redirect href="/(tabs)/modules/documents" />;
  if (isEdit && standalone && documentId) {
    return <Redirect href={kind === 'proforma' ? `/modal/proforma-quick?id=${documentId}` : `/modal/contract-quick?id=${documentId}`} />;
  }

  const title = isEdit ? `${LABEL[kind]} Düzenle` : `Yeni ${LABEL[kind]}`;
  const loadError = existing.error ?? quote.error;
  const loading = (isEdit && existing.isPending) || (Boolean(quoteId) && hydratedFor !== quoteId);

  function markTerms(next: { payment?: string; delivery?: string; warranty?: string }) {
    if (next.payment !== undefined) setPayment(next.payment);
    if (next.delivery !== undefined) setDelivery(next.delivery);
    if (next.warranty !== undefined) setWarranty(next.warranty);
    setTermsDirty(true);
  }

  function chooseQuote(next: QuoteListItem) {
    setQuoteId(next.id);
    setQuoteLabel(`${next.documentNo} · R${next.revisionNo} · ${next.company?.shortName ?? next.company?.legalTitle ?? '—'}`);
    setHydratedFor(null);
  }

  function submit() {
    if (!quoteId) {
      toast.error('Bağlı teklif seçiniz');
      return;
    }
    const priceError = firstPriceError(editedRows);
    if (priceError) {
      toast.error(priceError);
      return;
    }
    if (!(documentDiscount.amount >= 0) || !(documentDiscount.percent >= 0 && documentDiscount.percent <= 100)) {
      toast.error('Belge iskontosunu düzeltin (oran 0–100).');
      return;
    }
    const days = parseDeliveryDays(meta);
    if (kind === 'contract' && days.error) {
      toast.error(days.error);
      return;
    }
    const day = parseDay(date);
    if (!isEdit && !day) {
      toast.error('Tarih biçimi: YYYY-AA-GG');
      return;
    }
    let termDays: number | undefined;
    if (kind === 'contract' && paymentTermDays.trim()) {
      termDays = Number(paymentTermDays.trim());
      if (!Number.isInteger(termDays) || termDays < 0 || termDays > 3650) {
        toast.error('Ödeme vadesi 0–3650 gün arası olmalı.');
        return;
      }
    }

    const items = editedRows.map((row) => ({ quoteItemId: row.quoteItemId, unitPrice: row.unitPrice, discountAmount: row.discountAmount }));
    const terms: DocumentTermsInput | undefined = termsDirty
      ? kind === 'contract'
        ? {
            paymentTermsText: payment,
            deliveryTermsText: delivery,
            warrantyTermsText: warranty,
            importCostsExcluded: meta.importCostsExcluded,
            vatIncluded: meta.vatIncluded,
            freightPaidBySeller: meta.freightPaidBySeller,
            deliveryLocation: meta.deliveryLocation.trim() || undefined,
            estimatedDeliveryDaysMin: days.min,
            estimatedDeliveryDaysMax: days.max,
          }
        : { paymentTermsText: payment, deliveryTermsText: delivery, warrantyTermsText: warranty, importCostsExcluded: true }
      : undefined;
    const discountFields = hasDocumentDiscount(documentDiscount)
      ? { headerDiscountAmount: documentDiscount.amount, headerDiscountPercent: documentDiscount.percent }
      : {};
    const done = (message: string) => () => {
      toast.success(message);
      router.back();
    };
    const fail = (error: Error) => toast.error(error.message);

    if (isEdit && documentId) {
      const body = {
        items,
        headerDiscountAmount: documentDiscount.amount,
        headerDiscountPercent: documentDiscount.percent,
        ...(terms ? { terms } : {}),
      };
      if (kind === 'contract') updateContract.mutate({ id: documentId, body }, { onSuccess: done('CRM sözleşmesi güncellendi'), onError: fail });
      else updateProforma.mutate({ id: documentId, body }, { onSuccess: done('CRM proforması güncellendi'), onError: fail });
      return;
    }

    if (kind === 'contract') {
      const body: ContractInput = {
        quoteId,
        contractNo: documentNo.trim() || undefined,
        signedDate: day!.toISOString(),
        paymentTermDays: termDays,
        statusCode: 'draft',
        items: pricesChanged(editedRows, initialRows) ? items : undefined,
        ...discountFields,
        terms,
      };
      createContract.mutate(body, {
        onSuccess: done('CRM sözleşmesi oluşturuldu. PDF web CRM’den yüklenir.'),
        onError: fail,
      });
      return;
    }
    const body: ProformaInput = {
      quoteId,
      documentNo: documentNo.trim() || undefined,
      issueDate: day!.toISOString(),
      statusCode: 'draft',
      items,
      ...discountFields,
      terms,
    };
    createProforma.mutate(body, {
      onSuccess: done('CRM proforması oluşturuldu. PDF web CRM’den yüklenir.'),
      onError: fail,
    });
  }

  const quoteSummary = quote.data
    ? `${quote.data.documentNo} · R${quote.data.revisionNo} · ${formatAmount(quote.data.grandTotal, currencyCode)}`
    : quoteLabel;

  return (
    <>
      <ModalForm
        title={title}
        submitLabel={isEdit ? 'Kaydet' : `CRM'de ${LABEL[kind]} Oluştur`}
        onSubmit={submit}
        loading={busy}
        disabled={loading || Boolean(loadError) || !quoteId}
      >
        {!isEdit ? (
          <Text className="font-inter text-xs leading-5 text-muted-foreground">
            Kayıt web CRM API ile oluşur. PDF mobilde basılmaz; web CRM’de yüklenen dosya belge detayından açılır.
          </Text>
        ) : null}
        <PickerField
          label="Bağlı Teklif *"
          value={quoteSummary}
          placeholder="Teklif no ile arayın…"
          icon="document-text-outline"
          onPress={() => quoteSheet.current?.present()}
          disabled={isEdit || Boolean(initialQuoteId)}
        />

        {loadError ? (
          <ErrorState
            message={loadError.message}
            onRetry={() => {
              void existing.refetch();
              void quote.refetch();
            }}
          />
        ) : loading ? (
          <DetailSkeleton />
        ) : quoteId ? (
          <>
            {!isEdit ? (
              <View className="gap-3">
                <Eyebrow>{LABEL[kind]} bilgileri</Eyebrow>
                <Field
                  label={kind === 'contract' ? 'Sözleşme No' : 'Proforma No'}
                  value={documentNo}
                  onChangeText={setDocumentNo}
                  placeholder={`Otomatik: ${quote.data?.businessLine ?? 'CNC'}-${kind === 'contract' ? 'SOZ' : 'PRF'}-${new Date().getFullYear()}/...`}
                  maxLength={64}
                />
                <DateTextField
                  label={kind === 'contract' ? 'İmza Tarihi' : 'Belge Tarihi'}
                  value={date}
                  onChangeText={setDate}
                />
                {kind === 'contract' ? (
                  <Field
                    label="Ödeme Vadesi (Gün)"
                    value={paymentTermDays}
                    onChangeText={setPaymentTermDays}
                    keyboardType="number-pad"
                    placeholder="Örn. 60"
                    maxLength={4}
                  />
                ) : null}
              </View>
            ) : null}

            <PriceRowsEditor
              title={kind === 'contract' ? 'Sözleşme Fiyatları' : 'Proforma Fiyatları'}
              hint={`${LABEL[kind]}da geçerli birim fiyatları girin. Bağlı teklif değişmez; çıktı bu değerlerle basılır.`}
              rows={rows}
              drafts={drafts}
              onDraftChange={(id, next) => setDrafts((prev) => ({ ...prev, [id]: next }))}
              currencyCode={currencyCode}
            />

            <DocumentDiscountFields
              amount={discountAmount}
              percent={discountPercent}
              onAmount={setDiscountAmount}
              onPercent={setDiscountPercent}
              currencyCode={currencyCode}
            />
            <DocumentTotalsCard totals={totals} currencyCode={currencyCode} />

            <DocumentTermsFields
              title={kind === 'contract' ? 'Sözleşme Şartları' : 'Proforma Şartları'}
              hint={`Değişiklik yalnız bu ${kind === 'contract' ? 'sözleşmeye' : 'proformaya'} işlenir; bağlı teklifin şartları olduğu gibi kalır.`}
              payment={payment}
              delivery={delivery}
              warranty={warranty}
              onChange={markTerms}
              meta={kind === 'contract' ? meta : undefined}
              onMetaChange={
                kind === 'contract'
                  ? (next) => {
                      setMeta((prev) => ({ ...prev, ...next }));
                      setTermsDirty(true);
                    }
                  : undefined
              }
            />
          </>
        ) : (
          <SubtleCard className="p-3">
            <Text className="font-inter text-sm text-muted-foreground">Önce bağlı teklifi seçin.</Text>
          </SubtleCard>
        )}
      </ModalForm>
      <QuotePickerSheet sheetRef={quoteSheet} selectedId={quoteId} onSelect={chooseQuote} />
    </>
  );
}
