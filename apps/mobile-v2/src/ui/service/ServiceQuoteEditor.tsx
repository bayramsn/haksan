import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLookup } from '@/src/api/crm.hooks';
import type { ServiceTicket } from '@/src/api/endpoints';
import { formatAmount } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Button, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { CompanySelect, ContactSelect, SuggestionSelect, UserSelect, contactEmail } from '@/src/ui/select/fields';
import { DocRow, DocTitle, DocumentCapture } from './DocumentCapture';
import { ChoiceChips, DayField, FormSection, ProductPicker } from './fields';
import {
  CURRENCIES,
  SERVICE_NOTE_VARIANTS,
  defaultServiceQuote,
  newQuoteItem,
  normalizeServiceQuote,
  quoteTotals,
  readServiceQuote,
  serviceQuoteMissingFields,
  type QuoteContext,
  type QuoteItem,
  type ServiceQuote,
} from './serviceForms';
import { useTicketWriter } from './TicketPanels';

const SERVICE_PRODUCT_CATEGORIES = ['YEDEK_PARCA', 'AKSESUAR', 'OPSIYONEL_DONANIM', 'ISCILIK'];
const num = (value: string) => Math.max(0, Number(value.replace(',', '.')) || 0);

function QuoteDocument({ quote }: { quote: ServiceQuote }) {
  const totals = quoteTotals(quote);
  return (
    <View className="gap-0.5">
      <Text className="font-display text-[18px] text-foreground">Servis Teklifi</Text>
      <DocRow label="Teklif No" value={quote.quoteNo} />
      <DocRow label="Tarih" value={quote.date} />
      <DocRow label="Geçerlilik Süresi" value={quote.validity} />
      <DocTitle>Müşteri</DocTitle>
      <DocRow label="Firma" value={quote.company} />
      <DocRow label="İlgili" value={quote.contact} />
      <DocRow label="Mobil" value={quote.mobile} />
      <DocRow label="Telefon" value={quote.phone} />
      <DocRow label="E-Posta" value={quote.email} />
      <DocRow label="Adres" value={quote.address} />
      <DocTitle>Teklif Kapsamı</DocTitle>
      <Text className="font-inter text-[12px] leading-5 text-foreground">{quote.subject}</Text>
      <DocTitle>Ürün / hizmet kalemleri</DocTitle>
      {quote.items.map((item, index) => (
        <View key={item.id} className="flex-row gap-2 border-b border-border py-1.5">
          <Text className="w-5 font-inter text-[12px] text-muted-foreground">{index + 1}</Text>
          <Text className="flex-1 font-inter text-[12px] text-foreground">
            {[item.stockCode, item.description].filter(Boolean).join(' · ')} — {item.quantity} {item.unit} × {formatAmount(item.unitPrice, quote.currency)}
          </Text>
          <Text className="font-inter-semibold text-[12px] text-foreground">{formatAmount(item.quantity * item.unitPrice, quote.currency)}</Text>
        </View>
      ))}
      <DocRow label="Ara Toplam" value={formatAmount(totals.subtotal, quote.currency)} />
      <DocRow label={`K.D.V. (%${quote.vatRate})`} value={formatAmount(totals.vat, quote.currency)} />
      <DocRow label="Toplam" value={formatAmount(totals.total, quote.currency)} />
      {quote.notes.length ? <DocTitle>Notlar</DocTitle> : null}
      {quote.notes.map((note, index) => (
        <Text key={index} className="font-inter text-[11px] leading-4 text-foreground">• {note}</Text>
      ))}
      <DocTitle>Teklifi Hazırlayan</DocTitle>
      <Text className="font-inter text-[12px] text-foreground">{[quote.writerName, quote.writerTitle, quote.writerEmail].filter(Boolean).join(' · ')}</Text>
    </View>
  );
}

