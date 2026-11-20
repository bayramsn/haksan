import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { quoteDraftCreateSchema, quoteDraftUpdateSchema, proformaCreateSchema, contractCreateSchema, standaloneProformaCreateSchema, standaloneContractCreateSchema, standaloneProformaUpdateSchema, standaloneContractUpdateSchema, type QuoteItemCompatibility } from '@haksan/shared';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { useLookup, useQuoteList } from '@/src/api/crm.hooks';
import { useProductOptions } from '@/src/api/inventory.hooks';
import { commercialDocs, companies, contacts, opportunities, productsApi, quotes, type QuoteDetail, type QuoteItem, type ProductModel } from '@/src/api/endpoints';
import { Button, Card, ErrorState, Field, FilterChips, Loading, SearchBar } from '@/src/ui';
import { useTaskAssignees } from '@/src/api/tasks.hooks';
import { parseDecimal } from '@/src/lib/format';
import { request } from '@/src/api/client';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { isCommercialLocked } from '@/src/commercial/policy';
import { commercialApi, paths, useSaveCommercialDraft, type DraftKind } from '@/src/commercial/api';

type Line = { configChanged?: boolean; id?: string; productModelId?: string | null; inventoryItemId?: string | null; stockCode?: string; description: string; quantity: string; unitCode: string; unitPrice: string; discountAmount: string; vatRate: string; compatibility?: QuoteItemCompatibility | null; nationalized?: boolean };
const blank = (): Line => ({ description: '', quantity: '1', unitCode: 'adet', unitPrice: '0', discountAmount: '0', vatRate: '20' });
const num = (value: string) => parseDecimal(value);
type Signature = { id: string; name: string; title: string | null };
const names: Record<DraftKind, string> = { quote: 'Teklif', proforma: 'Proforma', contract: 'Sözleşme' };

