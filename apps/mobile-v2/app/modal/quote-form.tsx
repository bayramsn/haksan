import { useQuery } from '@tanstack/react-query';
import { request } from '@/src/api/client';
import { quoteTotalsPreview } from '@/src/ui/documents/quote-preview';
import { validateQuoteConfigurations } from '@/src/ui/documents/quote-configuration';
import { postPdfAndShare } from '@/src/native/files';
import { shareSavedDocument } from '@/src/ui/documents/document-pdf';
import { DISCOUNT_APPROVAL_THRESHOLD_PERCENT, companyUpdateSchema, discountPercent, requiresDiscountApproval } from '@haksan/shared';
import { quoteCompanyDraft, quoteCompanyPatch, type QuoteCompanyDraft } from '@/src/ui/documents/quote-company-details';
import { quoteLinesUntouched, quoteOpportunityDefaults } from '@/src/ui/documents/quote-opportunity-defaults';
import { productsApi } from '@/src/api/endpoints';
import { productsExtraApi } from '@/src/api/products.api';
import { TermsTemplatePicker } from '@/src/ui/documents/TermsTemplatePicker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCompany, useUpdateCompanyFields } from '@/src/api/companies.hooks';
import { useContact, useLookup, useOpportunity } from '@/src/api/crm.hooks';
import type { CompanyAddress, CompanyListItem } from '@/src/api/endpoints';
import { useCreateQuoteFull, useQuoteDetail, useUpdateQuoteFull } from '@/src/api/quotes.hooks';
import type { QuoteCreateInput, QuoteTermsInput } from '@/src/api/quotes.api';
import { useSignatures } from '@/src/api/settings.hooks';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { formatAmount } from '@/src/lib/format';
import { Button, DetailSkeleton, ErrorState, Eyebrow, Field, SubtleCard } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { ChoiceChips, CompanyPickerSheet, OpportunityPickerSheet, ModalForm, PickerField, ToggleRow, TotalLine } from '@/src/ui/documents/pickers';
import { emptyQuoteItem, QuoteItemsEditor } from '@/src/ui/documents/QuoteItemsEditor';
import {
  formatDay,
  itemsNetTotal,
  newLineGroupKey,
  parseDay,
  parseDecimal,
  parseQuoteItems,
  QUOTE_DELIVERY_PRESETS,
  type EditableQuoteItem,
} from '@/src/ui/documents/quote-logic';
import { DateTextField } from '@/src/ui/select/DateTextField';
import { AssigneeSelect } from '@/src/ui/select/fields';
import { effectiveQuoteVat } from '@/src/ui/documents/quote-vat';
import { ContactPicker } from '@/src/ui/pickers/CompanyPicker';
import { PickerField as RecordPickerField } from '@/src/ui/pickers/PickerField';

function addressLabel(address: CompanyAddress): string {
  const line =
    address.fullAddress?.trim() ||
    [address.street, address.buildingNumber, address.district, address.province, address.country].filter(Boolean).join(', ');
  const roles = [
    address.isDefault ? 'varsayılan' : null,
    address.isBilling ? 'fatura' : null,
    address.isShipping ? 'sevk' : null,
  ].filter(Boolean);
  return roles.length ? `${line} (${roles.join(', ')})` : line || address.addressType;
}

const CURRENCIES = ['TRY', 'USD', 'EUR'] as const;
type Currency = (typeof CURRENCIES)[number];

