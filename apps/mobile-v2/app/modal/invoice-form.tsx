import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCan } from '@/src/auth/AuthProvider';
import { useCompany } from '@/src/api/companies.hooks';
import { useLookup } from '@/src/api/crm.hooks';
import {
  useAccountingInvoice,
  useCreateAccountingInvoice,
  usePaymentTermSuggestion,
  useUpdateAccountingInvoice,
} from '@/src/api/finance.hooks';
import { useAllInventory, usePurchaseOrder } from '@/src/api/inventory.hooks';
import { useAllProducts } from '@/src/api/products.hooks';
import { formatAmount } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Chip, ErrorState, Eyebrow, Field, Loading } from '@/src/ui';
import { IncotermSelect } from '@/src/ui/select/fields';
import { toast } from '@/src/ui/toast';
import { CompanyPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { AmountLine, DateInputField, FormScreen, Segmented } from '@/src/ui/finance/kit';
import {
  INVOICE_CURRENCIES,
  VAT_RATE_OPTIONS,
  addDaysToDateInput,
  blankInvoiceLine,
  buildInvoicePayload,
  defaultInvoiceForm,
  gridTotals,
  invoiceLineTotals,
  invoicePrefillFromDetail,
  invoiceTotals,
  isValidLine,
  parseMoneyInput,
  previewInstallments,
  purchaseInvoicePrefill,
  retargetLines,
  roundMoney,
  validateInvoice,
  vatAmountFromRate,
  type InvoiceCategory,
  type InvoiceForm,
  type InvoiceLineForm,
  type InvoiceType,
} from '@/src/ui/finance/invoice-logic';

const CATEGORY_OPTIONS = [
  { value: 'commercial', label: 'Ticari' },
  { value: 'administrative', label: 'İdari' },
] as const;
const TYPE_OPTIONS = [
  { value: 'sales', label: 'Satış Faturası' },
  { value: 'purchase', label: 'Alış Faturası' },
] as const;
const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Peşin' },
  { value: 'leasing', label: 'Leasing' },
  { value: 'term', label: 'Vadeli' },
] as const;
const CURRENCY_OPTIONS = INVOICE_CURRENCIES.map((code) => ({ value: code, label: code === 'TRY' ? 'TL' : code }));
const VAT_OPTIONS = VAT_RATE_OPTIONS.map((rate) => ({ value: rate, label: `%${rate}` }));

const priceInput = (value: string | null | undefined) => (value == null || value === '' ? '' : String(Number(value)));

