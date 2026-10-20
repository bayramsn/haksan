import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import type { ContractInstallmentInput, FreeItemInput } from '@/src/api/commercial-docs.api';
import {
  useCreateStandaloneContract,
  useCreateStandaloneProforma,
  useUpdateStandaloneContract,
  useUpdateStandaloneProforma,
} from '@/src/api/commercial-docs.hooks';
import { useCommercialDocument } from '@/src/api/documents.hooks';
import type { CompanyListItem } from '@/src/api/endpoints';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { formatAmount } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Button, DetailSkeleton, ErrorState, Eyebrow, Field, SubtleCard } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import {
  DocumentDiscountFields,
  DocumentTermsFields,
  DocumentTotalsCard,
  emptyContractTermsMeta,
  parseDeliveryDays,
  type ContractTermsMeta,
} from './DocumentFormParts';
import {
  computeDocumentTotals,
  emptyQuickParty,
  hasDocumentDiscount,
  quickItemsError,
  quickItemsFromSnapshot,
  quickPartyError,
  quickPartyFromSnapshot,
  quickPartyPayload,
  type QuickParty,
} from './document-logic';
import { ChoiceChips, CompanyPickerSheet, ModalForm, PickerField } from './pickers';
import { formatDay, parseDay, parseDecimal } from './quote-logic';
import { DateTextField } from '@/src/ui/select/DateTextField';
import {
  BrandSelect,
  ContactSelect,
  CountrySelect,
  LookupSelect,
  ProductSelect,
  TaxOfficeSelect,
  contactPhone,
  productLabel,
} from '@/src/ui/select/fields';

type Kind = 'proforma' | 'contract';

type FreeItemDraft = {
  key: string;
  description: string;
  quantity: string;
  unitCode: string;
  unitPrice: string;
  discountAmount: string;
  vatRate: string;
  brand: string;
  model: string;
  originCountry: string;
  hsCode: string;
  detailOpen: boolean;
};

const CURRENCIES = ['USD', 'EUR', 'TRY'] as const;

const INSTALLMENT_METHODS = [
  { value: 'cash', label: 'Nakit' },
  { value: 'wire_transfer', label: 'Havale' },
  { value: 'cheque', label: 'Çek' },
  { value: 'promissory_note', label: 'Senet' },
  { value: 'leasing', label: 'Leasing' },
  { value: 'letter_of_credit', label: 'Akreditif' },
] as const;

type InstallmentDraft = {
  key: string;
  label: string;
  amount: string;
  dueDate: string;
  paymentMethod: (typeof INSTALLMENT_METHODS)[number]['value'];
};

let installmentCounter = 0;
function emptyInstallment(): InstallmentDraft {
  installmentCounter += 1;
  return {
    key: `installment-${Date.now()}-${installmentCounter}`,
    label: '',
    amount: '',
    dueDate: '',
    paymentMethod: 'cash',
  };
}

let counter = 0;
function emptyFreeItem(): FreeItemDraft {
  counter += 1;
  return {
    key: `quick-item-${Date.now()}-${counter}`,
    description: '',
    quantity: '1',
    unitCode: 'adet',
    unitPrice: '',
    discountAmount: '',
    vatRate: '20',
    brand: '',
    model: '',
    originCountry: '',
    hsCode: '',
    detailOpen: false,
  };
}

const amountOrZero = (raw: string) => (raw.trim() ? parseDecimal(raw) : 0);

