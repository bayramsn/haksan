import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCompany } from '@/src/api/companies.hooks';
import { useContactList, useLookup, useOpportunityList } from '@/src/api/crm.hooks';
import type { CompanyListItem } from '@/src/api/endpoints';
import { useCreateQuoteFull, useQuoteDetail, useUpdateQuoteFull } from '@/src/api/quotes.hooks';
import type { QuoteCreateInput, QuoteTermsInput } from '@/src/api/quotes.api';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { formatAmount } from '@/src/lib/format';
import { DetailSkeleton, ErrorState, Eyebrow, Field, SubtleCard } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { ChoiceChips, CompanyPickerSheet, ModalForm, PickerField, ToggleRow, TotalLine } from '@/src/ui/documents/pickers';
import { emptyQuoteItem, QuoteItemsEditor } from '@/src/ui/documents/QuoteItemsEditor';
import {
  formatDay,
  itemsNetTotal,
  parseDay,
  parseDecimal,
  parseQuoteItems,
  type EditableQuoteItem,
} from '@/src/ui/documents/quote-logic';
import { DateTextField } from '@/src/ui/select/DateTextField';

const CURRENCIES = ['TRY', 'USD', 'EUR'] as const;
type Currency = (typeof CURRENCIES)[number];

function clean(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

type RawQuoteItem = { productModelId?: string | null };
type RawQuote = { headerDiscountPercent?: string | null };

/**
 * Web QuoteDialog: yeni teklif (fırsat seçilmezse satış kartı da açılır) ve
 * mevcut teklifin düzenlenmesi (başlık + şartlar + kalem farkı).
 */
export default function QuoteFormScreen() {
  const params = useLocalSearchParams<{ id?: string; companyId?: string; opportunityId?: string }>();
  const editId = typeof params.id === 'string' ? params.id : '';
  const isEdit = Boolean(editId);
  const router = useRouter();
  const { user, scope } = useAuth();
  const canCreate = useCan('quotes.create');
  const canUpdate = useCan('quotes.update');
  const existing = useQuoteDetail(editId);
  const currencies = useLookup('currencies');
  const create = useCreateQuoteFull();
  const update = useUpdateQuoteFull();

  const divisions = user?.divisions ?? [];
  const defaultDivision =
    scope.divisionId ?? divisions.find((division) => division.isPrimary)?.id ?? divisions[0]?.id ?? null;

  const [companyId, setCompanyId] = useState(typeof params.companyId === 'string' ? params.companyId : '');
  const [companyName, setCompanyName] = useState('');
  const [contactId, setContactId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(
    typeof params.opportunityId === 'string' ? params.opportunityId : null
  );
  const [divisionId, setDivisionId] = useState<string | null>(defaultDivision);
  const [documentNo, setDocumentNo] = useState('');
  const [quoteDate, setQuoteDate] = useState(formatDay(new Date()));
  const [validityDays, setValidityDays] = useState('30');
  const [currencyCode, setCurrencyCode] = useState<Currency>('USD');
  const [headerDiscountAmount, setHeaderDiscountAmount] = useState('');
  const [headerDiscountPercent, setHeaderDiscountPercent] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryTerms, setDeliveryTerms] = useState('');
  const [warrantyTerms, setWarrantyTerms] = useState('');
  const [importCostsExcluded, setImportCostsExcluded] = useState(true);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<EditableQuoteItem[]>([emptyQuoteItem()]);
  const [productCurrencies, setProductCurrencies] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [hydrated, setHydrated] = useState(!isEdit);
  const companySheet = useRef<BottomSheetModal>(null);

  const company = useCompany(companyId);
  useEffect(() => {
    if (company.data && !companyName) setCompanyName(company.data.shortName ?? company.data.legalTitle);
  }, [company.data, companyName]);

  const contacts = useContactList(useMemo(() => ({ companyId, sortBy: 'name' as const, sortDir: 'asc' as const }), [companyId]), Boolean(companyId));
  const opportunities = useOpportunityList(useMemo(() => ({ companyId, view: 'active' as const }), [companyId]), Boolean(companyId));

  useEffect(() => {
    const quote = existing.data;
    if (!isEdit || hydrated || !quote || !currencies.data) return;
    const code = currencies.data.find((item) => item.id === quote.currencyId)?.code;
    setCompanyId(quote.companyId);
    setContactId(quote.contactId);
    setOpportunityId(quote.opportunityId);
    if (quote.divisionId) setDivisionId(quote.divisionId);
    setDocumentNo(quote.documentNo);
    setQuoteDate(quote.quoteDate ? formatDay(new Date(quote.quoteDate)) : formatDay(new Date()));
    setValidityDays(String(quote.validityDays ?? 30));
    if (code === 'TRY' || code === 'USD' || code === 'EUR') setCurrencyCode(code);
    const amount = Number(quote.headerDiscountAmount ?? 0);
    const percent = Number((quote as RawQuote).headerDiscountPercent ?? 0);
    setHeaderDiscountAmount(amount > 0 ? String(amount) : '');
    setHeaderDiscountPercent(percent > 0 ? String(percent) : '');
    setPaymentTerms(quote.terms?.paymentTermsText ?? quote.paymentTerms ?? '');
    setDeliveryTerms(quote.terms?.deliveryTermsText ?? quote.deliveryTerms ?? '');
    setWarrantyTerms(quote.terms?.warrantyTermsText ?? quote.warrantyTerms ?? '');
    setImportCostsExcluded(quote.terms?.importCostsExcluded ?? true);
    setNotes(quote.notes ?? '');
    setItems(
      quote.items.length > 0
        ? [...quote.items]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((item) => ({
              key: item.id,
              itemId: item.id,
              productModelId: (item as RawQuoteItem).productModelId ?? undefined,
              stockCode: item.stockCode ?? undefined,
              description: item.description,
              quantity: String(Number(item.quantity)),
              unitPrice: String(Number(item.unitPrice)),
              discountAmount: Number(item.discountAmount) > 0 ? String(Number(item.discountAmount)) : '',
              vatRate: String(Number(item.vatRate)),
            }))
        : [emptyQuoteItem()]
    );
    setHydrated(true);
  }, [currencies.data, existing.data, hydrated, isEdit]);

  if (isEdit ? !canUpdate : !canCreate) return <Redirect href="/(tabs)/modules/quotes" />;

  if (isEdit && !hydrated) {
    return (
      <ModalForm title="Teklifi Düzenle" submitLabel="Kaydet" onSubmit={() => undefined} disabled>
        {existing.error ? (
          <ErrorState message={existing.error.message} onRetry={() => void existing.refetch()} />
        ) : (
          <DetailSkeleton />
        )}
      </ModalForm>
    );
  }

  const parsedPreview = parseQuoteItems(items);
  const netPreview = parsedPreview.error ? null : itemsNetTotal(parsedPreview.items);
  const busy = create.isPending || update.isPending;

  function chooseCompany(next: CompanyListItem) {
    if (next.id !== companyId) {
      setContactId(null);
      setOpportunityId(null);
    }
    setCompanyId(next.id);
    setCompanyName(next.shortName ?? next.legalTitle);
    setErrors((prev) => ({ ...prev, companyId: undefined }));
  }

  function submit() {
    const nextErrors: Record<string, string | undefined> = {};
    if (!companyId) nextErrors.companyId = 'Firma seçimi zorunludur.';
    if (divisions.length > 0 && !divisionId) nextErrors.divisionId = 'İş alanı seçin.';
    const date = parseDay(quoteDate);
    if (!date) nextErrors.quoteDate = 'Biçim: YYYY-AA-GG';
    const validity = Number(validityDays);
    if (!Number.isInteger(validity) || validity < 1 || validity > 365) nextErrors.validityDays = '1–365 gün arası girin.';
    const discountAmount = headerDiscountAmount.trim() ? parseDecimal(headerDiscountAmount) : 0;
    if (!(discountAmount >= 0)) nextErrors.headerDiscountAmount = 'Geçerli bir tutar girin.';
    const discountPercent = headerDiscountPercent.trim() ? parseDecimal(headerDiscountPercent) : 0;
    if (!(discountPercent >= 0 && discountPercent <= 100)) nextErrors.headerDiscountPercent = '0–100 arası girin.';
    if (documentNo.trim().length > 64) nextErrors.documentNo = 'En fazla 64 karakter.';
    const parsed = parseQuoteItems(items);
    if (parsed.error) nextErrors.items = parsed.error;
    if (Object.values(nextErrors).some(Boolean) || !date) {
      setErrors(nextErrors);
      toast.error(Object.values(nextErrors).find(Boolean) ?? 'Formu kontrol edin.');
      return;
    }

    const quote: QuoteCreateInput = {
      companyId,
      ...(opportunityId ? { opportunityId } : {}),
      ...(divisionId ? { divisionId } : {}),
      ...(contactId ? { contactId } : {}),
      ...(clean(documentNo) ? { documentNo: clean(documentNo) } : {}),
      quoteDate: date.toISOString(),
      validityDays: validity,
      currencyCode,
      headerDiscountAmount: discountAmount,
      headerDiscountPercent: discountPercent,
      paymentTerms: clean(paymentTerms),
      deliveryTerms: clean(deliveryTerms),
      warrantyTerms: clean(warrantyTerms),
      notes: clean(notes),
    };
    const terms: QuoteTermsInput = {
      paymentTermsText: clean(paymentTerms),
      deliveryTermsText: clean(deliveryTerms),
      warrantyTermsText: clean(warrantyTerms),
      importCostsExcluded,
    };

    if (isEdit) {
      update.mutate(
        { id: editId, quote, items: parsed.items, terms },
        {
          onSuccess: () => {
            toast.success('Teklif güncellendi');
            router.back();
          },
          onError: (error) => toast.error(error.message),
        }
      );
      return;
    }
    create.mutate(
      { quote, items: parsed.items, terms },
      {
        onSuccess: (created) => {
          toast.success(opportunityId ? 'Teklif oluşturuldu' : 'Teklif ve satış kartı oluşturuldu');
          router.replace(`/(tabs)/modules/quotes/${created.id}`);
        },
        onError: (error) => toast.error(error.message),
      }
    );
  }

  const contactOptions = (contacts.data?.items ?? []).slice(0, 12);
  const opportunityOptions = (opportunities.data?.items ?? []).slice(0, 12);

  return (
    <>
      <ModalForm
        title={isEdit ? 'Teklifi Düzenle' : 'Yeni Teklif'}
        submitLabel={isEdit ? 'Kaydet' : 'Teklifi Oluştur'}
        onSubmit={submit}
        loading={busy}
      >
        <View className="gap-3">
          <Eyebrow>Müşteri</Eyebrow>
          <PickerField
            label="Firma *"
            value={companyName || null}
            placeholder="Firma seçin"
            icon="business-outline"
            onPress={() => companySheet.current?.present()}
            error={errors.companyId}
            disabled={isEdit}
          />
          {companyId && contactOptions.length > 0 ? (
            <ChoiceChips
              label="Kontak"
              options={[{ value: '', label: 'Seçilmedi' }, ...contactOptions.map((contact) => ({ value: contact.id, label: contact.fullName }))]}
              value={contactId ?? ''}
              onChange={(next) => setContactId(next || null)}
            />
          ) : null}
          {companyId ? (
            <ChoiceChips
              label="Satış kartı"
              options={[
                { value: '', label: isEdit ? 'Bağlı değil' : 'Yeni kart aç' },
                ...opportunityOptions.map((opportunity) => ({ value: opportunity.id, label: opportunity.title })),
              ]}
              value={opportunityId ?? ''}
              onChange={(next) => setOpportunityId(next || null)}
            />
          ) : null}
          {!opportunityId && !isEdit ? (
            <Text className="font-inter text-xs text-muted-foreground">
              Kart seçilmezse ilk kalemin adıyla yeni satış kartı açılır ve "Teklif" aşamasına alınır.
            </Text>
          ) : null}
          {divisions.length > 0 ? (
            <View className="gap-1">
              <ChoiceChips
                label="İş alanı *"
                options={divisions.map((division) => ({ value: division.id, label: division.name }))}
                value={divisionId}
                onChange={(next) => {
                  setDivisionId(next);
                  setErrors((prev) => ({ ...prev, divisionId: undefined }));
                }}
              />
              {errors.divisionId ? <Text className="font-inter text-xs text-destructive">{errors.divisionId}</Text> : null}
            </View>
          ) : null}
        </View>

        <View className="gap-3">
          <Eyebrow>Teklif</Eyebrow>
          <Field
            label="Teklif no"
            value={documentNo}
            onChangeText={setDocumentNo}
            placeholder="Boş bırakılırsa otomatik"
            maxLength={64}
            error={errors.documentNo}
          />
          <View className="flex-row gap-2">
            <View className="flex-[1.4]">
              <DateTextField
                label="Teklif tarihi *"
                value={quoteDate}
                onChangeText={(value) => {
                  setQuoteDate(value);
                  setErrors((prev) => ({ ...prev, quoteDate: undefined }));
                }}
                error={errors.quoteDate}
              />
            </View>
            <View className="flex-1">
              <Field
                label="Geçerlilik (gün)"
                value={validityDays}
                onChangeText={(value) => {
                  setValidityDays(value);
                  setErrors((prev) => ({ ...prev, validityDays: undefined }));
                }}
                keyboardType="number-pad"
                maxLength={3}
                error={errors.validityDays}
              />
            </View>
          </View>
          <ChoiceChips
            label="Para birimi"
            options={CURRENCIES.map((code) => ({ value: code, label: code }))}
            value={currencyCode}
            onChange={setCurrencyCode}
          />
        </View>

        <QuoteItemsEditor
          items={items}
          onChange={(next) => {
            setItems(next);
            setErrors((prev) => ({ ...prev, items: undefined }));
          }}
          currencyCode={currencyCode}
          productCurrencies={productCurrencies}
          onProductCurrency={(key, code) =>
            setProductCurrencies((prev) => {
              const next = { ...prev };
              if (code) next[key] = code;
              else delete next[key];
              return next;
            })
          }
        />
        {errors.items ? <Text className="font-inter text-xs text-destructive">{errors.items}</Text> : null}

        <View className="gap-3">
          <Eyebrow>Genel iskonto</Eyebrow>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Field
                label={`Tutar (${currencyCode})`}
                value={headerDiscountAmount}
                onChangeText={setHeaderDiscountAmount}
                keyboardType="decimal-pad"
                placeholder="0"
                error={errors.headerDiscountAmount}
              />
            </View>
            <View className="flex-1">
              <Field
                label="Oran %"
                value={headerDiscountPercent}
                onChangeText={setHeaderDiscountPercent}
                keyboardType="decimal-pad"
                placeholder="0"
                error={errors.headerDiscountPercent}
              />
            </View>
          </View>
          {netPreview !== null ? (
            <SubtleCard className="px-3 py-1.5">
              <TotalLine label="Kalem net toplamı" value={formatAmount(netPreview, currencyCode)} strong />
            </SubtleCard>
          ) : null}
        </View>

        <View className="gap-3">
          <Eyebrow>Şartlar</Eyebrow>
          <Field label="Ödeme şartları" value={paymentTerms} onChangeText={setPaymentTerms} multiline maxLength={4000} />
          <Field label="Teslim şartları" value={deliveryTerms} onChangeText={setDeliveryTerms} multiline maxLength={4000} />
          <Field label="Garanti şartları" value={warrantyTerms} onChangeText={setWarrantyTerms} multiline maxLength={4000} />
          <ToggleRow label="Gümrük / ithalat masrafları hariç" value={importCostsExcluded} onChange={setImportCostsExcluded} />
          <Field label="Notlar" value={notes} onChangeText={setNotes} multiline maxLength={4000} />
        </View>
      </ModalForm>
      <CompanyPickerSheet sheetRef={companySheet} selectedId={companyId} onSelect={chooseCompany} />
    </>
  );
}