/** Web `CreateAccountingInvoiceDialog`: "Muhasebe Faturası" / "Faturayı Düzenle" / siparişten "Alış Faturası". */
export default function InvoiceFormScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; purchaseOrderId?: string; companyId?: string }>();
  const id = params.id ?? '';
  const purchaseOrderId = params.purchaseOrderId ?? '';
  const isEditing = Boolean(id);
  const gridVisible = !isEditing;
  const canCreate = useCan('accounting_invoices.create');
  const canUpdate = useCan('accounting_invoices.update');

  const detail = useAccountingInvoice(id);
  const purchase = usePurchaseOrder(purchaseOrderId);
  const currencies = useLookup('currencies');
  const products = useAllProducts(gridVisible);
  const stock = useAllInventory();
  const create = useCreateAccountingInvoice();
  const update = useUpdateAccountingInvoice(id);

  const [form, setForm] = useState<InvoiceForm>(() => defaultInvoiceForm(params.companyId ?? ''));
  const [lines, setLines] = useState<InvoiceLineForm[]>(() => [blankInvoiceLine('commercial')]);
  const [company, setCompany] = useState<PickedRecord | null>(null);
  const [termTouched, setTermTouched] = useState(false);
  const [hydrated, setHydrated] = useState(!isEditing && !purchaseOrderId);
  const [saving, setSaving] = useState(false);
  const companyQuery = useCompany(company ? '' : form.companyId);

  useEffect(() => {
    if (hydrated) return;
    if (isEditing && detail.data) {
      const prefill = invoicePrefillFromDetail(detail.data);
      setForm(prefill.form);
      setLines(prefill.lines);
      const owner = detail.data.company;
      if (owner) setCompany({ id: owner.id, name: owner.shortName || owner.legalTitle });
      setTermTouched(true);
      setHydrated(true);
    } else if (purchaseOrderId && purchase.data && !currencies.isPending) {
      const currencyCode = currencies.data?.find((row) => row.id === purchase.data.currencyId)?.code ?? 'USD';
      const prefill = purchaseInvoicePrefill({ ...purchase.data, currencyCode });
      setForm(prefill.form);
      setLines(prefill.lines);
      setTermTouched(true);
      setHydrated(true);
    }
  }, [currencies.data, currencies.isPending, detail.data, hydrated, isEditing, purchase.data, purchaseOrderId]);

  useEffect(() => {
    if (!company && companyQuery.data) {
      setCompany({ id: companyQuery.data.id, name: companyQuery.data.shortName || companyQuery.data.legalTitle });
    }
  }, [company, companyQuery.data]);

  const suggestion = usePaymentTermSuggestion(!isEditing && form.type === 'sales' ? form.companyId : '');
  const contractHint =
    suggestion.data?.source === 'contract' && suggestion.data.paymentTermDays != null
      ? `Vade sözleşmeden alındı${suggestion.data.contractNo ? ` (${suggestion.data.contractNo})` : ''}: ${suggestion.data.paymentTermDays} gün`
      : null;
  useEffect(() => {
    const days = suggestion.data?.paymentTermDays;
    if (termTouched || suggestion.data?.source !== 'contract' || days == null) return;
    setForm((current) => ({
      ...current,
      paymentType: 'term',
      paymentTermDays: String(days),
      firstDueDate: addDaysToDateInput(current.invoiceDate, days),
    }));
  }, [suggestion.data, termTouched]);

  const totalsFromGrid = gridTotals(lines);
  const gridDrivesTotals = gridVisible && lines.some(isValidLine);
  useEffect(() => {
    if (!gridDrivesTotals) return;
    const amount = String(roundMoney(totalsFromGrid.subtotal));
    const vatAmount = String(roundMoney(totalsFromGrid.vat));
    setForm((current) => (current.amount === amount && current.vatAmount === vatAmount ? current : { ...current, amount, vatAmount }));
  }, [gridDrivesTotals, totalsFromGrid.subtotal, totalsFromGrid.vat]);

  const totals = invoiceTotals(form);
  const installments = useMemo(
    () => previewInstallments(totals.grandTotal, form),
    [form, totals.grandTotal],
  );

  const isAdministrative = form.invoiceCategory === 'administrative';
  const availableTezgah = useMemo(
    () =>
      (stock.data ?? []).filter((row) => {
        if ((row.category?.code ?? 'TEZGAH') !== 'TEZGAH') return false;
        if (row.status?.code === 'available') return true;
        return row.status?.code === 'reserved' && row.reservedCompanyId === form.companyId;
      }),
    [form.companyId, stock.data],
  );
  const sourceOptions = useMemo(() => {
    const options = [{ value: '__none', label: 'Ürün seçmeden', hint: undefined as string | undefined }];
    if (form.type === 'sales') {
      for (const row of availableTezgah) {
        options.push({
          value: `inv:${row.id}`,
          label: `${row.serialNumber} · ${row.brand?.name ?? ''} ${row.product?.modelCode ?? ''}`.trim(),
          hint: `Stok / Tezgah · ${row.status?.code === 'reserved' ? 'rezerve' : 'hazır'}`,
        });
      }
    }
    for (const product of products.data ?? []) {
      options.push({
        value: `prod:${product.id}`,
        label: product.fullName || product.modelCode,
        hint: [product.brand?.name, product.modelCode].filter(Boolean).join(' · '),
      });
    }
    return options;
  }, [availableTezgah, form.type, products.data]);
  const stockSummary = useMemo(() => {
    const rows = stock.data ?? [];
    return {
      ready: rows.filter((row) => row.status?.code === 'available').length,
      reserved: rows.filter((row) => row.status?.code === 'reserved').length,
      tezgah: rows.filter((row) => (row.category?.code ?? 'TEZGAH') === 'TEZGAH').length,
      products: products.data?.length ?? 0,
    };
  }, [products.data, stock.data]);

  if (isEditing ? !canUpdate : !canCreate) return <Redirect href={'/modules/invoices' as Href} />;

  const set = <K extends keyof InvoiceForm>(key: K, value: InvoiceForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const updateLine = (lineId: string, patch: Partial<InvoiceLineForm>) =>
    setLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));

  function setCategory(category: InvoiceCategory) {
    if (isEditing) return;
    setForm((current) => ({ ...current, invoiceCategory: category, incoterm: category === 'administrative' ? '' : current.incoterm }));
    setLines((current) => retargetLines(current, form.type, category));
  }

  function setType(type: InvoiceType) {
    if (isEditing) return;
    setForm((current) => ({ ...current, type }));
    setLines((current) => retargetLines(current, type, form.invoiceCategory));
  }

  function lineSource(line: InvoiceLineForm) {
    if (line.kind === 'stock' && line.inventoryItemId) return `inv:${line.inventoryItemId}`;
    if (line.productModelId) return `prod:${line.productModelId}`;
    return '__none';
  }

  function changeSource(line: InvoiceLineForm, value: string | null) {
    if (!value || value === '__none') {
      updateLine(line.id, { kind: 'product', productModelId: '', inventoryItemId: undefined, categoryCode: '' });
      return;
    }
    if (value.startsWith('inv:')) {
      const item = availableTezgah.find((row) => row.id === value.slice(4));
      updateLine(line.id, {
        kind: 'stock',
        inventoryItemId: value.slice(4),
        productModelId: '',
        categoryCode: 'TEZGAH',
        quantity: '1',
        description: item ? `${item.brand?.name ?? ''} ${item.product?.modelCode ?? ''} — ${item.serialNumber}`.trim() : line.description,
      });
      return;
    }
    const product = products.data?.find((row) => row.id === value.slice(5));
    updateLine(line.id, {
      kind: 'product',
      inventoryItemId: undefined,
      productModelId: value.slice(5),
      description: product ? product.fullName || line.description : line.description,
      listPrice: priceInput(product?.listPrice) || line.listPrice,
      unitPrice: priceInput(product?.cashPrice ?? product?.listPrice) || line.unitPrice,
      vatRate: priceInput(product?.vatRate) || line.vatRate,
    });
  }

  function changeTermDays(value: string) {
    const days = value.trim() ? Math.max(0, Math.trunc(parseMoneyInput(value))) : null;
    setTermTouched(true);
    setForm((current) => ({
      ...current,
      paymentType: value.trim() ? 'term' : current.paymentType,
      paymentTermDays: value,
      firstDueDate: days === null ? current.firstDueDate : addDaysToDateInput(current.invoiceDate, days),
    }));
  }

  async function submit() {
    const result = validateInvoice(form, lines, gridVisible);
    if (!result.ok) {
      toast.error(result.description ? `${result.title}: ${result.description}` : result.title);
      return;
    }
    if (!form.invoiceNo.trim()) {
      toast.error('Fatura No zorunludur');
      return;
    }
    const payload = buildInvoicePayload({ form, lines, installments, gridVisible, isEditing });
    setSaving(true);
    try {
      if (isEditing) {
        const { lineItems: _lines, ...body } = payload;
        await update.mutateAsync(body);
        toast.success('Fatura güncellendi');
        router.back();
      } else {
        const created = await create.mutateAsync(payload);
        toast.success(form.type === 'sales' ? 'Satış faturası oluşturuldu' : 'Alış faturası oluşturuldu');
        router.replace(`/modules/invoices/${created.id}` as Href);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      toast.error(`${isEditing ? 'Fatura güncellenemedi' : 'Fatura oluşturulamadı'}${message ? `: ${message}` : ''}`);
    } finally {
      setSaving(false);
    }
  }

  const title = isEditing ? 'Faturayı Düzenle' : 'Muhasebe Faturası';
  const loadError = (isEditing ? detail.error : purchaseOrderId ? purchase.error : null) ?? null;
  if (!hydrated) {
    return (
      <FormScreen title={title}>
        {loadError ? (
          <ErrorState message={loadError.message} onRetry={() => void (isEditing ? detail.refetch() : purchase.refetch())} />
        ) : (
          <Loading />
        )}
      </FormScreen>
    );
  }

  const currency = form.currencyCode;

  return (
    <FormScreen title={title} submitLabel={isEditing ? 'Kaydet' : 'Faturayı Kaydet'} onSubmit={() => void submit()} submitting={saving}>
      <Segmented label="Fatura Sınıfı" value={form.invoiceCategory} options={CATEGORY_OPTIONS} onChange={setCategory} />
      <Segmented label="Fatura Yönü" value={form.type} options={TYPE_OPTIONS} onChange={setType} />
      {isEditing ? (
        <Text className="font-inter text-xs text-muted-foreground">Düzenlemede fatura sınıfı, yönü ve kalemleri değiştirilemez.</Text>
      ) : null}
      <CompanyPicker
        label="Firma *"
        value={company}
        onChange={(next) => {
          setCompany(next);
          set('companyId', next?.id ?? '');
        }}
      />
      <Segmented
        label="Ödeme Tipi"
        value={form.paymentType}
        options={PAYMENT_OPTIONS}
        onChange={(value) => {
          setTermTouched(true);
          set('paymentType', value);
        }}
      />
      <Field label="Fatura No *" value={form.invoiceNo} onChangeText={(value) => set('invoiceNo', value)} autoCapitalize="characters" />
      <Field label="Sipariş No" value={form.orderNo} onChangeText={(value) => set('orderNo', value)} placeholder="Opsiyonel" />
      <Segmented label="Para Birimi" value={form.currencyCode} options={CURRENCY_OPTIONS} onChange={(value) => set('currencyCode', value)} />
      <DateInputField label="Fatura Tarihi" value={form.invoiceDate} clearable={false} onChange={(value) => set('invoiceDate', value)} />
      <DateInputField label="Beklenen Tarih" value={form.expectedDate} onChange={(value) => set('expectedDate', value)} />
      <View className="flex-row gap-3">
        <View className="flex-1 gap-1">
          <Field label="Yeni Vade (Gün)" keyboardType="number-pad" value={form.paymentTermDays} onChangeText={changeTermDays} placeholder="0" />
        </View>
        <View className="flex-1">
          <Field
            label="Önceki Vade (Gün)"
            keyboardType="number-pad"
            value={form.previousPaymentTermDays}
            onChangeText={(value) => set('previousPaymentTermDays', value)}
            placeholder="Opsiyonel"
          />
        </View>
      </View>
      {contractHint ? <Text className="font-inter text-xs text-primary">{contractHint}</Text> : null}
      {!isAdministrative ? (
        <IncotermSelect value={form.incoterm} onChange={(value) => set('incoterm', value)} />
      ) : null}
      <Field label="Referans" value={form.shipmentReference} onChangeText={(value) => set('shipmentReference', value)} placeholder="İrsaliye / talep no" />
      <Field label="Vade Notu" value={form.termChangeReason} onChangeText={(value) => set('termChangeReason', value)} placeholder="Opsiyonel" />

      <Card className="gap-3">
        <Field
          label="Matrah"
          keyboardType="decimal-pad"
          editable={!gridDrivesTotals}
          value={form.amount}
          onChangeText={(value) => setForm((current) => ({ ...current, amount: value, vatAmount: String(vatAmountFromRate(value, current.vatRate)) }))}
        />
        <Segmented
          label="KDV Oranı"
          value={form.vatRate}
          options={VAT_OPTIONS.some((option) => option.value === form.vatRate) ? VAT_OPTIONS : [{ value: form.vatRate, label: `%${form.vatRate}` }, ...VAT_OPTIONS]}
          onChange={(value) => {
            if (gridDrivesTotals) return;
            setForm((current) => ({ ...current, vatRate: value, vatAmount: String(vatAmountFromRate(current.amount, value)) }));
          }}
        />
        <Field
          label="KDV Tutarı"
          keyboardType="decimal-pad"
          editable={!gridDrivesTotals}
          value={form.vatAmount}
          onChangeText={(value) => set('vatAmount', value)}
        />
        <AmountLine label="Genel Toplam" value={formatAmount(totals.grandTotal, currency)} tone="info" />
      </Card>

      {gridVisible ? (
        <View className="gap-3">
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Eyebrow>Fatura Kalemleri</Eyebrow>
            {!isAdministrative ? (
              <>
                <Chip label={`Hazır ${stockSummary.ready}`} tone="neutral" />
                <Chip label={`Rezerve ${stockSummary.reserved}`} tone="neutral" />
                <Chip label={`Tezgah ${stockSummary.tezgah}`} tone="neutral" />
                <Chip label={`Katalog ${stockSummary.products}`} tone="neutral" />
              </>
            ) : null}
          </View>
          {lines.map((line, index) => (
            <Card key={line.id} className="gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="font-inter-semibold text-sm text-foreground">Kalem {index + 1}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Fatura kalemi ${index + 1} satırını sil`}
                  onPress={() =>
                    setLines((current) => {
                      const next = current.filter((row) => row.id !== line.id);
                      return next.length ? next : [blankInvoiceLine(form.invoiceCategory)];
                    })
                  }
                  className="h-11 w-11 items-center justify-center active:opacity-60"
                >
                  <Ionicons name="trash-outline" size={19} color={colors.destructive} />
                </Pressable>
              </View>
              {isAdministrative ? (
                <Field
                  label="Gider Türü"
                  maxLength={64}
                  value={line.categoryCode}
                  onChangeText={(value) => updateLine(line.id, { categoryCode: value })}
                  placeholder="Ofis, bakım, hizmet..."
                />
              ) : (
                <OptionPicker
                  label={form.type === 'sales' ? 'Ürün / Stok' : 'Ürün'}
                  value={lineSource(line)}
                  options={sourceOptions}
                  placeholder="Ürün seç"
                  searchable
                  onChange={(value) => changeSource(line, value)}
                />
              )}
              <Field
                label="Açıklama"
                value={line.description}
                onChangeText={(value) => updateLine(line.id, { description: value })}
                placeholder="Kalem açıklaması"
              />
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Field
                    label="Adet"
                    keyboardType="decimal-pad"
                    editable={line.kind !== 'stock'}
                    value={line.quantity}
                    onChangeText={(value) => updateLine(line.id, { quantity: value })}
                  />
                </View>
                <View className="flex-1">
                  <Field label="İndirim" keyboardType="decimal-pad" value={line.discountAmount} onChangeText={(value) => updateLine(line.id, { discountAmount: value })} />
                </View>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Field label="Liste Fiyatı" keyboardType="decimal-pad" value={line.listPrice} onChangeText={(value) => updateLine(line.id, { listPrice: value })} placeholder="0" />
                </View>
                <View className="flex-1">
                  <Field label="Olur Fiyatı" keyboardType="decimal-pad" value={line.unitPrice} onChangeText={(value) => updateLine(line.id, { unitPrice: value })} placeholder="0" />
                </View>
              </View>
              <Segmented
                label="KDV"
                value={line.vatRate}
                options={VAT_OPTIONS.some((option) => option.value === line.vatRate) ? VAT_OPTIONS : [{ value: line.vatRate, label: `%${line.vatRate}` }, ...VAT_OPTIONS]}
                onChange={(value) => updateLine(line.id, { vatRate: value })}
              />
              <AmountLine label="Son Tutar" value={formatAmount(invoiceLineTotals(line).total, currency)} />
            </Card>
          ))}
          <Button label="Kalem Ekle" variant="ghost" onPress={() => setLines((current) => [...current, blankInvoiceLine(form.invoiceCategory)])} />
          <Card className="gap-0">
            <Text className="pb-1 font-inter text-xs text-muted-foreground">
              {lines.length} kalem
              {form.type === 'sales' && !isAdministrative
                ? ' · tezgah satışında seri no zorunludur; fatura kaydında stok düşülür ve kurulum açılır'
                : ''}
            </Text>
            <AmountLine label="Ara Toplam" value={formatAmount(totalsFromGrid.subtotal, currency)} />
            <AmountLine label="İndirim" value={formatAmount(totalsFromGrid.discount, currency)} />
            <AmountLine label="KDV" value={formatAmount(totalsFromGrid.vat, currency)} />
            <AmountLine label="Son Tutar" value={formatAmount(totalsFromGrid.total, currency)} tone="info" />
          </Card>
        </View>
      ) : null}

      <Card className="gap-3">
        <Eyebrow>Vade Planı</Eyebrow>
        <DateInputField
          label="İlk Vade"
          value={form.firstDueDate}
          onChange={(value) => {
            setTermTouched(true);
            set('firstDueDate', value);
          }}
        />
        <DateInputField label="Son Vade" value={form.lastDueDate} onChange={(value) => set('lastDueDate', value)} />
        <Field label="Vade Sayısı" keyboardType="number-pad" value={form.installmentCount} onChangeText={(value) => set('installmentCount', value)} />
        {installments.map((row) => (
          <AmountLine key={row.installmentNo} label={`${row.installmentNo}. vade · ${row.dueDate}`} value={formatAmount(row.amount, currency)} />
        ))}
      </Card>

      <Field
        label="Notlar"
        value={form.notes}
        onChangeText={(value) => set('notes', value)}
        multiline
        numberOfLines={3}
        style={{ minHeight: 88, textAlignVertical: 'top', paddingTop: 12 }}
      />
    </FormScreen>
  );
}