function toRows(items: FreeItemDraft[]) {
  return items.map((item) => ({
    quoteItemId: item.key,
    description: item.description,
    quantity: amountOrZero(item.quantity),
    unitCode: item.unitCode,
    unitPrice: amountOrZero(item.unitPrice),
    discountAmount: amountOrZero(item.discountAmount),
    vatRate: amountOrZero(item.vatRate),
  }));
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const str = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * Teklifsiz (hızlı) proforma / sözleşme — web QuickProformaDialog ve
 * QuickContractDialog. Kalemler ve şartlar doğrudan belgeye yazılır;
 * firma kayıtlı değilse unvan, adres ve vergi bilgileri elle girilir.
 */
export function QuickDocumentForm({ kind, documentId }: { kind: Kind; documentId?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { user, scope } = useAuth();
  const isEdit = Boolean(documentId);
  const canCreate = useCan(kind === 'proforma' ? 'proformas.create' : 'contracts.create');
  const canUpdate = useCan(kind === 'proforma' ? 'proformas.update' : 'contracts.update');
  const existing = useCommercialDocument(kind, documentId ?? '');
  const divisions = user?.divisions ?? [];
  const defaultDivisionId = scope.divisionId ?? divisions.find((d) => d.isPrimary)?.id ?? divisions[0]?.id ?? '';

  const createProforma = useCreateStandaloneProforma();
  const createContract = useCreateStandaloneContract();
  const updateProforma = useUpdateStandaloneProforma();
  const updateContract = useUpdateStandaloneContract();
  const busy = createProforma.isPending || createContract.isPending || updateProforma.isPending || updateContract.isPending;

  const [party, setParty] = useState<QuickParty>(emptyQuickParty());
  const [companyLabel, setCompanyLabel] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState(defaultDivisionId);
  const [documentNo, setDocumentNo] = useState('');
  const [date, setDate] = useState(formatDay(new Date()));
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [paymentTermDays, setPaymentTermDays] = useState('');
  const [items, setItems] = useState<FreeItemDraft[]>([emptyFreeItem()]);
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [payment, setPayment] = useState('');
  const [delivery, setDelivery] = useState('');
  const [warranty, setWarranty] = useState('');
  const [meta, setMeta] = useState<ContractTermsMeta>(emptyContractTermsMeta());
  const [installments, setInstallments] = useState<InstallmentDraft[]>([]);
  const [hydrated, setHydrated] = useState(!isEdit);
  const companySheet = useRef<BottomSheetModal>(null);

  const doc = existing.data as Record<string, unknown> | undefined;

  useEffect(() => {
    if (!isEdit || hydrated || !doc) return;
    const snapshot = record(doc.documentSnapshot);
    const loadedParty = quickPartyFromSnapshot(snapshot);
    setParty(loadedParty);
    setCompanyLabel(loadedParty.manualCompany ? null : loadedParty.companyName || str(doc.companyNameText) || null);
    setDivisionId(str(doc.divisionId) || defaultDivisionId);
    setDocumentNo(str(kind === 'contract' ? doc.contractNo : doc.documentNo));
    const day = str(kind === 'contract' ? doc.signedDate : doc.issueDate).slice(0, 10);
    if (day) setDate(day);
    setCurrencyCode(str(record(snapshot?.currency)?.code) || str(record(doc.currency)?.code) || 'USD');
    if (typeof doc.paymentTermDays === 'number') setPaymentTermDays(String(doc.paymentTermDays));
    const loadedItems = quickItemsFromSnapshot(snapshot).map((item) => ({
      ...emptyFreeItem(),
      description: item.description,
      quantity: String(item.quantity),
      unitCode: item.unitCode,
      unitPrice: String(item.unitPrice),
      discountAmount: item.discountAmount ? String(item.discountAmount) : '',
      vatRate: String(item.vatRate),
      brand: item.brand,
      model: item.model,
      originCountry: item.originCountry,
      hsCode: item.hsCode,
    }));
    setItems(loadedItems.length ? loadedItems : [emptyFreeItem()]);
    const header = record(snapshot?.quote) ?? {};
    const amount = Number(header.headerDiscountAmount ?? snapshot?.headerDiscountAmount ?? 0) || 0;
    const percent = Number(header.headerDiscountPercent ?? snapshot?.headerDiscountPercent ?? 0) || 0;
    setDiscountAmount(amount > 0 ? String(amount) : '');
    setDiscountPercent(percent > 0 ? String(percent) : '');
    const terms = record(snapshot?.terms) ?? record(doc.terms) ?? {};
    setPayment(str(terms.paymentTermsText));
    setDelivery(str(terms.deliveryTermsText));
    setWarranty(str(terms.warrantyTermsText));
    setMeta({
      importCostsExcluded: typeof terms.importCostsExcluded === 'boolean' ? terms.importCostsExcluded : true,
      vatIncluded: terms.vatIncluded === true,
      freightPaidBySeller: terms.freightPaidBySeller === true,
      deliveryLocation: str(terms.deliveryLocation),
      estimatedDeliveryDaysMin: typeof terms.estimatedDeliveryDaysMin === 'number' ? String(terms.estimatedDeliveryDaysMin) : '',
      estimatedDeliveryDaysMax: typeof terms.estimatedDeliveryDaysMax === 'number' ? String(terms.estimatedDeliveryDaysMax) : '',
    });
    const rawInstallments = Array.isArray(snapshot?.installments) ? snapshot.installments : [];
    setInstallments(
      rawInstallments
        .map((row) => record(row))
        .filter((row): row is Record<string, unknown> => Boolean(row))
        .map((row) => {
          const method = str(row.paymentMethod);
          const allowed = INSTALLMENT_METHODS.some((entry) => entry.value === method);
          return {
            ...emptyInstallment(),
            label: str(row.label),
            amount: row.amount != null ? String(row.amount) : '',
            dueDate: str(row.dueDate).slice(0, 10),
            paymentMethod: (allowed ? method : 'cash') as InstallmentDraft['paymentMethod'],
          };
        })
    );
    setHydrated(true);
  }, [defaultDivisionId, doc, hydrated, isEdit, kind]);

  const rows = useMemo(() => toRows(items), [items]);
  const documentDiscount = { amount: amountOrZero(discountAmount), percent: amountOrZero(discountPercent) };
  const totals = computeDocumentTotals(
    rows.map((row) => ({
      ...row,
      quantity: Number.isFinite(row.quantity) ? row.quantity : 0,
      unitPrice: Number.isFinite(row.unitPrice) ? row.unitPrice : 0,
      discountAmount: Number.isFinite(row.discountAmount) ? row.discountAmount : 0,
      vatRate: Number.isFinite(row.vatRate) ? row.vatRate : 0,
    })),
    {
      quoteDiscountTotal: 0,
      headerDiscountAmount: 0,
      customsTotal: 0,
      documentDiscount: Number.isFinite(documentDiscount.amount) && Number.isFinite(documentDiscount.percent) ? documentDiscount : null,
    }
  );

  if (isEdit ? !canUpdate : !canCreate) return <Redirect href="/(tabs)/modules/documents" />;

  const label = kind === 'proforma' ? 'Proforma' : 'Sözleşme';
  const title = isEdit ? `Hızlı ${kind === 'proforma' ? 'Proformayı' : 'Sözleşmeyi'} Düzenle` : `Hızlı ${label}`;
  const patch = (key: string, next: Partial<FreeItemDraft>) =>
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...next } : item)));

  function chooseCompany(company: CompanyListItem) {
    setParty((prev) => ({ ...prev, manualCompany: false, companyId: company.id }));
    setCompanyLabel(company.shortName ?? company.legalTitle);
  }

  function submit() {
    const partyError = quickPartyError(party);
    if (partyError) return toast.error(partyError);
    if (divisions.length > 0 && !divisionId) return toast.error('İş alanı seçin');
    if (rows.some((row) => !Number.isFinite(row.quantity) || !Number.isFinite(row.unitPrice) || !Number.isFinite(row.discountAmount) || !Number.isFinite(row.vatRate))) {
      return toast.error('Kalem tutarlarını sayı olarak girin.');
    }
    const itemsError = quickItemsError(rows);
    if (itemsError) return toast.error(itemsError);
    if (rows.some((row) => row.vatRate < 0 || row.vatRate > 100)) return toast.error('KDV oranı 0–100 arası olmalı.');
    if (!(documentDiscount.amount >= 0) || !(documentDiscount.percent >= 0 && documentDiscount.percent <= 100)) {
      return toast.error('Belge iskontosunu düzeltin (oran 0–100).');
    }
    const day = parseDay(date);
    if (!day) return toast.error('Tarih biçimi: YYYY-AA-GG');
    const days = parseDeliveryDays(meta);
    if (kind === 'contract' && days.error) return toast.error(days.error);
    let termDays: number | undefined;
    if (kind === 'contract' && paymentTermDays.trim()) {
      termDays = Number(paymentTermDays.trim());
      if (!Number.isInteger(termDays) || termDays < 0 || termDays > 3650) return toast.error('Ödeme vadesi 0–3650 gün arası olmalı.');
    }

    const freeItems: FreeItemInput[] = rows
      .filter((row) => row.description.trim())
      .map((row) => {
        const source = items.find((item) => item.key === row.quoteItemId);
        return {
          description: row.description.trim(),
          quantity: row.quantity,
          unitCode: row.unitCode.trim() || 'adet',
          unitPrice: row.unitPrice,
          discountAmount: row.discountAmount,
          vatRate: row.vatRate,
          brand: source?.brand.trim() || undefined,
          model: source?.model.trim() || undefined,
          originCountry: source?.originCountry.trim() || undefined,
          hsCode: source?.hsCode.trim() || undefined,
        };
      });
    const common = {
      ...quickPartyPayload(party),
      divisionId: divisionId || undefined,
      statusCode: 'draft',
      currencyCode,
      items: freeItems,
      // Edit’te iskonto/şart temizliği web Quick*Dialog gibi explicit 0 / boş metin gönderir.
      ...(isEdit || hasDocumentDiscount(documentDiscount)
        ? { headerDiscountAmount: documentDiscount.amount, headerDiscountPercent: documentDiscount.percent }
        : {}),
      ...(isEdit
        ? { paymentTerms: payment, deliveryTerms: delivery, warrantyTerms: warranty }
        : {
            ...(payment ? { paymentTerms: payment } : {}),
            ...(delivery ? { deliveryTerms: delivery } : {}),
            ...(warranty ? { warrantyTerms: warranty } : {}),
          }),
    };
    const done = (message: string) => () => {
      toast.success(message);
      router.back();
    };
    const fail = (error: Error) => toast.error(error.message);

    if (kind === 'contract') {
      const installmentPayload: ContractInstallmentInput[] = [];
      for (const row of installments) {
        if (!row.amount.trim() && !row.label.trim() && !row.dueDate.trim()) continue;
        const amount = amountOrZero(row.amount);
        if (!(amount > 0)) {
          toast.error('Ödeme planı satırında tutar sıfırdan büyük olmalı.');
          return;
        }
        const due = row.dueDate.trim() ? parseDay(row.dueDate) : null;
        if (row.dueDate.trim() && !due) {
          toast.error('Ödeme planı tarihi YYYY-AA-GG olmalı.');
          return;
        }
        installmentPayload.push({
          label: row.label.trim() || undefined,
          amount,
          ...(due ? { dueDate: due.toISOString() } : {}),
          promissoryNote: row.paymentMethod === 'promissory_note',
          paymentMethod: row.paymentMethod,
        });
      }
      const body = {
        ...common,
        contractNo: documentNo.trim() || undefined,
        signedDate: day.toISOString(),
        paymentTermDays: termDays,
        deliveryLocation: meta.deliveryLocation.trim() || undefined,
        estimatedDeliveryDaysMin: days.min,
        estimatedDeliveryDaysMax: days.max,
        importCostsExcluded: meta.importCostsExcluded,
        vatIncluded: meta.vatIncluded,
        freightPaidBySeller: meta.freightPaidBySeller,
        ...(installmentPayload.length ? { installments: installmentPayload } : {}),
      };
      if (isEdit && documentId) updateContract.mutate({ id: documentId, body }, { onSuccess: done('CRM sözleşmesi güncellendi'), onError: fail });
      else
        createContract.mutate(body, {
          onSuccess: done('CRM sözleşmesi oluşturuldu. PDF yüklendikten sonra detaydan açılır.'),
          onError: fail,
        });
      return;
    }
    const body = { ...common, documentNo: documentNo.trim() || undefined, issueDate: day.toISOString() };
    if (isEdit && documentId) updateProforma.mutate({ id: documentId, body }, { onSuccess: done('CRM proforması güncellendi'), onError: fail });
    else
      createProforma.mutate(body, {
        onSuccess: done('CRM proforması oluşturuldu. PDF yüklendikten sonra detaydan açılır.'),
        onError: fail,
      });
  }

  if (isEdit && (existing.isPending || existing.error)) {
    return (
      <ModalForm title={title} submitLabel="Kaydet" onSubmit={() => undefined} disabled>
        {existing.error ? <ErrorState message={existing.error.message} onRetry={() => void existing.refetch()} /> : <DetailSkeleton />}
      </ModalForm>
    );
  }

  return (
    <>
      <ModalForm
        title={title}
        submitLabel={isEdit ? `${label}${kind === 'proforma' ? 'yı' : 'yi'} Güncelle` : `CRM'de ${label} Oluştur`}
        onSubmit={submit}
        loading={busy}
        disabled={!hydrated}
      >
        <Text className="font-inter text-sm text-muted-foreground">
          {isEdit
            ? 'Belgenin firma bilgisi, kalemleri ve şartlarını güncelleyin. PDF mobilde basılmaz; CRM dosyası belge detayından açılır.'
            : `Teklif açmadan CRM'de ${kind === 'proforma' ? 'proforma' : 'sözleşme'} oluşturun. Kalemleri doğrudan yazarsınız; PDF web CRM'den yüklenir, mobilde yeniden üretilmez.`}
        </Text>

        <View className="gap-3">
          <Eyebrow>Firma</Eyebrow>
          <ChoiceChips
            options={[
              { value: 'registered', label: 'Kayıtlı firma' },
              { value: 'manual', label: 'Elle giriş' },
            ]}
            value={party.manualCompany ? 'manual' : 'registered'}
            onChange={(next) => setParty((prev) => ({ ...prev, manualCompany: next === 'manual' }))}
          />
          {party.manualCompany ? (
            <>
              <Field label="Firma Unvanı *" value={party.companyName} onChangeText={(v) => setParty((p) => ({ ...p, companyName: v }))} maxLength={300} />
              <Field label="Adres" value={party.companyAddress} onChangeText={(v) => setParty((p) => ({ ...p, companyAddress: v }))} maxLength={1000} multiline />
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <TaxOfficeSelect value={party.companyTaxOffice} onChange={(v) => setParty((p) => ({ ...p, companyTaxOffice: v.slice(0, 120) }))} />
                </View>
                <View className="flex-1">
                  <Field
                    label="Vergi No"
                    value={party.companyTaxNumber}
                    onChangeText={(v) => setParty((p) => ({ ...p, companyTaxNumber: v }))}
                    keyboardType="number-pad"
                    maxLength={20}
                  />
                </View>
              </View>
              <Text className="font-inter text-xs text-muted-foreground">
                Elle girilen firma hiçbir cariye bağlanmaz; bu {kind === 'proforma' ? 'proforma' : 'sözleşme'} raporlarda firmasız görünür.
              </Text>
            </>
          ) : (
            <PickerField
              label="Firma *"
              value={companyLabel}
              placeholder="Firma seçin"
              icon="business-outline"
              onPress={() => companySheet.current?.present()}
            />
          )}
          <View className="flex-row gap-2">
            <View className="flex-1">
              {!party.manualCompany && party.companyId ? (
                <ContactSelect
                  label="Yetkili"
                  companyId={party.companyId}
                  value={party.contactName}
                  allowCustom
                  clearable
                  placeholder="Kontak seçin veya yazın"
                  onSelect={(picked) => {
                    const contact = picked?.data;
                    setParty((p) => ({
                      ...p,
                      contactName: picked?.label ?? '',
                      // Temizlemede eski telefon kalmasın; seçimde kontak telefonunu yaz.
                      contactPhone: contact ? contactPhone(contact) || '' : '',
                    }));
                  }}
                />
              ) : (
                <Field label="Yetkili" value={party.contactName} onChangeText={(v) => setParty((p) => ({ ...p, contactName: v }))} maxLength={200} />
              )}
            </View>
            <View className="flex-1">
              <Field
                label="Telefon"
                value={party.contactPhone}
                onChangeText={(v) => setParty((p) => ({ ...p, contactPhone: v }))}
                keyboardType="phone-pad"
                maxLength={40}
              />
            </View>
          </View>
        </View>

        <View className="gap-3">
          <Eyebrow>Belge</Eyebrow>
          {divisions.length > 0 ? (
            <ChoiceChips
              label="İş Alanı * · belge numarası serisi bundan belirlenir"
              options={divisions.map((division) => ({ value: division.id, label: division.name }))}
              value={divisionId || null}
              onChange={setDivisionId}
            />
          ) : null}
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Field label={`${label} No`} value={documentNo} onChangeText={setDocumentNo} placeholder="Otomatik" maxLength={64} />
            </View>
            <View className="flex-1">
              <DateTextField
                label={kind === 'contract' ? 'İmza Tarihi' : 'Tarih'}
                value={date}
                onChangeText={setDate}
              />
            </View>
          </View>
          <ChoiceChips label="Para Birimi" options={CURRENCIES.map((code) => ({ value: code, label: code }))} value={currencyCode} onChange={setCurrencyCode} />
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

        <View className="gap-3">
          <Eyebrow>Kalemler ({rows.filter((row) => row.description.trim()).length} satır)</Eyebrow>
          <Text className="font-inter text-xs text-muted-foreground">
            {kind === 'contract'
              ? 'Açıklama, adet ve fiyatı doğrudan yazın. Aksesuar satırı için açıklamayı “↳ Opsiyon: …” ile başlatın.'
              : 'Açıklama, adet ve fiyatı doğrudan yazın. Katalog bağı yoktur.'}
          </Text>
          {items.map((item, index) => {
            const row = rows[index];
            const net = row && Number.isFinite(row.quantity * row.unitPrice - row.discountAmount) ? row.quantity * row.unitPrice - row.discountAmount : null;
            return (
              <SubtleCard key={item.key} className="gap-2.5 p-3">
                <View className="flex-row items-center justify-between">
                  <Text className="font-inter-semibold text-[13px] text-muted-foreground">{index + 1}. kalem</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${index + 1}. kalemi kaldır`}
                    disabled={items.length === 1}
                    onPress={() => setItems((prev) => prev.filter((entry) => entry.key !== item.key))}
                    className={`h-11 w-11 items-center justify-center ${items.length === 1 ? 'opacity-40' : ''}`}
                  >
                    <Ionicons name="trash-outline" size={19} color={colors.destructive} />
                  </Pressable>
                </View>
                <ProductSelect
                  label="Katalogdan doldur (opsiyonel)"
                  value=""
                  allowCustom={false}
                  placeholder="Ürün arayın; alanlar düzenlenebilir kalır"
                  onSelect={(picked) => {
                    const product = picked?.data;
                    if (!product) return;
                    patch(item.key, {
                      description: productLabel(product),
                      brand: product.brand?.name ?? item.brand,
                      model: product.modelCode || item.model,
                      originCountry: product.originCountry ?? item.originCountry,
                      hsCode: product.hsCode ?? item.hsCode,
                      vatRate: product.vatRate ? String(Number(product.vatRate)) : item.vatRate,
                    });
                  }}
                />
                <Field label="Açıklama *" value={item.description} onChangeText={(v) => patch(item.key, { description: v })} maxLength={2000} multiline />
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Field label="Adet" value={item.quantity} onChangeText={(v) => patch(item.key, { quantity: v })} keyboardType="decimal-pad" />
                  </View>
                  <View className="flex-1">
                    <LookupSelect name="units" label="Birim" placeholder="Birim" icon="scale-outline" value={item.unitCode} onChange={(v) => patch(item.key, { unitCode: v })} clearable={false} />
                  </View>
                  <View className="flex-[1.4]">
                    <Field label={`Fiyat (${currencyCode})`} value={item.unitPrice} onChangeText={(v) => patch(item.key, { unitPrice: v })} keyboardType="decimal-pad" />
                  </View>
                </View>
                <View className="flex-row gap-2">
                  <View className="flex-[1.6]">
                    <Field label="Satır iskontosu" value={item.discountAmount} onChangeText={(v) => patch(item.key, { discountAmount: v })} keyboardType="decimal-pad" placeholder="0" />
                  </View>
                  <View className="flex-1">
                    <Field label="KDV %" value={item.vatRate} onChangeText={(v) => patch(item.key, { vatRate: v })} keyboardType="decimal-pad" />
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: item.detailOpen }}
                  onPress={() => patch(item.key, { detailOpen: !item.detailOpen })}
                  className="min-h-[44px] flex-row items-center gap-1.5"
                >
                  <Ionicons name={item.detailOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
                  <Text className="font-inter-semibold text-[13px] text-primary">Ürün detayı (marka, model, menşe, GTİP)</Text>
                </Pressable>
                {item.detailOpen ? (
                  <>
                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <BrandSelect value={item.brand} onSelect={(next) => patch(item.key, { brand: next?.label.slice(0, 120) ?? '' })} />
                      </View>
                      <View className="flex-1">
                        <Field label="Model" value={item.model} onChangeText={(v) => patch(item.key, { model: v })} maxLength={120} />
                      </View>
                    </View>
                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <CountrySelect label="Menşe" value={item.originCountry} onChange={(v) => patch(item.key, { originCountry: v.slice(0, 120) })} />
                      </View>
                      <View className="flex-1">
                        <Field label="GTİP" value={item.hsCode} onChangeText={(v) => patch(item.key, { hsCode: v })} maxLength={32} />
                      </View>
                    </View>
                  </>
                ) : null}
                {net !== null && item.description.trim() ? (
                  <Text className="text-right font-inter-semibold text-[13px] text-foreground">Satır net: {formatAmount(net, currencyCode)}</Text>
                ) : null}
              </SubtleCard>
            );
          })}
          <Button label="Satır Ekle" variant="ghost" trailingIcon="add" onPress={() => setItems((prev) => [...prev, emptyFreeItem()])} />
        </View>

        <DocumentDiscountFields
          amount={discountAmount}
          percent={discountPercent}
          onAmount={setDiscountAmount}
          onPercent={setDiscountPercent}
          currencyCode={currencyCode}
        />
        <DocumentTotalsCard totals={totals} currencyCode={currencyCode} />

        {kind === 'contract' ? (
          <View className="gap-3">
            <Eyebrow>Ödeme planı (web QuickContract)</Eyebrow>
            <Text className="font-inter text-xs text-muted-foreground">
              Vade satırları CRM sözleşmesine yazılır; PDF web çıktısından gelir.
            </Text>
            {installments.map((row, index) => (
              <SubtleCard key={row.key} className="gap-2.5 p-3">
                <View className="flex-row items-center justify-between">
                  <Text className="font-inter-semibold text-[13px] text-muted-foreground">{index + 1}. vade</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${index + 1}. vadeyi kaldır`}
                    onPress={() => setInstallments((prev) => prev.filter((entry) => entry.key !== row.key))}
                    className="h-11 w-11 items-center justify-center"
                  >
                    <Ionicons name="trash-outline" size={19} color={colors.destructive} />
                  </Pressable>
                </View>
                <Field
                  label="Açıklama"
                  value={row.label}
                  onChangeText={(label) =>
                    setInstallments((prev) => prev.map((entry) => (entry.key === row.key ? { ...entry, label } : entry)))
                  }
                  placeholder="Peşinat / 1. taksit"
                  maxLength={255}
                />
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Field
                      label={`Tutar (${currencyCode})`}
                      value={row.amount}
                      onChangeText={(amount) =>
                        setInstallments((prev) => prev.map((entry) => (entry.key === row.key ? { ...entry, amount } : entry)))
                      }
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View className="flex-1">
                    <DateTextField
                      label="Vade tarihi"
                      value={row.dueDate}
                      onChangeText={(dueDate) =>
                        setInstallments((prev) => prev.map((entry) => (entry.key === row.key ? { ...entry, dueDate } : entry)))
                      }
                    />
                  </View>
                </View>
                <ChoiceChips
                  label="Tahsilat yöntemi"
                  options={INSTALLMENT_METHODS.map((entry) => ({ value: entry.value, label: entry.label }))}
                  value={row.paymentMethod}
                  onChange={(paymentMethod) =>
                    setInstallments((prev) =>
                      prev.map((entry) =>
                        entry.key === row.key
                          ? { ...entry, paymentMethod: paymentMethod as InstallmentDraft['paymentMethod'] }
                          : entry
                      )
                    )
                  }
                />
              </SubtleCard>
            ))}
            <Button label="Vade Ekle" variant="ghost" trailingIcon="add" onPress={() => setInstallments((prev) => [...prev, emptyInstallment()])} />
          </View>
        ) : null}

        <DocumentTermsFields
          title={kind === 'contract' ? 'Sözleşme Şartları' : 'Proforma Notları'}
          hint={
            kind === 'contract'
              ? 'Bu belge bir teklife bağlı olmadığı için şartlar yalnızca sözleşmeye kaydedilir.'
              : 'Notlar yalnızca bu proformaya kaydedilir.'
          }
          payment={payment}
          delivery={delivery}
          warranty={warranty}
          onChange={(next) => {
            if (next.payment !== undefined) setPayment(next.payment);
            if (next.delivery !== undefined) setDelivery(next.delivery);
            if (next.warranty !== undefined) setWarranty(next.warranty);
          }}
          meta={kind === 'contract' ? meta : undefined}
          onMetaChange={kind === 'contract' ? (next) => setMeta((prev) => ({ ...prev, ...next })) : undefined}
        />
      </ModalForm>
      <CompanyPickerSheet sheetRef={companySheet} selectedId={party.companyId} onSelect={chooseCompany} />
    </>
  );
}
