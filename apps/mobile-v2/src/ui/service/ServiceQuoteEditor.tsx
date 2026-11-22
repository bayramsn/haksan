import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useCan } from '@/src/auth/AuthProvider';
import { useDeleteNoteTemplate, useNoteTemplates, useSaveNoteTemplate } from '@/src/api/note-templates.hooks';
import { settingsApi } from '@/src/api/settings.api';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { SERVICE_QUOTE_TEMPLATE_SCOPE, serviceNoteBody, serviceNoteLines, serviceNoteTemplateId, serviceNoteTemplateKey, serviceTemplateValidation } from './service-quote-templates';
import { Ionicons } from '@expo/vector-icons';
import { useLookup } from '@/src/api/crm.hooks';
import type { ServiceTicket } from '@/src/api/endpoints';
import { formatAmount } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Button, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { CompanySelect, ContactSelect, SuggestionSelect, UserSelect, contactEmail } from '@/src/ui/select/fields';
import { shareServerPdf } from '@/src/api/server-pdf';
import { serviceQuotePrintHtml } from './service-quote-print';
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

/** Web ServiceQuoteEditor: aynı kayıtlı servis teklif formu ve mobil PDF paylaşımı. */
export function ServiceQuoteEditor({ ticket, context, canUpdate }: { ticket: ServiceTicket; context: QuoteContext; canUpdate: boolean }) {
  const { colors } = useTheme();
  const { write, busy } = useTicketWriter(ticket);
  const saved = readServiceQuote(ticket.metadata?.serviceQuote);
  const [draft, setDraft] = useState<ServiceQuote>(() => saved ?? defaultServiceQuote(context, new Date(), Date.now()));
  const [preview, setPreview] = useState<ServiceQuote | null>(saved);
  const [printing, setPrinting] = useState(false);
  const operationInFlight = useRef(false);
  const canReadTicket = useCan('service_tickets.read');
  const [companyId, setCompanyId] = useState<string | null>(ticket.companyId);
  const canCreateTemplate = useCan('service_tickets.create');
  const canUpdateTemplate = useCan('service_tickets.update');
  const canReadQuotes = useCan('quotes.read');
  const canReadProformas = useCan('proformas.read');
  const canReadContracts = useCan('contracts.read');
  const canManageSettings = useCan('tenants.update');
  const canReadSignatures = canReadQuotes || canReadProformas || canReadContracts || canManageSettings;
  const serviceTemplates = useNoteTemplates('service_quote');
  const quoteTemplates = useNoteTemplates('quote');
  const templateSave = useSaveNoteTemplate();
  const templateDelete = useDeleteNoteTemplate();
  const [templateMode, setTemplateMode] = useState<'create' | 'update' | null>(null);
  const [templateTitle, setTemplateTitle] = useState('');
  const templatesBusy = templateSave.isPending || templateDelete.isPending;
  const canManageTemplate = canUpdate && (canCreateTemplate || canUpdateTemplate);
  const selectedTemplate = serviceTemplates.data?.find((row) => row.id === serviceNoteTemplateId(draft.noteVariantKey));
  const signatures = useQuery({ queryKey: ['settings', 'signatures'], queryFn: settingsApi.signatures,
    enabled: canReadSignatures });
  const signatureOptions = (signatures.data ?? []).filter((row) => row.isActive);
  const units = useLookup('units');
  const unitNames = useMemo(() => (units.data ?? []).map((row) => row.name), [units.data]);

  const set = <K extends keyof ServiceQuote>(key: K, value: ServiceQuote[K]) => setDraft((prev) => ({ ...prev, [key]: value }));
  const updateItem = (id: string, patch: Partial<QuoteItem>) =>
    setDraft((prev) => ({ ...prev, items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));

  const save = async (withPdf = false) => {
    if (!canUpdate || busy || operationInFlight.current) return;
    const normalized = normalizeServiceQuote(draft, ticket.ticketNo, new Date());
    const missing = serviceQuoteMissingFields(normalized);
    if (missing.length) {
      toast.error(`Servis teklifi eksik. Doldurulması gereken alanlar: ${missing.join(', ')}.`);
      return;
    }
    operationInFlight.current = true;
    let persisted = false;
    try {
      await write('Servis teklif formu kaydedildi.', { quoteRequired: true, serviceQuote: normalized });
      persisted = true;
      setDraft(normalized);
      setPreview(normalized);
      toast.success('Servis teklif formu kaydedildi');
      if (withPdf && canReadTicket) {
        setPrinting(true);
        await shareServerPdf('service-quote', serviceQuotePrintHtml(normalized, context.machine), `servis-teklifi-${ticket.ticketNo || normalized.quoteNo}.pdf`);
      }
    } catch (error) {
      toast.error(`${persisted ? 'Teklif kaydedildi; PDF paylaşılamadı' : 'Servis teklifi kaydedilemedi'}: ${error instanceof Error ? error.message : 'İşlem başarısız.'}`);
    } finally {
      operationInFlight.current = false;
      setPrinting(false);
    }
  };

  async function shareSaved() {
    if (!canReadTicket || !preview || busy || operationInFlight.current) return;
    operationInFlight.current = true;
    setPrinting(true);
    try {
      await shareServerPdf('service-quote', serviceQuotePrintHtml(preview, context.machine), `servis-teklifi-${ticket.ticketNo || preview.quoteNo}.pdf`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'PDF paylaşılamadı.'); }
    finally { operationInFlight.current = false; setPrinting(false); }
  }

  async function persistTemplate() {
    if (!canManageTemplate || templatesBusy || !templateMode) return;
    if (templateMode === 'update' && !selectedTemplate) return;
    const body = serviceNoteBody(draft.notes);
    const invalid = serviceTemplateValidation(templateTitle, body);
    if (invalid) return toast.error(invalid);
    try {
      const row = await templateSave.mutateAsync({ id: templateMode === 'update' ? selectedTemplate?.id : undefined,
        body: { title: templateTitle.trim(), body, scope: SERVICE_QUOTE_TEMPLATE_SCOPE } });
      set('noteVariantKey', serviceNoteTemplateKey(row.id));
      setTemplateMode(null);
      toast.success('Servis teklif notu şablonu kaydedildi');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Şablon kaydedilemedi.'); }
  }

  function deleteTemplate() {
    if (!canManageTemplate || templatesBusy || !selectedTemplate) return;
    const selected = selectedTemplate;
    Alert.alert('Şablon silinsin mi?', selected.title, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => {
        if (templatesBusy) return;
        templateDelete.mutate(selected.id, {
          onSuccess: () => { setDraft((current) => current.noteVariantKey === serviceNoteTemplateKey(selected.id) ? { ...current, noteVariantKey: '' } : current); setTemplateMode(null); toast.success('Şablon silindi'); },
          onError: (error) => toast.error(error.message),
        });
      } },
    ]);
  }

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
        <DayField label="Tarih *" value={draft.date} onChange={(v) => set('date', v)} clearable={false} disabled={!canUpdate} />
        <Field label="Geçerlilik Süresi *" value={draft.validity} onChangeText={(v) => set('validity', v)} editable={canUpdate} />
        <ChoiceChips label="Para Birimi *" value={draft.currency} options={CURRENCIES.map((code) => ({ value: code, label: code }))} onChange={(v) => set('currency', v)} disabled={!canUpdate} />
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

      {signatureOptions.length || draft.signature ? (
        <FormSection title="Çıktıya basılacak imza">
          <OptionPicker label="Belge imzası" placeholder="İmzasız — teklifi yazanın adı basılır"
            value={draft.signature?.id ?? null} displayValue={draft.signature ? [draft.signature.name, draft.signature.title].filter(Boolean).join(' · ') : undefined}
            options={signatureOptions.map((row) => ({ value: row.id, label: [row.name, row.title].filter(Boolean).join(' · ') }))}
            clearable disabled={!canUpdate || busy} loading={signatures.isFetching} loadError={signatures.error}
            onRetry={() => { if (canReadSignatures) void signatures.refetch(); }} onChange={(id) => {
              if (!id) return set('signature', undefined);
              const row = signatureOptions.find((item) => item.id === id);
              if (row) set('signature', { id: row.id, name: row.name, title: row.title, imageUrl: row.imageUrl });
            }} />
          <Text className="font-inter text-xs text-muted-foreground">Seçilen imzanın kopyası teklif kaydında saklanır.</Text>
        </FormSection>
      ) : null}

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
                  accessibilityState={{ disabled: draft.items.length === 1 }}
                  onPress={() => set('items', draft.items.filter((row) => row.id !== item.id))}
                  className={`h-11 w-11 items-center justify-center ${draft.items.length === 1 ? 'opacity-40' : 'active:opacity-60'}`}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.destructive} />
                </Pressable>
              ) : null}
            </View>
            <ProductPicker
              disabled={!canUpdate}
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
        <OptionPicker label="Kayıtlı not şablonu" placeholder="Servis veya teklif notu seçin"
          value={serviceNoteTemplateId(draft.noteVariantKey)}
          options={[...(serviceTemplates.data ?? []).map((row) => ({ value: row.id, label: row.title, hint: 'Servis teklifi' })), ...(quoteTemplates.data ?? []).map((row) => ({ value: row.id, label: row.title, hint: 'Teklif notu' }))]}
          searchable clearable disabled={!canUpdate || templatesBusy} loading={serviceTemplates.isFetching || quoteTemplates.isFetching}
          loadError={serviceTemplates.error ?? quoteTemplates.error}
          onRetry={() => { void serviceTemplates.refetch(); void quoteTemplates.refetch(); }}
          onChange={(id) => {
            setTemplateMode(null);
            if (!id) return set('noteVariantKey', '');
            const row = [...(serviceTemplates.data ?? []), ...(quoteTemplates.data ?? [])].find((item) => item.id === id);
            if (row) setDraft((current) => ({ ...current, noteVariantKey: serviceNoteTemplateKey(row.id), notes: serviceNoteLines(row.body) }));
          }} />
        <ChoiceChips
          label="Not şablonu"
          disabled={!canUpdate}
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
        {canManageTemplate ? <View className="gap-2">
          <Button label="Notları yeni şablon olarak kaydet" variant="ghost" disabled={templatesBusy || busy} onPress={() => { setTemplateTitle(selectedTemplate ? `${selectedTemplate.title} kopya` : ''); setTemplateMode('create'); }} />
          {selectedTemplate ? <>
            <Button label="Seçili servis şablonunu güncelle" variant="ghost" disabled={templatesBusy || busy} onPress={() => { setTemplateTitle(selectedTemplate.title); setTemplateMode('update'); }} />
            <Button label="Seçili servis şablonunu sil" variant="ghost" disabled={templatesBusy || busy} onPress={deleteTemplate} />
          </> : null}
          {templateMode ? <>
            <Field label="Şablon başlığı" value={templateTitle} onChangeText={setTemplateTitle} maxLength={200} editable={!templatesBusy} />
            <Button label={templateMode === 'create' ? 'Yeni şablonu kaydet' : 'Şablonu güncelle'} disabled={templatesBusy || !templateTitle.trim() || !serviceNoteBody(draft.notes)} loading={templateSave.isPending} onPress={() => void persistTemplate()} />
            <Button label="Vazgeç" variant="ghost" disabled={templatesBusy} onPress={() => setTemplateMode(null)} />
          </> : null}
        </View> : null}
      </FormSection>

      {canUpdate ? <>
        <Button label="Servis teklifini kaydet" loading={busy} disabled={busy || printing} onPress={() => void save()} />
        {canReadTicket ? <Button label="Kaydet ve PDF paylaş" variant="ghost" loading={printing} disabled={busy || printing} onPress={() => void save(true)} /> : null}
      </> : null}

      {preview && canReadTicket ? (
        <FormSection title="Servis teklifi belgesi" hint="Son kaydedilmiş teklif bilgileriyle">
          <Button label="Kayıtlı teklifi PDF paylaş" trailingIcon="share-outline" loading={printing} disabled={busy || printing} onPress={() => void shareSaved()} />
        </FormSection>
      ) : null}
    </>
  );
}