function clean(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

type RawQuoteItem = {
  productModelId?: string | null;
  nationalized?: boolean;
  compatibility?: import('@/src/api/endpoints').QuoteItem['compatibility'];
};
type RawQuote = { headerDiscountPercent?: string | null };

/** Kayıtlı kalemleri forma çevirir; opsiyon satırlarını `lineGroupKey` ile ana ürüne bağlar. */
function hydrateQuoteItems(rawItems: import('@/src/api/endpoints').QuoteItem[]): EditableQuoteItem[] {
  if (!rawItems.length) return [emptyQuoteItem()];
  const sorted = [...rawItems].sort((a, b) => a.sortOrder - b.sortOrder);
  const mains: EditableQuoteItem[] = [];
  const orphans: EditableQuoteItem[] = [];
  for (const item of sorted) {
    const compat = item.compatibility ?? (item as RawQuoteItem).compatibility ?? null;
    const isOption = Boolean(compat?.configurationOptionSetId) || /^↳\s*Opsiyon:/i.test(item.description);
    const lineGroupKey = compat?.lineGroupKey || newLineGroupKey();
    if (isOption) {
      const parent = mains.find((row) => row.lineGroupKey === lineGroupKey);
      const child = {
        key: item.id,
        itemId: item.id,
        productModelId: item.productModelId ?? undefined,
        optionSetId: compat?.configurationOptionSetId,
        description: item.description.replace(/^↳\s*Opsiyon:\s*/i, ''),
        quantity: String(Number(item.quantity)),
        unitPrice: String(Number(item.unitPrice)),
        discount: Number(item.discountAmount) > 0 ? String(Number(item.discountAmount)) : '',
        discountType: 'amount' as const,
        vatRate: String(Number(item.vatRate)),
      };
      if (parent) parent.optionChildren.push(child);
      else orphans.push({ ...emptyQuoteItem(), key: item.id, itemId: item.id, description: item.description, quantity: child.quantity, unitPrice: child.unitPrice, discount: child.discount, vatRate: child.vatRate, lineGroupKey });
      continue;
    }
    mains.push({
      key: item.id,
      itemId: item.id,
      productModelId: item.productModelId ?? (item as RawQuoteItem).productModelId ?? undefined,
      stockCode: item.stockCode ?? undefined,
      description: item.description,
      quantity: String(Number(item.quantity)),
      unitPrice: String(Number(item.unitPrice)),
      discount: Number(item.discountAmount) > 0 ? String(Number(item.discountAmount)) : '',
      discountType: 'amount',
      vatRate: String(Number(item.vatRate)),
      nationalized: Boolean(item.nationalized ?? (item as RawQuoteItem).nationalized),
      lineGroupKey,
      selectedProductOptions: (compat?.selectedProductOptions ?? []).map((option) => ({
        optionSetId: option.optionSetId,
        optionValueId: option.optionValueId,
        name: option.name,
        value: option.value,
        priceDelta: Number(option.priceDelta) || 0,
        currencyCode: option.currencyCode || '',
      })),
      technicalSpecs: (compat?.technicalSpecs ?? []).map((spec) => ({
        key: spec.key,
        value: spec.value,
        unit: spec.unit ?? undefined,
      })),
      technicalConfiguration: compat?.technicalConfiguration ?? null,
      compatibilityFilters: {
        machineIds: compat?.machineIds ?? [],
        brands: compat?.brands ?? [],
        controlUnits: compat?.controlUnits ?? [],
        supplierIds: compat?.supplierIds ?? [],
      },
      optionChildren: [],
      configurationChanged: false,
    });
  }
  return [...mains, ...orphans].length ? [...mains, ...orphans] : [emptyQuoteItem()];
}

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
  const canEditCompany = useCan('companies.update');
  const existing = useQuoteDetail(editId);
  const currencies = useLookup('currencies');
  const signatures = useSignatures();
  const create = useCreateQuoteFull();
  const update = useUpdateQuoteFull();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [validating, setValidating] = useState(false);
  const [configurationBusy, setConfigurationBusy] = useState<Set<string>>(new Set());
  const submissionLock = useRef(false);
  const fx = useQuery({ queryKey: ['fx','rates'], queryFn: () => request<{ rates: Record<string,number>; date?: string; live?: boolean }>('/fx/rates'), staleTime: 60 * 60 * 1000 });

  const divisions = user?.divisions ?? [];
  const defaultDivision =
    scope.divisionId ?? divisions.find((division) => division.isPrimary)?.id ?? divisions[0]?.id ?? null;
  const canAssignOthers = user?.roles?.some((role) => role === 'super_admin' || role === 'sales') ?? false;

  const [companyId, setCompanyId] = useState(typeof params.companyId === 'string' ? params.companyId : '');
  const [companyName, setCompanyName] = useState('');
  const [companyAddressId, setCompanyAddressId] = useState('');
  const [contactId, setContactId] = useState<string | null>(null);
  const [opportunityId, setOpportunityId] = useState<string | null>(
    typeof params.opportunityId === 'string' ? params.opportunityId : null
  );
  const [divisionId, setDivisionId] = useState<string | null>(defaultDivision);
  const [projectOwnerUserId, setProjectOwnerUserId] = useState(user?.id ?? '');
  const [signatureId, setSignatureId] = useState('');
  const [documentNo, setDocumentNo] = useState('');
  const [quoteDate, setQuoteDate] = useState(formatDay(new Date()));
  const [validityDays, setValidityDays] = useState('30');
  const [currencyCode, setCurrencyCode] = useState<Currency>('USD');
  const [headerDiscountMode, setHeaderDiscountMode] = useState<'amount' | 'percent'>('amount');
  const [headerDiscountAmount, setHeaderDiscountAmount] = useState('');
  const [headerDiscountPercent, setHeaderDiscountPercent] = useState('');
  const [deliveryPreset, setDeliveryPreset] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryTerms, setDeliveryTerms] = useState('');
  const [warrantyTerms, setWarrantyTerms] = useState('');
  const [importCostsExcluded, setImportCostsExcluded] = useState(true);
  const [vatIncluded, setVatIncluded] = useState(false);
  const [vatEnabled, setVatEnabled] = useState(false);
  const [freightPaidBySeller, setFreightPaidBySeller] = useState(false);
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [deliveryDaysMin, setDeliveryDaysMin] = useState('');
  const [deliveryDaysMax, setDeliveryDaysMax] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<EditableQuoteItem[]>([emptyQuoteItem()]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [productCurrencies, setProductCurrencies] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [hydrated, setHydrated] = useState(!isEdit);
  const companySheet = useRef<BottomSheetModal>(null);
  const opportunitySheet = useRef<BottomSheetModal>(null);
  const [pickedContactName, setPickedContactName] = useState('');
  const [pickedOpportunityTitle, setPickedOpportunityTitle] = useState('');
  const selectedContact = useContact(contactId ?? '');
  const selectedOpportunity = useOpportunity(opportunityId ?? '');

  const company = useCompany(companyId);
  const updateCompany = useUpdateCompanyFields(companyId);
  const [companyDraft, setCompanyDraft] = useState<QuoteCompanyDraft | null>(null);
  const [savingCompany, setSavingCompany] = useState(false);
  useEffect(() => { setCompanyDraft(null); }, [companyId, companyAddressId]);
  useEffect(() => {
    if (isEdit || !selectedOpportunity.data || !quoteLinesUntouched(items)) return;
    let cancelled = false;
    const opportunity = selectedOpportunity.data;
    const ids = [...new Set((opportunity.products ?? []).map((row) => row.productModelId).filter((id): id is string => Boolean(id)))];
    void Promise.all(ids.map(async (id) => [id, await productsApi.get(id)] as const)).then((records) => {
      if (cancelled || !quoteLinesUntouched(itemsRef.current)) return;
      const defaults = quoteOpportunityDefaults(opportunity, Object.fromEntries(records));
      const rows = defaults.lines.map((line) => ({ ...emptyQuoteItem(), ...line }));
      setItems((current) => quoteLinesUntouched(current) ? rows : current);
      if (['USD', 'EUR', 'TRY'].includes(defaults.currencyCode)) setCurrencyCode(defaults.currencyCode as Currency);
      setProductCurrencies(Object.fromEntries(rows.flatMap((row, index) => defaults.productCurrencies[index] ? [[row.key, defaults.productCurrencies[index]!]] : [])));
    }).catch(() => { if (!cancelled) toast.error('Fırsatın ürün bilgileri yüklenemedi; kalemleri elle seçebilirsiniz.'); });
    return () => { cancelled = true; };
  }, [selectedOpportunity.data?.id, isEdit]);
  async function saveCompanyDraft() {
    if (!companyDraft || !company.data || !canEditCompany || savingCompany) return;
    if (!companyDraft.name.trim()) return toast.error('Firma unvanı zorunludur.');
    const parsed = companyUpdateSchema.safeParse(quoteCompanyPatch(company.data.addresses, companyAddressId, companyDraft));
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? 'Firma bilgilerini kontrol edin.');
    setSavingCompany(true);
    try { await updateCompany.mutateAsync(parsed.data); setCompanyName(companyDraft.name.trim()); setCompanyDraft(null); toast.success('Firma ve PDF adresi kaydedildi'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Firma kaydedilemedi'); }
    finally { setSavingCompany(false); }
  }

  const companyAddresses = company.data?.addresses ?? [];
  useEffect(() => {
    if (company.data && !companyName) setCompanyName(company.data.shortName ?? company.data.legalTitle);
  }, [company.data, companyName]);

  useEffect(() => {
    if (!companyId || !companyAddresses.length) return;
    if (companyAddressId && companyAddresses.some((row) => row.id === companyAddressId)) return;
    const preferred =
      companyAddresses.find((row) => row.isDefault) ??
      companyAddresses.find((row) => row.isBilling) ??
      companyAddresses[0];
    if (preferred) setCompanyAddressId(preferred.id);
  }, [companyAddressId, companyAddresses, companyId]);


  useEffect(() => {
    const quote = existing.data;
    // Para birimi lookup gecikse/hata verse bile formu kilitleme; kod yoksa USD.
    if (!isEdit || hydrated || !quote) return;
    const code = currencies.data?.find((item) => item.id === quote.currencyId)?.code;
    setCompanyId(quote.companyId);
    setCompanyAddressId(quote.companyAddressId ?? '');
    setContactId(quote.contactId);
    setOpportunityId(quote.opportunityId);
    if (quote.divisionId) setDivisionId(quote.divisionId);
    setProjectOwnerUserId(quote.projectOwnerUserId ?? quote.projectOwner?.id ?? user?.id ?? '');
    setSignatureId(quote.signatureId ?? '');
    setDocumentNo(quote.documentNo);
    setQuoteDate(quote.quoteDate ? formatDay(new Date(quote.quoteDate)) : formatDay(new Date()));
    setValidityDays(String(quote.validityDays ?? 30));
    if (code === 'TRY' || code === 'USD' || code === 'EUR') setCurrencyCode(code);
    const amount = Number(quote.headerDiscountAmount ?? 0);
    const percent = Number((quote as RawQuote).headerDiscountPercent ?? 0);
    if (percent > 0 && !(amount > 0)) {
      setHeaderDiscountMode('percent');
      setHeaderDiscountPercent(String(percent));
      setHeaderDiscountAmount('');
    } else {
      setHeaderDiscountMode('amount');
      setHeaderDiscountAmount(amount > 0 ? String(amount) : '');
      setHeaderDiscountPercent('');
    }
    setPaymentTerms(quote.terms?.paymentTermsText ?? quote.paymentTerms ?? '');
    setDeliveryTerms(quote.terms?.deliveryTermsText ?? quote.deliveryTerms ?? '');
    const matchedPreset = QUOTE_DELIVERY_PRESETS.find(
      (row) => row.label === (quote.terms?.deliveryTermsText ?? quote.deliveryTerms ?? '')
    );
    setDeliveryPreset(matchedPreset?.code ?? '');
    setWarrantyTerms(quote.terms?.warrantyTermsText ?? quote.warrantyTerms ?? '');
    setImportCostsExcluded(quote.terms?.importCostsExcluded ?? true);
    setVatIncluded(quote.terms?.vatIncluded ?? false);
    setFreightPaidBySeller(quote.terms?.freightPaidBySeller ?? false);
    setDeliveryLocation(quote.terms?.deliveryLocation ?? '');
    setDeliveryDaysMin(
      quote.terms?.estimatedDeliveryDaysMin != null ? String(quote.terms.estimatedDeliveryDaysMin) : ''
    );
    setDeliveryDaysMax(
      quote.terms?.estimatedDeliveryDaysMax != null ? String(quote.terms.estimatedDeliveryDaysMax) : ''
    );
    setNotes(quote.notes ?? '');
    setItems(hydrateQuoteItems(quote.items));
    setVatEnabled(quote.items.some((item) => Number(item.vatRate ?? 0) > 0));
    setHydrated(true);
  }, [currencies.data, existing.data, hydrated, isEdit, user?.id]);

  // Hydrate para birimi lookup’sız olduysa kod gelince düzelt.
  useEffect(() => {
    if (!isEdit || !hydrated || !existing.data?.currencyId || !currencies.data) return;
    const code = currencies.data.find((item) => item.id === existing.data?.currencyId)?.code;
    if (code === 'TRY' || code === 'USD' || code === 'EUR') setCurrencyCode(code);
  }, [currencies.data, existing.data?.currencyId, hydrated, isEdit]);

  if (isEdit ? !canUpdate : !canCreate) return <Redirect href="/modules/quotes" />;

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

  const parsedPreview = parseQuoteItems(effectiveQuoteVat(items, vatEnabled));
  const preview = parsedPreview.error ? null : quoteTotalsPreview(parsedPreview.items, items,
    { amount: headerDiscountMode === 'amount' ? parseDecimal(headerDiscountAmount) || 0 : 0, percent: headerDiscountMode === 'percent' ? parseDecimal(headerDiscountPercent) || 0 : 0 },
    currencyCode === 'USD' ? 1 : fx.data?.rates[currencyCode] ?? null);
  const busy = pdfBusy || validating || configurationBusy.size > 0 || create.isPending || update.isPending || savingCompany;

  function chooseCompany(next: CompanyListItem) {
    if (next.id !== companyId) {
      setContactId(null);
      setPickedContactName('');
      setOpportunityId(null);
      setPickedOpportunityTitle('');
      setCompanyAddressId('');
    }
    setCompanyId(next.id);
    setCompanyName(next.shortName ?? next.legalTitle);
    setErrors((prev) => ({ ...prev, companyId: undefined, companyAddressId: undefined }));
  }

  async function submit(thenPdf = false) {
    if (busy || submissionLock.current) return;
    if (companyDraft) return toast.error('Önce firma/PDF adresi düzenlemesini kaydedin veya vazgeçin.');
    const nextErrors: Record<string, string | undefined> = {};
    if (!companyId) nextErrors.companyId = 'Firma seçimi zorunludur.';
    if (divisions.length > 0 && !divisionId) nextErrors.divisionId = 'İş alanı seçin.';
    if (companyAddresses.length > 0 && !companyAddressId) {
      nextErrors.companyAddressId = "PDF'de kullanılacak adresi seçin.";
    }
    const date = parseDay(quoteDate);
    if (!date) nextErrors.quoteDate = 'Biçim: YYYY-AA-GG';
    const validity = Number(validityDays);
    if (!Number.isInteger(validity) || validity < 1 || validity > 365) nextErrors.validityDays = '1–365 gün arası girin.';
    const discountAmount =
      headerDiscountMode === 'amount' && headerDiscountAmount.trim() ? parseDecimal(headerDiscountAmount) : 0;
    if (headerDiscountMode === 'amount' && !(discountAmount >= 0)) nextErrors.headerDiscountAmount = 'Geçerli bir tutar girin.';
    const discountPercent =
      headerDiscountMode === 'percent' && headerDiscountPercent.trim() ? parseDecimal(headerDiscountPercent) : 0;
    if (headerDiscountMode === 'percent' && !(discountPercent >= 0 && discountPercent <= 100)) {
      nextErrors.headerDiscountPercent = '0–100 arası girin.';
    }
    if ([paymentTerms, deliveryTerms, warrantyTerms].some(value => value.length > 2000)) nextErrors.terms = 'Ödeme, teslim ve garanti şartları en fazla 2000 karakter olabilir.';
    if (documentNo.trim().length > 64) nextErrors.documentNo = 'En fazla 64 karakter.';
    const daysMin = deliveryDaysMin.trim() ? Number(deliveryDaysMin) : null;
    const daysMax = deliveryDaysMax.trim() ? Number(deliveryDaysMax) : null;
    if (daysMin !== null && (!Number.isInteger(daysMin) || daysMin < 0)) nextErrors.deliveryDaysMin = 'Geçerli gün girin.';
    if (daysMax !== null && (!Number.isInteger(daysMax) || daysMax < 0)) nextErrors.deliveryDaysMax = 'Geçerli gün girin.';
    if (daysMin !== null && daysMax !== null && daysMax < daysMin) nextErrors.deliveryDaysMax = 'Max ≥ min olmalı.';
    const parsed = parseQuoteItems(effectiveQuoteVat(items, vatEnabled));
    if (parsed.error) nextErrors.items = parsed.error;
    if (Object.values(nextErrors).some(Boolean) || !date) {
      setErrors(nextErrors);
      toast.error(Object.values(nextErrors).find(Boolean) ?? 'Formu kontrol edin.');
      return;
    }

    submissionLock.current = true;
    setValidating(true);
    try {
      await validateQuoteConfigurations(items, currencyCode, async (id) => {
        const [sets, product] = await Promise.all([productsExtraApi.optionSets(id), productsApi.get(id)]);
        return { sets, baseModelConfiguration: (product as typeof product & { baseModelConfiguration?: { configurations: unknown[] } | null }).baseModelConfiguration };
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Makine konfigürasyonu doğrulanamadı.');
      return;
    } finally { setValidating(false); submissionLock.current = false; }

    const quote: QuoteCreateInput = {
      companyId,
      ...(companyAddressId ? { companyAddressId } : {}),
      // Edit’te bağlantı kaldırma için null gönder; create’te yalnız doluysa bağla.
      ...(isEdit
        ? { opportunityId: opportunityId || null, contactId: contactId || null }
        : {
            ...(opportunityId ? { opportunityId } : {}),
            ...(contactId ? { contactId } : {}),
          }),
      ...(divisionId ? { divisionId } : {}),
      ...(projectOwnerUserId ? { projectOwnerUserId } : {}),
      signatureId: signatureId || null,
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
      vatIncluded,
      freightPaidBySeller,
      deliveryLocation: clean(deliveryLocation),
      ...(daysMin !== null ? { estimatedDeliveryDaysMin: daysMin } : {}),
      ...(daysMax !== null ? { estimatedDeliveryDaysMax: daysMax } : {}),
    };

    const saved = async (savedId: string, message: string) => {
      toast.success(message);
      if (thenPdf) {
        setPdfBusy(true);
        try { await shareSavedDocument('quote', savedId, documentNo, postPdfAndShare); }
        catch (error) { toast.error(`Teklif kaydedildi; PDF alınamadı. Detaydan tekrar deneyin. ${error instanceof Error ? error.message : ''}`); }
        finally { setPdfBusy(false); }
      }
      router.replace(`/modules/quotes/${savedId}`);
    };
    if (isEdit) {
      update.mutate(
        { id: editId, quote, items: parsed.items, terms },
        {
          onSuccess: () => void saved(editId, 'Teklif güncellendi'),
          onError: (error) => toast.error(error.message),
        }
      );
      return;
    }
    create.mutate(
      { quote, items: parsed.items, terms },
      {
        onSuccess: (created) => void saved(created.id, opportunityId ? 'Teklif oluşturuldu' : 'Teklif ve satış kartı oluşturuldu'),
        onError: (error) => toast.error(error.message),
      }
    );
  }


  return (
    <>
      <ModalForm
        title={isEdit ? 'Teklifi Düzenle' : 'Yeni Teklif'}
        submitLabel={isEdit ? 'Kaydet' : 'Teklifi Oluştur'}
        onSubmit={() => submit(false)}
        secondaryLabel="Kaydet ve PDF al"
        onSecondarySubmit={() => submit(true)}
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
          />
          {companyId ? (
            <ContactPicker
              label="Kontak"
              companyId={companyId}
              value={contactId ? { id: contactId, name: pickedContactName || selectedContact.data?.fullName || 'Seçili kontak' } : null}
              onChange={(next) => { setContactId(next?.id ?? null); setPickedContactName(next?.name ?? ''); }}
              placeholder="Firmanın kontaklarından seçin"
            />
          ) : null}
          {companyId && companyAddresses.length > 0 ? (
            <View className="gap-1">
              <ChoiceChips
                label="PDF adresi *"
                options={companyAddresses.map((address) => ({
                  value: address.id,
                  label: addressLabel(address),
                }))}
                value={companyAddressId}
                onChange={(next) => {
                  setCompanyAddressId(next);
                  setErrors((prev) => ({ ...prev, companyAddressId: undefined }));
                }}
              />
              {errors.companyAddressId ? (
                <Text className="font-inter text-xs text-destructive">{errors.companyAddressId}</Text>
              ) : null}
            </View>
          ) : null}
          {canEditCompany && company.data ? <View className="gap-2">
            <Button variant="ghost" label={companyDraft ? 'Firma / adres düzenlemesini kapat' : 'Firma adı ve PDF adresini düzenle'} onPress={() => setCompanyDraft((current) => current ? null : quoteCompanyDraft(company.data!.legalTitle, companyAddresses.find((item) => item.id === companyAddressId)))} disabled={busy} />
            {companyDraft ? <SubtleCard className="gap-3">
              <Text className="font-inter text-xs text-muted-foreground">Kaydettiğiniz bilgiler CRM firma kaydını da günceller.</Text>
              {([['name', 'Firma unvanı'], ['country', 'Ülke'], ['city', 'İl'], ['district', 'İlçe'], ['address', 'PDF açık adresi']] as const).map(([key, label]) => <Field key={key} label={label} value={companyDraft[key]} onChangeText={(value) => setCompanyDraft((current) => current ? { ...current, [key]: value } : null)} multiline={key === 'address'} editable={!busy} />)}
              <Button label="Firma ve adresi kaydet" onPress={() => void saveCompanyDraft()} loading={savingCompany} />
            </SubtleCard> : null}
          </View> : null}
          {companyId ? (
            <RecordPickerField
              label="Satış kartı"
              value={opportunityId ? pickedOpportunityTitle || selectedOpportunity.data?.title || 'Seçili satış kartı' : ''}
              placeholder={isEdit ? 'Bağlı değil' : 'Yeni kart aç'}
              icon="briefcase-outline"
              onPress={() => opportunitySheet.current?.present()}
              onClear={() => { setOpportunityId(null); setPickedOpportunityTitle(''); }}
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
          <AssigneeSelect
            label="Gönderen / proje sahibi"
            value={projectOwnerUserId}
            onChange={setProjectOwnerUserId}
            divisionId={divisionId}
            onlyUserId={canAssignOthers ? null : user?.id}
            clearable
          />
          <ChoiceChips
            label="Belge imzası"
            options={[
              { value: '', label: 'İmzasız' },
              ...(signatures.data ?? [])
                .filter((row) => row.isActive)
                .map((row) => ({ value: row.id, label: row.title ? `${row.name} · ${row.title}` : row.name })),
            ]}
            value={signatureId}
            onChange={setSignatureId}
          />
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

        <View className="gap-1">
          <ToggleRow label="KDV hesapla" value={vatEnabled} onChange={setVatEnabled} />
          <Text className="font-inter text-xs text-muted-foreground">{vatEnabled ? 'Kalemlerin KDV oranları teklif toplamına uygulanır.' : 'Teklif kalemleri KDV hesaplanmadan kaydedilir. KDV’nin fiyata dahil olması ayrı bir şarttır.'}</Text>
        </View>
        <QuoteItemsEditor onConfigurationBusyChange={(key, pending) => setConfigurationBusy(current => { const next = new Set(current); if (pending) next.add(key); else next.delete(key); return next; })}
          items={items}
          vatEnabled={vatEnabled}
          onChange={(next) => {
            setItems(next);
            setErrors((prev) => ({ ...prev, items: undefined }));
          }}
          currencyCode={currencyCode}
          divisionId={divisionId}
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
          <ChoiceChips
            label="İskonto tipi"
            options={[
              { value: 'amount', label: 'Tutar' },
              { value: 'percent', label: 'Oran %' },
            ]}
            value={headerDiscountMode}
            onChange={(mode) => {
              setHeaderDiscountMode(mode as 'amount' | 'percent');
              if (mode === 'amount') setHeaderDiscountPercent('');
              else setHeaderDiscountAmount('');
            }}
          />
          {headerDiscountMode === 'amount' ? (
            <Field
              label={`Tutar (${currencyCode})`}
              value={headerDiscountAmount}
              onChangeText={setHeaderDiscountAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              error={errors.headerDiscountAmount}
            />
          ) : (
            <Field
              label="Oran %"
              value={headerDiscountPercent}
              onChangeText={setHeaderDiscountPercent}
              keyboardType="decimal-pad"
              placeholder="0"
              error={errors.headerDiscountPercent}
            />
          )}
          {preview !== null ? (
            <SubtleCard className="px-3 py-1.5">
              <TotalLine label="Kalem toplamı" value={formatAmount(preview.gross, currencyCode)} />
              <TotalLine label="Kalem iskontosu" value={formatAmount(preview.lineDiscount, currencyCode)} />
              <TotalLine label="Genel iskonto" value={formatAmount(preview.headerDiscount, currencyCode)} />
              <TotalLine label="KDV" value={formatAmount(preview.vat, currencyCode)} />
              <TotalLine label="Gümrük ve vergiler" value={preview.customs === null ? 'Kur bekleniyor' : formatAmount(preview.customs, currencyCode)} />
              <TotalLine label="Genel toplam" value={preview.grand === null ? 'Kur bekleniyor' : formatAmount(preview.grand, currencyCode)} strong />
              {preview.customs === null ? <Button label="Döviz kurunu yeniden yükle" variant="ghost" onPress={() => void fx.refetch()} /> : null}
              {/* Web QuoteDialog: sunucu aynı eşikle teklifi onaya düşürür; önceden söyle. */}
              {requiresDiscountApproval(preview.gross, preview.lineDiscount + preview.headerDiscount) ? (
                <Text accessibilityRole="alert" className="mt-1.5 rounded-md bg-warning-soft px-2 py-1.5 font-inter text-xs text-warning">
                  Toplam indirim %{discountPercent(preview.gross, preview.lineDiscount + preview.headerDiscount).toFixed(2)}. %{DISCOUNT_APPROVAL_THRESHOLD_PERCENT} üzeri teklifler kaydedildiğinde otomatik onaya düşer.
                </Text>
              ) : null}
            </SubtleCard>
          ) : null}
        </View>

        <View className="gap-3">
          <Eyebrow>Şartlar</Eyebrow>
          <TermsTemplatePicker scope="quote_terms" value={{ payment: paymentTerms, delivery: deliveryTerms, warranty: warrantyTerms }}
            onApply={(next) => { setPaymentTerms(next.payment); setDeliveryTerms(next.delivery); setWarrantyTerms(next.warranty); }} />
          <Field label="Ödeme şartları" value={paymentTerms} onChangeText={setPaymentTerms} multiline maxLength={2000} />
          <ChoiceChips
            label="Teslim ön ayarı"
            options={[
              { value: '', label: 'Serbest' },
              ...QUOTE_DELIVERY_PRESETS.map((row) => ({ value: row.code, label: row.label })),
            ]}
            value={deliveryPreset}
            onChange={(code) => {
              setDeliveryPreset(code);
              const preset = QUOTE_DELIVERY_PRESETS.find((row) => row.code === code);
              if (preset) {
                setDeliveryTerms(preset.label);
                setImportCostsExcluded(preset.importCostsExcluded);
              }
            }}
          />
          <Field label="Teslim şartları" value={deliveryTerms} onChangeText={setDeliveryTerms} multiline maxLength={2000} />
          <Field label="Garanti şartları" value={warrantyTerms} onChangeText={setWarrantyTerms} multiline maxLength={2000} />
          <Field
            label="Teslim yeri"
            value={deliveryLocation}
            onChangeText={setDeliveryLocation}
            placeholder="Örn. müşteri adresi / liman"
            maxLength={500}
          />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Field
                label="Tahmini teslim (min gün)"
                value={deliveryDaysMin}
                onChangeText={(value) => {
                  setDeliveryDaysMin(value.replace(/\D/g, ''));
                  setErrors((prev) => ({ ...prev, deliveryDaysMin: undefined, deliveryDaysMax: undefined }));
                }}
                keyboardType="number-pad"
                maxLength={4}
                error={errors.deliveryDaysMin}
              />
            </View>
            <View className="flex-1">
              <Field
                label="Tahmini teslim (max gün)"
                value={deliveryDaysMax}
                onChangeText={(value) => {
                  setDeliveryDaysMax(value.replace(/\D/g, ''));
                  setErrors((prev) => ({ ...prev, deliveryDaysMax: undefined }));
                }}
                keyboardType="number-pad"
                maxLength={4}
                error={errors.deliveryDaysMax}
              />
            </View>
          </View>
          <ToggleRow label="Gümrük / ithalat masrafları hariç" value={importCostsExcluded} onChange={setImportCostsExcluded} />
          <ToggleRow label="KDV fiyata dahil" value={vatIncluded} onChange={setVatIncluded} />
          <ToggleRow label="Navlun + sigorta satıcıda" value={freightPaidBySeller} onChange={setFreightPaidBySeller} />
          <Field label="Notlar" value={notes} onChangeText={setNotes} multiline maxLength={4000} />
        </View>
      </ModalForm>
      <CompanyPickerSheet sheetRef={companySheet} selectedId={companyId} onSelect={chooseCompany} />
      {companyId ? <OpportunityPickerSheet sheetRef={opportunitySheet} companyId={companyId} view="active" selectedId={opportunityId ?? undefined} onSelect={(next) => { setOpportunityId(next.id); setPickedOpportunityTitle(next.title); }} /> : null}
    </>
  );
}