export default function CommercialDraftScreen() {
  const params = useLocalSearchParams<{ kind?: string; id?: string; quoteId?: string; opportunityId?: string; companyId?: string; companyName?: string }>();
  const kind: DraftKind = params.kind === 'contract' || params.kind === 'proforma' ? params.kind : 'quote';
  const id = params.id ?? '';
  const router = useRouter();
  const { user, scope } = useAuth();
  const [opportunityId, setOpportunityId] = useState(params.opportunityId ?? '');
  const [divisionId, setDivisionId] = useState(scope.divisionId ?? '');
  const allowed = useCan(`${paths[kind]}.${id ? 'update' : 'create'}`);
  const save = useSaveCommercialDraft();
  // Firma veya fırsat detayından açıldığında firma hazır gelir.
  const [companyId, setCompanyId] = useState(params.companyId ?? '');
  const [companyName, setCompanyName] = useState(params.companyName ?? '');
  const [companyAddressId, setCompanyAddressId] = useState('');
  const [contactId, setContactId] = useState('');
  const [quoteId, setQuoteId] = useState(params.quoteId ?? '');
  const [documentNo, setDocumentNo] = useState('');
  const [date, setDate] = useState(new Date().toLocaleDateString('sv-SE'));
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [validity, setValidity] = useState('30');
  const [discount, setDiscount] = useState('0');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [freeCompanyName, setFreeCompanyName] = useState('');
  const [payment, setPayment] = useState('');
  const [delivery, setDelivery] = useState('');
  const [warranty, setWarranty] = useState('');
  // Web ile aynı: teklifi gönderen + çıktı imzası, ithalat masrafı bayrağı, genel iskonto
  // yüzde YA DA tutar; belgeye özel şartlar ancak düzenlendiyse gönderilir.
  const [senderId, setSenderId] = useState(user?.id ?? '');
  const [signatureId, setSignatureId] = useState('');
  const [importCostsExcluded, setImportCostsExcluded] = useState(true);
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [termsDirty, setTermsDirty] = useState(false);
  const [paymentTermDays, setPaymentTermDays] = useState('');
  const [deliveryMin, setDeliveryMin] = useState('');
  const [deliveryMax, setDeliveryMax] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState('');
  const [picker, setPicker] = useState<'company' | 'product' | 'quote' | 'opportunity' | null>(null);
  const [optionLine, setOptionLine] = useState<number | null>(null);
  const [error, setError] = useState('');
  const initialized = useRef(false);
  const sourceInitialized = useRef('');
  const serverSearch = useDebouncedValue(search.trim());
  const units = useLookup('units', allowed);
  const users = useTaskAssignees();
  const signatures = useQuery({ queryKey: ['signatures', 'active'], enabled: allowed, queryFn: () => request<Signature[]>('/signatures', { query: { activeOnly: true } }) });
  const currencies = useLookup('currencies', allowed);
  const canReadContacts = useCan('contacts.read');
  const companyRecord = useQuery({ queryKey: ['companies', 'detail', companyId], enabled: allowed && Boolean(companyId), queryFn: () => companies.get(companyId) });
  const contactOptions = useInfiniteQuery({ queryKey: ['commercial-picker', 'contacts', companyId], enabled: allowed && canReadContacts && Boolean(companyId) && kind === 'quote', initialPageParam: 1,
    queryFn: ({ pageParam }) => contacts.list({ companyId, page: pageParam, pageSize: 25 }),
    getNextPageParam: (last) => last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
    select: (data) => ({ items: data.pages.flatMap((page) => page.data) }) });
  const detail = useQuery({ queryKey: ['commercial-editor', kind, id], enabled: allowed && Boolean(id), queryFn: async () => kind === 'quote' ? quotes.get(id) : kind === 'proforma' ? commercialDocs.getProforma(id) : commercialDocs.getContract(id) });
  const source = useQuery({ queryKey: ['quotes', 'detail', quoteId], enabled: allowed && kind !== 'quote' && Boolean(quoteId), queryFn: () => quotes.get(quoteId) });
  const companyList = useInfiniteQuery({ queryKey: ['commercial-picker', 'companies', serverSearch], enabled: allowed && picker === 'company', initialPageParam: 1,
    queryFn: ({ pageParam }) => companies.list({ search: serverSearch || undefined, page: pageParam, pageSize: 25 }),
    getNextPageParam: (last) => last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
    select: (data) => ({ items: data.pages.flatMap((page) => page.data) }) });
  const productList = useInfiniteQuery({ queryKey: ['commercial-picker', 'products', serverSearch], enabled: allowed && picker === 'product', initialPageParam: 1,
    queryFn: ({ pageParam }) => productsApi.list({ search: serverSearch || undefined, page: pageParam, pageSize: 25 }),
    getNextPageParam: (last) => last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
    select: (data) => ({ items: data.pages.flatMap((page) => page.data) }) });
  const quoteList = useQuoteList({ search: serverSearch || undefined }, allowed && picker === 'quote');
  const canReadOpportunities = useCan('opportunities.read');
  const opportunityList = useInfiniteQuery({ queryKey: ['commercial-picker', 'opportunities', serverSearch],
    enabled: allowed && canReadOpportunities && picker === 'opportunity', initialPageParam: 1,
    queryFn: ({ pageParam }) => opportunities.list({ search: serverSearch || undefined, view: 'active', page: pageParam, pageSize: 25 }),
    getNextPageParam: (last) => last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
    select: (data) => ({ items: data.pages.flatMap((page) => page.data) }) });
  const opportunity = useQuery({ queryKey: ['commercial-editor-opportunity', opportunityId],
    enabled: allowed && kind === 'quote' && Boolean(opportunityId), queryFn: () => opportunities.get(opportunityId) });
  const readiness = useQuery({ queryKey: ['commercial-editor-readiness', opportunityId],
    enabled: allowed && kind === 'quote' && Boolean(opportunityId),
    queryFn: () => request<{ ready: boolean; blockers: { key: string; label: string }[] }>(`/opportunities/${opportunityId}/quote-readiness`) });
  useEffect(() => {
    if (!opportunity.data || id) return;
    const row = opportunity.data as unknown as { companyId?: string; primaryContactId?: string; divisionId?: string };
    if (row.companyId) { setCompanyId(row.companyId); setCompanyName(''); }
    if (row.primaryContactId) setContactId(row.primaryContactId);
    if (row.divisionId) setDivisionId(row.divisionId);
  }, [opportunity.data, id]);
  const selectedLine = optionLine === null ? null : lines[optionLine];
  const options = useProductOptions(selectedLine?.productModelId ?? '');
  function mapLine(item: QuoteItem): Line {
    return { ...blank(), ...item, stockCode: item.stockCode ?? undefined, unitCode: item.unitCode ?? units.data?.find((unit) => unit.id === item.unitId)?.code ?? 'adet' };
  }
  function fillQuote(quote: QuoteDetail) {
    setOpportunityId(quote.opportunityId ?? ''); setDivisionId(quote.divisionId ?? scope.divisionId ?? ''); setCompanyId(quote.companyId); setContactId(quote.contactId ?? ''); setCompanyAddressId(quote.companyAddressId ?? ''); setDate(quote.quoteDate.slice(0, 10)); setValidity(String(quote.validityDays));
    setCurrencyCode(currencies.data?.find((currency) => currency.id === quote.currencyId)?.code ?? 'USD');
    setDiscount(quote.headerDiscountPercent ?? '0'); setDiscountAmount(quote.headerDiscountAmount ?? '0'); setNotes(quote.notes ?? '');
    setDiscountType(Number(quote.headerDiscountPercent ?? 0) > 0 || !(Number(quote.headerDiscountAmount ?? 0) > 0) ? 'percent' : 'amount');
    const extra = quote as unknown as { projectOwnerUserId?: string | null; signatureId?: string | null; terms?: { importCostsExcluded?: boolean } | null };
    if (kind === 'quote') { setSenderId(extra.projectOwnerUserId ?? user?.id ?? ''); setSignatureId(extra.signatureId ?? ''); }
    setImportCostsExcluded(extra.terms?.importCostsExcluded ?? true);
    setPayment(quote.paymentTerms ?? quote.terms?.paymentTermsText ?? ''); setDelivery(quote.deliveryTerms ?? quote.terms?.deliveryTermsText ?? ''); setWarranty(quote.warrantyTerms ?? quote.terms?.warrantyTermsText ?? '');
    const mapped = quote.items.map(mapLine);
    setLines(mapped);
  }
  useEffect(() => {
    if (!detail.data || initialized.current || !units.data || !currencies.data) return;
    initialized.current = true;
    if (kind === 'quote') {
      const quote = detail.data as QuoteDetail; fillQuote(quote); setDocumentNo(quote.documentNo);
    } else {
      const row = detail.data as Awaited<ReturnType<typeof commercialDocs.getProforma>> & { contractNo?: string; signedDate?: string };
      setQuoteId(row.quoteId ?? '');
      if (!row.quoteId) {
        const snapshot = row.documentSnapshot as { items?: Line[]; company?: { id?: string; legalTitle?: string }; quote?: { headerDiscountAmount?: number; headerDiscountPercent?: number; paymentTerms?: string; deliveryTerms?: string; warrantyTerms?: string; notes?: string }; currency?: { code?: string } } | null;
        setCompanyId(row.companyId ?? ''); setFreeCompanyName(snapshot?.company?.legalTitle ?? '');
        setLines((snapshot?.items ?? []).map((line) => ({ ...blank(), ...line, quantity: String(line.quantity), unitPrice: String(line.unitPrice), discountAmount: String(line.discountAmount ?? 0), vatRate: String(line.vatRate ?? 20) })));
        setCurrencyCode(snapshot?.currency?.code ?? 'USD'); setPayment(snapshot?.quote?.paymentTerms ?? ''); setDelivery(snapshot?.quote?.deliveryTerms ?? ''); setWarranty(snapshot?.quote?.warrantyTerms ?? ''); setNotes(snapshot?.quote?.notes ?? '');
        setDiscount(String(snapshot?.quote?.headerDiscountPercent ?? 0)); setDiscountAmount(String(snapshot?.quote?.headerDiscountAmount ?? 0));
      }
      setDocumentNo(row.contractNo ?? row.documentNo ?? ''); setDate((row.signedDate ?? row.issueDate ?? '').slice(0, 10));
      const docExtra = row as unknown as { signatureId?: string | null; paymentTermDays?: number | null; terms?: { estimatedDeliveryDaysMin?: number | null; estimatedDeliveryDaysMax?: number | null } | null };
      setSignatureId(docExtra.signatureId ?? '');
      setPaymentTermDays(docExtra.paymentTermDays != null ? String(docExtra.paymentTermDays) : '');
      setDeliveryMin(docExtra.terms?.estimatedDeliveryDaysMin != null ? String(docExtra.terms.estimatedDeliveryDaysMin) : '');
      setDeliveryMax(docExtra.terms?.estimatedDeliveryDaysMax != null ? String(docExtra.terms.estimatedDeliveryDaysMax) : '');
    }
  }, [detail.data, units.data, currencies.data]);
  useEffect(() => {
    if (!source.data || sourceInitialized.current === quoteId || !units.data || !currencies.data || (id && !initialized.current)) return;
    sourceInitialized.current = quoteId;
    fillQuote(source.data);
    setDate(new Date().toLocaleDateString('sv-SE'));
    if (id && detail.data && kind !== 'quote') {
      const row = detail.data as unknown as Record<string, unknown>;
      const snapshot = row.documentSnapshot as { items?: Array<Record<string, unknown>>; quote?: Record<string, unknown> } | null;
      setDate(String(row.signedDate ?? row.issueDate ?? '').slice(0, 10));
      const own = row.terms as Record<string, unknown> | null;
      setPayment(String(own?.paymentTermsText ?? source.data.paymentTerms ?? '')); setDelivery(String(own?.deliveryTermsText ?? source.data.deliveryTerms ?? '')); setWarranty(String(own?.warrantyTermsText ?? source.data.warrantyTerms ?? ''));
      if (snapshot?.items?.length) {
        const overridden = source.data.items.map((item) => {
          const override = snapshot.items!.find((saved) => saved.quoteItemId === item.id || saved.id === item.id);
          return { ...mapLine(item), ...(override ? { unitPrice: String(override.unitPrice ?? item.unitPrice), discountAmount: String(override.discountAmount ?? item.discountAmount) } : {}) };
        });
        setLines(overridden);
      }
      if (snapshot?.quote?.headerDiscountAmount != null) setDiscountAmount(String(snapshot.quote.headerDiscountAmount));
      if (snapshot?.quote?.headerDiscountPercent != null) setDiscount(String(snapshot.quote.headerDiscountPercent));
    }
  }, [source.data, units.data, currencies.data, detail.data, quoteId]);
  useEffect(() => {
    if (companyRecord.data) setCompanyName(companyRecord.data.shortName ?? companyRecord.data.legalTitle);
  }, [companyRecord.data]);

  if (!allowed) return <Redirect href="/modules" />;
  if (units.isPending || currencies.isPending) return <Loading />;
  if (units.error || currencies.error) return <ErrorState message={(units.error ?? currencies.error)!.message} onRetry={() => { void units.refetch(); void currencies.refetch(); }} />;
  if (id && detail.isPending) return <Loading />;
  if (detail.error) return <ErrorState message={detail.error.message} onRetry={() => void detail.refetch()} />;
  const record = detail.data as unknown as { finalizedAt?: string | null; approvedAt?: string | null } | undefined;
  const locked = isCommercialLocked(record);
  function patchLine(index: number, patch: Partial<Line>) { setLines((previous) => previous.map((line, at) => at === index ? { ...line, ...patch } : line)); }
  function selectProduct(product: ProductModel) {
    setLines((previous) => [...previous, { ...blank(), productModelId: product.id, description: product.fullName, stockCode: product.stockCode ?? undefined, unitPrice: product.currency?.code && product.currency.code !== currencyCode && lines.length > 0 ? '' : product.listPrice ?? '', vatRate: product.vatRate ?? '20' }]);
    if (product.currency?.code && product.currency.code !== currencyCode) {
      if (!lines.length) setCurrencyCode(product.currency.code);
      else setError(`Ürün fiyatı ${product.currency.code}. ${currencyCode} cinsinden birim fiyatı girin; kur dönüşümü otomatik yapılmaz.`);
    }
    setPicker(null); setSearch('');
  }
  async function submit() {
    if (save.isPending || locked) return;
    setError('');
    const quoteItems = lines.map((line, index) => ({ ...line, quantity: num(line.quantity), unitPrice: num(line.unitPrice), discountAmount: num(line.discountAmount), vatRate: num(line.vatRate), sortOrder: index }));
    const terms = { paymentTermsText: payment, deliveryTermsText: delivery, warrantyTermsText: warranty };
    const common = { terms, opportunityId, divisionId: divisionId || undefined, companyId, companyAddressId: companyAddressId || undefined, contactId: contactId || undefined, documentNo: documentNo.trim() || undefined, quoteDate: date, validityDays: num(validity), currencyCode, headerDiscountPercent: num(discount), headerDiscountAmount: num(discountAmount), notes, paymentTerms: payment, deliveryTerms: delivery, warrantyTerms: warranty, items: quoteItems };
    try {
      let saved: { id: string };
      if (kind === 'quote') {
        if (id) { const body = quoteDraftUpdateSchema.parse(common); saved = await save.mutateAsync(() => commercialApi.updateQuote(id, body)); }
        else { const body = quoteDraftCreateSchema.parse(common); saved = await save.mutateAsync(() => commercialApi.createQuote(body)); }
      } else if (!quoteId) {
        const body = { divisionId: divisionId || undefined, companyId: companyId || undefined, companyName: freeCompanyName || undefined, currencyCode, documentNo: documentNo.trim() || undefined, contractNo: documentNo.trim() || undefined, issueDate: date, signedDate: date, headerDiscountPercent: num(discount), headerDiscountAmount: num(discountAmount), paymentTerms: payment, deliveryTerms: delivery, warrantyTerms: warranty, notes, items: quoteItems };
        const schema = kind === 'proforma' ? (id ? standaloneProformaUpdateSchema : standaloneProformaCreateSchema) : (id ? standaloneContractUpdateSchema : standaloneContractCreateSchema);
        const parsed = schema.parse(body);
        saved = await save.mutateAsync(() => commercialApi.saveStandalone(kind, parsed, id || undefined));
      } else {
        if (!quoteId || !source.data) throw new Error('Önce bağlı teklifi seçin.');
        const body = { quoteId, documentNo: documentNo.trim() || undefined, contractNo: documentNo.trim() || undefined, issueDate: date, signedDate: date, headerDiscountPercent: num(discount), headerDiscountAmount: num(discountAmount), terms, items: lines.map((line) => ({ quoteItemId: line.id, unitPrice: num(line.unitPrice), discountAmount: num(line.discountAmount) })) };
        if (kind === 'proforma') { const parsed = proformaCreateSchema.parse(body); saved = await save.mutateAsync(() => id ? commercialApi.updateProforma(id, parsed) : commercialApi.createProforma(parsed)); }
        else { const parsed = contractCreateSchema.parse(body); saved = await save.mutateAsync(() => id ? commercialApi.updateContract(id, parsed) : commercialApi.createContract(parsed)); }
      }
      router.replace((kind === 'quote' ? `/modules/quotes/${saved.id}` : `/modules/documents/${kind}/${saved.id}`) as Href);
    } catch (cause) {
      const validation = cause as { issues?: Array<{ path: Array<string | number>; message: string }> };
      setError(validation.issues?.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n') ?? (cause instanceof Error ? cause.message : 'Taslak kaydedilemedi.'));
    }
  }
  return <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
    <Stack.Screen options={{ title: `${names[kind]} ${id ? 'Düzenle' : 'Taslağı'}` }} />
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
        <Text className="font-inter text-sm text-muted-foreground">Taslak CRM’ye kaydedilir. Toplamlar ve fiyat kuralları sunucuda doğrulanır. PDF webde hazırlanır.</Text>
        {locked ? <Card><Text className="font-inter text-destructive">Bu belge kesinleşmiş veya onaylanmış. Düzenleme kilitli; webden revizyon oluşturun.</Text></Card> : <>
          <Card className="gap-3">
            <Text className="font-inter-semibold text-base text-foreground">1. Belge bilgileri</Text>
            {kind === 'quote' ? <>
              <Button label={opportunity.data?.title ?? 'Fırsat Seç (zorunlu)'} variant="ghost" disabled={Boolean(id) || !canReadOpportunities}
                onPress={() => { setSearch(''); setPicker('opportunity'); }} />
              {readiness.error ? <ErrorState message={readiness.error.message} onRetry={() => void readiness.refetch()} /> : null}
              {readiness.data && !readiness.data.ready ? <Text accessibilityRole="alert" className="font-inter text-sm text-warning">{readiness.data.blockers.map((blocker) => blocker.label).join(' · ')}. Fırsat kaydını tamamlayıp tekrar deneyin.</Text> : null}
            </> : null}
            {(kind === 'quote' || !quoteId) && !id ? <View className="gap-2"><Text className="font-inter-medium text-sm text-foreground">Bölüm</Text>
              {(user?.divisions ?? []).map((division) => <Button key={division.id} label={`${divisionId === division.id ? '✓ ' : ''}${division.name}`}
                variant={divisionId === division.id ? 'primary' : 'ghost'} onPress={() => setDivisionId(division.id)} />)}
            </View> : null}
            {kind !== 'quote' && !id ? <Button label={quoteId ? 'Kaynak Teklifi Değiştir' : 'Tekliften Türet (isteğe bağlı)'} variant="ghost" onPress={() => { setSearch(''); setPicker('quote'); }} /> : null}
            {kind !== 'quote' && !quoteId && !companyId ? <Field label="Firma unvanı (kayıtlı firma yoksa)" value={freeCompanyName} onChangeText={setFreeCompanyName} maxLength={255} /> : null}
            {kind === 'quote' || !quoteId ? <Button label={companyName || 'Firma Seç'} variant="ghost" disabled={kind === 'quote' && Boolean(opportunityId)} onPress={() => { setSearch(''); setPicker('company'); }} /> : <Button label={source.data?.documentNo ?? 'Kaynak Teklif Seç'} variant="ghost" disabled={Boolean(id)} onPress={() => { setSearch(''); setPicker('quote'); }} />}
            {kind === 'quote' && companyRecord.data?.addresses.length ? <View className="gap-2"><Text className="font-inter-medium text-sm text-foreground">Firma Adresi</Text>{companyRecord.data.addresses.map((address) => <Button key={address.id} label={`${companyAddressId === address.id ? '✓ ' : ''}${address.fullAddress ?? [address.province, address.district, address.street].filter(Boolean).join(' · ')}`} variant={companyAddressId === address.id ? 'primary' : 'ghost'} onPress={() => setCompanyAddressId(address.id)} />)}</View> : null}
            {kind === 'quote' && contactOptions.data?.items.length ? <View className="gap-2"><Text className="font-inter-medium text-sm text-foreground">Firma Yetkilisi</Text>{contactOptions.data.items.map((contact) => <Button key={contact.id} label={`${contactId === contact.id ? '✓ ' : ''}${contact.fullName}`} variant={contactId === contact.id ? 'primary' : 'ghost'} onPress={() => setContactId(contact.id)} />)}{contactOptions.hasNextPage ? <Button label="Diğer Yetkililer" variant="ghost" onPress={() => void contactOptions.fetchNextPage()} /> : null}</View> : null}
            <Field label="Belge numarası (boşsa otomatik)" value={documentNo} onChangeText={setDocumentNo} maxLength={64} />
            <Field label="Belge tarihi (YYYY-AA-GG)" value={date} onChangeText={setDate} maxLength={10} />
            {kind === 'quote' || !quoteId ? <>{kind === 'quote' ? <Field label="Geçerlilik (gün)" value={validity} onChangeText={setValidity} keyboardType="number-pad" /> : null}<View className="flex-row flex-wrap gap-2">{(currencies.data ?? []).map((currency) => <Button key={currency.id} label={currency.code} variant={currencyCode === currency.code ? 'primary' : 'ghost'} onPress={() => setCurrencyCode(currency.code)} />)}</View></> : <Text className="font-inter text-sm text-muted-foreground">Para birimi: {currencyCode} · Ürün ve miktarlar kaynak tekliften devralınır.</Text>}
          </Card>
          {picker ? <Card className="gap-3"><SearchBar value={search} onChange={setSearch} placeholder={picker === 'company' ? 'Firma ara' : picker === 'quote' ? 'Teklif ara' : picker === 'opportunity' ? 'Fırsat ara' : 'Ürün ara'} />
            {picker === 'opportunity' ? <>{opportunityList.error ? <ErrorState message={opportunityList.error.message} onRetry={() => void opportunityList.refetch()} /> : opportunityList.data?.items.map((item) => <Button key={item.id} label={item.title} variant="ghost" onPress={() => { setOpportunityId(item.id); setPicker(null); }} />)}{opportunityList.hasNextPage ? <Button label="Daha Fazla Fırsat" variant="ghost" onPress={() => void opportunityList.fetchNextPage()} /> : null}</> : picker === 'company' ? <>{companyList.error ? <ErrorState message={companyList.error.message} onRetry={() => void companyList.refetch()} /> : companyList.data?.items.map((company) => <Button key={company.id} label={company.shortName ?? company.legalTitle} variant="ghost" onPress={() => { setCompanyId(company.id); setCompanyAddressId(''); setContactId(''); setCompanyName(company.shortName ?? company.legalTitle); setPicker(null); }} />)}{companyList.hasNextPage ? <Button label="Daha Fazla Firma" variant="ghost" onPress={() => void companyList.fetchNextPage()} /> : null}</> : picker === 'quote' ? <>{quoteList.error ? <ErrorState message={quoteList.error.message} onRetry={() => void quoteList.refetch()} /> : quoteList.data?.items.map((quote) => <Button key={quote.id} label={`${quote.documentNo} · ${quote.company?.shortName ?? quote.company?.legalTitle ?? ''}`} variant="ghost" onPress={() => { setQuoteId(quote.id); setPicker(null); }} />)}{quoteList.hasNextPage ? <Button label="Daha Fazla Teklif" variant="ghost" onPress={() => void quoteList.fetchNextPage()} /> : null}</> : <>{productList.error ? <ErrorState message={productList.error.message} onRetry={() => void productList.refetch()} /> : productList.data?.items.map((product) => <Button key={product.id} label={`${product.modelCode} · ${product.fullName}`} variant="ghost" onPress={() => selectProduct(product)} />)}{productList.hasNextPage ? <Button label="Daha Fazla Ürün" variant="ghost" onPress={() => void productList.fetchNextPage()} /> : null}</>}
            <Button label="Seçimi Kapat" variant="ghost" onPress={() => setPicker(null)} />
          </Card> : null}
          <Text className="font-inter-semibold text-base text-foreground">2. Kalemler ({lines.length})</Text>
          {source.error ? <ErrorState message={source.error.message} onRetry={() => void source.refetch()} /> : null}
          {lines.map((line, index) => <Card key={line.id ?? index} className="gap-3">
            <Field label={`${index + 1}. Ürün / açıklama`} value={line.description} onChangeText={(description) => patchLine(index, { description })} editable={kind === 'quote' || !quoteId} maxLength={2000} />
            <View className="flex-row gap-3"><View className="flex-1"><Field label="Miktar" value={line.quantity} onChangeText={(quantity) => patchLine(index, { quantity })} keyboardType="decimal-pad" editable={kind === 'quote' || !quoteId} /></View><View className="flex-1"><Field label={`Birim fiyat (${currencyCode})`} value={line.unitPrice} onChangeText={(unitPrice) => patchLine(index, { unitPrice })} keyboardType="decimal-pad" /></View></View>
            <Field label="Satır iskontosu (tutar)" value={line.discountAmount} onChangeText={(discountAmount) => patchLine(index, { discountAmount })} keyboardType="decimal-pad" />
            {kind === 'quote' || !quoteId ? <><View className="flex-row flex-wrap gap-2">{(units.data ?? []).map((unit) => <Button key={unit.id} label={unit.name} variant={line.unitCode === unit.code ? 'primary' : 'ghost'} onPress={() => patchLine(index, { unitCode: unit.code })} />)}</View><Field label="KDV (%)" value={line.vatRate} onChangeText={(vatRate) => patchLine(index, { vatRate })} keyboardType="decimal-pad" />
              {kind === 'quote' && line.productModelId ? <Button label="Ürün Konfigürasyonu" variant="ghost" onPress={() => setOptionLine(optionLine === index ? null : index)} /> : null}
              {optionLine === index ? <>{options.isPending ? <Loading /> : options.error ? <ErrorState message={options.error.message} onRetry={() => void options.refetch()} /> : options.data?.map((set) => <View key={set.id} className="gap-2"><Text className="font-inter-medium text-sm text-foreground">{set.name}</Text>{set.values.map((value) => { const selected = line.compatibility?.selectedProductOptions?.some((option) => option.optionSetId === set.id && option.optionValueId === value.id); return <Button key={value.id} label={`${selected ? '✓ ' : ''}${value.name} (${value.priceDelta ?? 'Fiyat tanımsız'} ${value.currencyCode ?? ''})`} variant={selected ? 'primary' : 'ghost'} disabled={value.priceDelta == null} onPress={() => {
                const compatibility: QuoteItemCompatibility = line.compatibility ?? { machineIds: [], brands: [], controlUnits: [], supplierIds: [], technicalSpecs: [] };
                const rest = compatibility.selectedProductOptions?.filter((option) => option.optionSetId !== set.id) ?? [];
                patchLine(index, { compatibility: { ...compatibility, selectedProductOptions: selected ? rest : [...rest, { optionSetId: set.id, optionValueId: value.id, name: set.name, value: value.name, priceDelta: Number(value.priceDelta ?? 0), currencyCode: value.currencyCode ?? '' }] } });
              }} />; })}</View>)}</> : null}
              <Button label="Kalemi Kaldır" variant="ghost" onPress={() => setLines((previous) => previous.filter((_, at) => at !== index))} />
            </> : null}
          </Card>)}
          {kind === 'quote' || !quoteId ? <View className="gap-2"><Button label="Katalogdan Ürün Ekle" variant="ghost" onPress={() => { setSearch(''); setPicker('product'); }} /><Button label="Serbest Kalem Ekle" variant="ghost" onPress={() => setLines((previous) => [...previous, blank()])} /></View> : null}
          <Card className="gap-3"><Text className="font-inter-semibold text-base text-foreground">3. İskonto ve şartlar</Text>
            <Field label="Genel iskonto (%)" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" />
            <Field label={`Genel iskonto tutarı (${currencyCode})`} value={discountAmount} onChangeText={setDiscountAmount} keyboardType="decimal-pad" />
            <Text className="font-inter text-xs text-muted-foreground">Yüzde sıfırdan büyükse tutar yerine yüzde uygulanır. Para birimi değişimi satır fiyatlarını dönüştürmez.</Text>
            <Field label="Ödeme şartları" value={payment} onChangeText={setPayment} multiline maxLength={2000} />
            <Field label="Teslimat şartları" value={delivery} onChangeText={setDelivery} multiline maxLength={2000} />
            <Field label="Garanti şartları" value={warranty} onChangeText={setWarranty} multiline maxLength={2000} />
            {kind === 'quote' || !quoteId ? <Field label="Notlar" value={notes} onChangeText={setNotes} multiline maxLength={4000} /> : null}
          </Card>
          {error ? <Text accessibilityRole="alert" className="font-inter text-sm text-destructive">{error}
Girdileriniz korunuyor; düzeltip tekrar kaydedebilirsiniz.</Text> : null}
          <Button label="Taslağı Kaydet" loading={save.isPending} disabled={!lines.length || save.isPending || (kind === 'quote' ? !companyId || !opportunityId || !readiness.data?.ready : quoteId ? !source.data : !companyId && !freeCompanyName.trim())} onPress={() => void submit()} />
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