/** Web ServiceQuoteEditor: servis teklif formu (metadata.serviceQuote) + yazdır. */
export function ServiceQuoteEditor({ ticket, context, canUpdate }: { ticket: ServiceTicket; context: QuoteContext; canUpdate: boolean }) {
  const { colors } = useTheme();
  const { write, busy } = useTicketWriter(ticket);
  const saved = readServiceQuote(ticket.metadata?.serviceQuote);
  const [draft, setDraft] = useState<ServiceQuote>(() => saved ?? defaultServiceQuote(context, new Date(), Date.now()));
  const [preview, setPreview] = useState<ServiceQuote | null>(saved);
  const [companyId, setCompanyId] = useState<string | null>(ticket.companyId);
  const units = useLookup('units');
  const unitNames = useMemo(() => (units.data ?? []).map((row) => row.name), [units.data]);

  const set = <K extends keyof ServiceQuote>(key: K, value: ServiceQuote[K]) => setDraft((prev) => ({ ...prev, [key]: value }));
  const updateItem = (id: string, patch: Partial<QuoteItem>) =>
    setDraft((prev) => ({ ...prev, items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));

  const save = () => {
    const normalized = normalizeServiceQuote(draft, ticket.ticketNo, new Date());
    const missing = serviceQuoteMissingFields(normalized);
    if (missing.length) {
      toast.error(`Servis teklifi eksik. Doldurulması gereken alanlar: ${missing.join(', ')}.`);
      return;
    }
    write('Servis teklif formu kaydedildi.', { quoteRequired: true, serviceQuote: normalized })
      .then(() => {
        setDraft(normalized);
        setPreview(normalized);
        toast.success('Servis teklif formu kaydedildi');
      })
      .catch((error: Error) => toast.error(`Servis teklifi kaydedilemedi: ${error.message}`));
  };

  const totals = quoteTotals(draft);
  const variantOptions = [...SERVICE_NOTE_VARIANTS.map((variant) => ({ value: variant.key, label: variant.label })), { value: 'ozel', label: 'Özel (manuel gir)' }];

  return (
    <>
      <View className="rounded-control border border-border bg-muted px-3 py-2.5">
        <Text className="font-inter text-sm leading-5 text-foreground">
          Bu form kaydedilmeden kart Bakım/Onarım & Yedek Parça aşamasına geçirilemez. Yazdırılan teklif yalnızca bu alandaki bilgilerle oluşturulur.
        </Text>
      </View>

      <FormSection title="Teklif ve müşteri bilgileri">
        <Field label="Teklif No. *" value={draft.quoteNo} onChangeText={(v) => set('quoteNo', v)} placeholder="CNC-SRVTEK-2026/0010" editable={canUpdate} />
        <DayField label="Tarih *" value={draft.date} onChange={(v) => set('date', v)} clearable={false} />
        <Field label="Geçerlilik Süresi *" value={draft.validity} onChangeText={(v) => set('validity', v)} editable={canUpdate} />
        <ChoiceChips label="Para Birimi *" value={draft.currency} options={CURRENCIES.map((code) => ({ value: code, label: code }))} onChange={(v) => set('currency', v)} />
        <CompanySelect
          label="Firma *"
          placeholder="Kayıtlı firmadan seçin veya yazın"
          value={draft.company}
          onSelect={(item) => {
            const company = item?.data;
            setCompanyId(company?.id ?? null);
            if (!company) return set('company', item?.label ?? '');
            setDraft((prev) => ({
              ...prev,
              company: company.legalTitle,
              phone: prev.phone || company.primaryPhone || '',
              email: prev.email || company.primaryEmail || '',
              address: prev.address || company.primaryAddress?.fullAddress || '',
            }));
          }}
          allowCustom
          disabled={!canUpdate}
        />
        <ContactSelect
          label="İlgili"
          placeholder={companyId ? 'Firmanın kontağını seçin veya yazın' : 'İlgili kişiyi yazın'}
          companyId={companyId}
          value={draft.contact}
          onSelect={(item) => {
            const contact = item?.data;
            if (!contact) return set('contact', item?.label ?? '');
            setDraft((prev) => ({
              ...prev,
              contact: contact.fullName,
              mobile: prev.mobile || contact.mobilePhone || '',
              phone: prev.phone || contact.workPhone || '',
              email: prev.email || contactEmail(contact),
            }));
          }}
          allowCustom
          clearable
          disabled={!canUpdate}
        />
        <Field label="Mobil" value={draft.mobile} onChangeText={(v) => set('mobile', v)} keyboardType="phone-pad" editable={canUpdate} />
        <Field label="Telefon" value={draft.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" editable={canUpdate} />
        <Field label="E-Posta" value={draft.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" editable={canUpdate} />
        <Field label="Adres" value={draft.address} onChangeText={(v) => set('address', v)} editable={canUpdate} />
        <Field
          label="Teklif Kapsamı *"
          value={draft.subject}
          onChangeText={(v) => set('subject', v)}
          placeholder="Teklifimiz ... arızasını kapsamaktadır."
          multiline
          editable={canUpdate}
          style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }}
        />
      </FormSection>

      <FormSection title="Teklifi hazırlayan">
        <UserSelect
          label="Teklifi Yazan *"
          value={draft.writerName}
          onSelect={(item) => {
            const person = item?.data;
            if (!person) return set('writerName', item?.label ?? '');
            setDraft((prev) => ({ ...prev, writerName: person.fullName, writerEmail: person.email || prev.writerEmail }));
          }}
          disabled={!canUpdate}
        />
        <Field label="Unvan" value={draft.writerTitle} onChangeText={(v) => set('writerTitle', v)} editable={canUpdate} />
        <Field label="E-Posta" value={draft.writerEmail} onChangeText={(v) => set('writerEmail', v)} keyboardType="email-address" autoCapitalize="none" editable={canUpdate} />
      </FormSection>

      <FormSection title="Ürün / hizmet kalemleri">
        {draft.items.map((item, index) => (
          <View key={item.id} className="gap-2 border-b border-border pb-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-inter-semibold text-[13px] text-muted-foreground">Kalem {index + 1}</Text>
              {canUpdate ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Kalem ${index + 1} satırını sil`}
                  disabled={draft.items.length === 1}
                  onPress={() => set('items', draft.items.filter((row) => row.id !== item.id))}
                  className={`h-11 w-11 items-center justify-center ${draft.items.length === 1 ? 'opacity-40' : 'active:opacity-60'}`}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.destructive} />
                </Pressable>
              ) : null}
            </View>
            <ProductPicker
              label="Ürün"
              placeholder="Serbest kalem"
              value={item.productModelId ? { id: item.productModelId, name: [item.stockCode, item.description].filter(Boolean).join(' · ') } : null}
              categoryCodes={SERVICE_PRODUCT_CATEGORIES}
              onChange={(product) => {
                if (!product) return updateItem(item.id, { productModelId: null, stockCode: null });
                updateItem(item.id, {
                  productModelId: product.id,
                  stockCode: product.stockCode || null,
                  description: [product.brand?.name, product.modelCode].filter(Boolean).join(' ') || product.fullName,
                  unitPrice: Number(product.cashPrice ?? product.listPrice ?? 0) || 0,
                });
                const code = product.currency?.code as (typeof CURRENCIES)[number] | undefined;
                if (code && CURRENCIES.includes(code) && code !== draft.currency) set('currency', code);
              }}
            />
            <Field label="Açıklama *" value={item.description} onChangeText={(v) => updateItem(item.id, { description: v })} placeholder="Ürün veya hizmet açıklaması" editable={canUpdate} />
            <View className="flex-row gap-2">
              <View className="flex-1"><Field label="Miktar *" value={String(item.quantity)} onChangeText={(v) => updateItem(item.id, { quantity: num(v) })} keyboardType="decimal-pad" editable={canUpdate} /></View>
              <View className="flex-1">
                <SuggestionSelect
                  label="Birim *"
                  placeholder="Birim"
                  icon="scale-outline"
                  value={item.unit}
                  values={unitNames}
                  loading={units.isPending}
                  onChange={(v) => updateItem(item.id, { unit: v })}
                  disabled={!canUpdate}
                  clearable={false}
                />
              </View>
            </View>
            <Field label="Birim Fiyat *" value={String(item.unitPrice)} onChangeText={(v) => updateItem(item.id, { unitPrice: num(v) })} keyboardType="decimal-pad" editable={canUpdate} />
            <Text className="self-end font-inter-semibold text-[13px] text-foreground">Tutar: {formatAmount(item.quantity * item.unitPrice, draft.currency)}</Text>
          </View>
        ))}
        {canUpdate ? <Button label="Satır ekle" variant="ghost" trailingIcon="add" onPress={() => set('items', [...draft.items, newQuoteItem(Date.now())])} /> : null}
        <View className="gap-2 rounded-control bg-muted px-3 py-2.5">
          <View className="flex-row justify-between">
            <Text className="font-inter text-[13px] text-foreground">Ara Toplam</Text>
            <Text className="font-inter-semibold text-[13px] text-foreground">{formatAmount(totals.subtotal, draft.currency)}</Text>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1"><Field label="K.D.V. Oranı (%)" value={String(draft.vatRate)} onChangeText={(v) => set('vatRate', num(v))} keyboardType="decimal-pad" editable={canUpdate} /></View>
            <View className="flex-1"><Field label="K.D.V. Tutarı" value={String(draft.vatAmount)} onChangeText={(v) => set('vatAmount', num(v))} keyboardType="decimal-pad" editable={canUpdate} /></View>
          </View>
          <View className="flex-row justify-between">
            <Text className="font-inter-semibold text-[14px] text-foreground">Toplam</Text>
            <Text className="font-inter-bold text-[14px] text-foreground">{formatAmount(totals.total, draft.currency)}</Text>
          </View>
        </View>
      </FormSection>

      <FormSection title="Teklif notları">
        <ChoiceChips
          label="Not şablonu"
          value={draft.noteVariantKey || 'ozel'}
          options={variantOptions}
          onChange={(key) => {
            if (key === 'ozel') return set('noteVariantKey', '');
            const variant = SERVICE_NOTE_VARIANTS.find((item) => item.key === key);
            if (variant) setDraft((prev) => ({ ...prev, noteVariantKey: key, notes: [...variant.notlar] }));
          }}
        />
        <Field
          label="Notlar (her satır ayrı madde)"
          value={draft.notes.join('\n')}
          onChangeText={(v) => set('notes', v.split('\n'))}
          multiline
          editable={canUpdate}
          style={{ minHeight: 150, textAlignVertical: 'top', paddingTop: 12 }}
        />
      </FormSection>

      {canUpdate ? <Button label="Servis teklifini kaydet" loading={busy} disabled={busy} onPress={save} /> : null}

      {preview ? (
        <FormSection title="Servis Teklifi yazdır" hint="Kayıtlı teklif">
          <DocumentCapture title="Servis Teklifi" fileName={`servis-teklifi-${ticket.ticketNo}`}>
            <QuoteDocument quote={preview} />
          </DocumentCapture>
        </FormSection>
      ) : null}
    </>
  );
}
