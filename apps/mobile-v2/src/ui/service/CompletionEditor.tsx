import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ServiceTicket } from '@/src/api/endpoints';
import { openServiceFormPdf } from '@/src/api/service.api';
import { useSetTicketStage } from '@/src/api/service.hooks';
import { formatAmount } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Button, Chip, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { ChoiceChips, DayField, FormSection } from './fields';
import {
  CURRENCIES,
  RESPONSIBILITY_LABELS,
  SERVICE_FORM_TYPE_LABELS,
  completionCloseMissing,
  completionPartsTotal,
  completionPayload,
  defaultCompletionForm,
  mergeCompletionForm,
  type CompletionContext,
  type CompletionForm,
  type Responsibility,
  type ServiceFormType,
} from './serviceForms';
import { serviceStageOf, stageTarget } from './serviceStage';
import { useTicketWriter } from './TicketPanels';

const MAX_PARTS = 6;
const num = (value: string) => Math.max(0, Number(value.replace(',', '.')) || 0);

/** Web ServiceCompletionEditor: Doktor Makina servis formu, kaydet / PDF / imzala-kapat. */
export function CompletionEditor({ ticket, context, canUpdate }: { ticket: ServiceTicket; context: CompletionContext; canUpdate: boolean }) {
  const { colors } = useTheme();
  const { write, busy, userId } = useTicketWriter(ticket);
  const setStage = useSetTicketStage();
  const isClosed = serviceStageOf(ticket) === 'Closed';
  const editable = canUpdate && !isClosed;
  const [draft, setDraft] = useState<CompletionForm>(() =>
    mergeCompletionForm(ticket.metadata?.completionForm, defaultCompletionForm(context, new Date())),
  );
  const [printing, setPrinting] = useState(false);

  const set = <K extends keyof CompletionForm>(key: K, value: CompletionForm[K]) => setDraft((prev) => ({ ...prev, [key]: value }));
  const setGroup = <K extends 'tezgah' | 'cnc' | 'kullanici'>(group: K, key: keyof CompletionForm[K], value: string) =>
    setDraft((prev) => ({ ...prev, [group]: { ...prev[group], [key]: value } }));

  const build = (markSigned: boolean): CompletionForm => {
    const payload = completionPayload(draft) as CompletionForm;
    return markSigned ? { ...payload, signedAt: new Date().toISOString(), ...(userId ? { signedByUserId: userId } : {}) } : payload;
  };

  const save = async (closing: boolean) => {
    const payload = build(closing);
    await write(closing ? 'Servis tamamlama formu imzalandı ve servis kapatıldı.' : 'Servis tamamlama formu güncellendi.', {
      completionForm: payload,
    });
    setDraft(payload);
    if (closing && !isClosed) {
      const target = stageTarget('Closed');
      await setStage.mutateAsync({ id: ticket.id, ...target });
    }
  };

  const onSave = () =>
    save(false)
      .then(() => toast.success('Tamamlama formu kaydedildi'))
      .catch((error: Error) => toast.error(error.message));

  const onPrint = async () => {
    setPrinting(true);
    try {
      if (!isClosed && canUpdate) await save(false);
      await openServiceFormPdf(ticket.id, ticket.ticketNo);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Servis formu indirilemedi.');
    } finally {
      setPrinting(false);
    }
  };

  const onClose = () => {
    const missing = completionCloseMissing(draft);
    if (missing.length) {
      toast.error(`Servis formu tamamlanmadı. Eksik alanlar: ${missing.join(', ')}.`);
      return;
    }
    Alert.alert(
      'Servis kaydı kapatılsın mı?',
      'Form imzalandı olarak işaretlenecek ve servis aşaması “Kapandı” olacak. Bu işlemden sonra form yalnız görüntülenebilir.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Formu imzala ve kapat',
          onPress: () =>
            save(true)
              .then(() => toast.success('Servis kapatıldı'))
              .catch((error: Error) => toast.error(`Servis kapatılamadı: ${error.message}`)),
        },
      ],
    );
  };

  const partsTotal = completionPartsTotal(draft);
  const grandTotal = partsTotal + (draft.servisUcreti || 0) + (draft.ulasimUcreti || 0);
  const pending = busy || setStage.isPending || printing;
  const field = (label: string, value: string, onChange: (text: string) => void, extra: Partial<React.ComponentProps<typeof Field>> = {}) => (
    <Field label={label} value={value} onChangeText={onChange} editable={editable} {...extra} />
  );
  const area = { multiline: true, style: { minHeight: 90, textAlignVertical: 'top' as const, paddingTop: 12 } };

  return (
    <>
      <View className="gap-2 rounded-control border border-border bg-muted px-3 py-2.5">
        <View className="flex-row flex-wrap items-center gap-2">
          <Ionicons name="document-text-outline" size={18} color={colors.primary} />
          <Text className="font-display-semibold text-[15px] text-foreground">Doktor Makina Servis Formu</Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {draft.signedAt ? <Chip tone="success" label={`İmzalandı · ${draft.signedAt.slice(0, 16).replace('T', ' ')}`} /> : null}
          {isClosed ? <Chip tone="neutral" label="Servis kapandı" /> : null}
        </View>
        <Text className="font-inter text-xs text-muted-foreground">PDF: Doktor Makina Servis Formu şablonu ile oluşturulur.</Text>
      </View>

      <FormSection title="Form">
        {field('Form No', draft.formNo, (v) => set('formNo', v))}
        {editable ? (
          <DayField label="Servis Tarihi" value={draft.kurulumTarihi} onChange={(v) => set('kurulumTarihi', v ?? '')} />
        ) : (
          field('Servis Tarihi', draft.kurulumTarihi, () => undefined)
        )}
      </FormSection>

      <FormSection title="Tezgah Bilgileri">
        {field('Tezgah Markası', draft.tezgah.marka, (v) => setGroup('tezgah', 'marka', v))}
        {field('Tezgah Tipi', draft.tezgah.tip, (v) => setGroup('tezgah', 'tip', v))}
        {field('Tezgah Modeli', draft.tezgah.model, (v) => setGroup('tezgah', 'model', v))}
        {field('Tezgah Seri No', draft.tezgah.seriNo, (v) => setGroup('tezgah', 'seriNo', v))}
      </FormSection>

      <FormSection title="Kontrol Ünitesi Bilgileri">
        {field('Cnc Markası', draft.cnc.marka, (v) => setGroup('cnc', 'marka', v))}
        {field('Cnc Modeli', draft.cnc.model, (v) => setGroup('cnc', 'model', v))}
        {field('Cnc Seri No', draft.cnc.seriNo, (v) => setGroup('cnc', 'seriNo', v))}
        {field('Main S/W', draft.cnc.mainSw, (v) => setGroup('cnc', 'mainSw', v))}
      </FormSection>

      <FormSection title="Kullanıcı Bilgileri">
        {field('Firma', draft.kullanici.firma, (v) => setGroup('kullanici', 'firma', v))}
        {field('İlgili', draft.kullanici.ilgili, (v) => setGroup('kullanici', 'ilgili', v))}
        {field('Telefon', draft.kullanici.telefon, (v) => setGroup('kullanici', 'telefon', v), { keyboardType: 'phone-pad' })}
        {field('Adres', draft.kullanici.adres, (v) => setGroup('kullanici', 'adres', v), area)}
        {field('Faks', draft.kullanici.faks, (v) => setGroup('kullanici', 'faks', v), { keyboardType: 'phone-pad' })}
        {field('Gsm', draft.kullanici.gsm, (v) => setGroup('kullanici', 'gsm', v), { keyboardType: 'phone-pad' })}
        {field('E-Posta', draft.kullanici.eposta, (v) => setGroup('kullanici', 'eposta', v), { keyboardType: 'email-address', autoCapitalize: 'none' })}
        {field('Vergi Dairesi', draft.kullanici.vergiDairesi, (v) => setGroup('kullanici', 'vergiDairesi', v))}
        {field('Vergi No', draft.kullanici.vergiNo, (v) => setGroup('kullanici', 'vergiNo', v), { keyboardType: 'number-pad' })}
      </FormSection>

      <FormSection title="Servis Bilgileri">
        {field('Müşteri Şikayeti', draft.musteriSikayeti, (v) => set('musteriSikayeti', v), area)}
        <ChoiceChips<ServiceFormType>
          label="Servis Tipi"
          value={draft.serviceType}
          options={(Object.keys(SERVICE_FORM_TYPE_LABELS) as ServiceFormType[]).map((value) => ({ value, label: SERVICE_FORM_TYPE_LABELS[value] }))}
          onChange={(v) => editable && set('serviceType', v)}
        />
        <ChoiceChips<Responsibility>
          label="Yükümlülük"
          value={draft.responsibility}
          options={(Object.keys(RESPONSIBILITY_LABELS) as Responsibility[]).map((value) => ({ value, label: RESPONSIBILITY_LABELS[value] }))}
          onChange={(v) => editable && set('responsibility', v)}
        />
        {field('Yapılan İşlemler', draft.yapilanIsler, (v) => set('yapilanIsler', v), area)}
        {field('Ek Notlar', draft.notlar, (v) => set('notlar', v), area)}
      </FormSection>

      <FormSection title="Değişen Parçalar" hint={`${draft.degisenParcalar.length}/${MAX_PARTS}`}>
        {draft.degisenParcalar.length === 0 ? <Text className="font-inter text-sm text-muted-foreground">Değişen parça yok.</Text> : null}
        {draft.degisenParcalar.map((part, index) => {
          const update = (patch: Partial<typeof part>) =>
            set('degisenParcalar', draft.degisenParcalar.map((item, i) => (i === index ? { ...item, ...patch } : item)));
          return (
            <View key={part.id} className="gap-2 border-b border-border pb-3">
              <View className="flex-row items-end gap-2">
                <View className="flex-1">{field(`Parça ${index + 1}`, part.description, (v) => update({ description: v }))}</View>
                {editable ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Parça ${index + 1} satırını kaldır`}
                    onPress={() => set('degisenParcalar', draft.degisenParcalar.filter((_, i) => i !== index))}
                    className="h-11 w-11 items-center justify-center active:opacity-60"
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.destructive} />
                  </Pressable>
                ) : null}
              </View>
              <View className="flex-row gap-2">
                <View className="flex-1">{field('Adet', String(part.quantity), (v) => update({ quantity: num(v) }), { keyboardType: 'number-pad' })}</View>
                <View className="flex-1">{field('Birim Fiyat', String(part.unitPrice), (v) => update({ unitPrice: num(v) }), { keyboardType: 'decimal-pad' })}</View>
              </View>
            </View>
          );
        })}
        {editable && draft.degisenParcalar.length < MAX_PARTS ? (
          <Button
            label="Parça ekle"
            variant="ghost"
            trailingIcon="add"
            onPress={() => set('degisenParcalar', [...draft.degisenParcalar, { id: `part-${Date.now()}`, description: '', quantity: 1, unitPrice: 0 }])}
          />
        ) : null}
      </FormSection>

      <FormSection title="Ücretler">
        <ChoiceChips label="Para Birimi" value={draft.currency} options={CURRENCIES.map((code) => ({ value: code, label: code }))} onChange={(v) => editable && set('currency', v)} />
        <View className="flex-row gap-2">
          <View className="flex-1">{field('Servis Ücreti (İşçilik)', String(draft.servisUcreti), (v) => set('servisUcreti', num(v)), { keyboardType: 'decimal-pad' })}</View>
          <View className="flex-1">{field('Ulaşım Ücreti', String(draft.ulasimUcreti), (v) => set('ulasimUcreti', num(v)), { keyboardType: 'decimal-pad' })}</View>
        </View>
        <View className="flex-row items-center justify-between rounded-control bg-muted px-3 py-2.5">
          <Text className="font-inter text-[13px] text-foreground">Toplam (K.D.V. Hariç)</Text>
          <Text className="font-inter-bold text-[15px] text-foreground">{formatAmount(grandTotal, draft.currency)}</Text>
        </View>
      </FormSection>

      <FormSection title="İmza Bilgileri">
        {field('Servisi Yapan (Ad, Soyad)', draft.kurulumuYapan, (v) => set('kurulumuYapan', v))}
        {field('Tezgahı Teslim Alan (Ad, Soyad)', draft.teslimAlan, (v) => set('teslimAlan', v))}
      </FormSection>

      <View className="gap-2">
        <Button label="Önizleme / PDF" variant="ghost" trailingIcon="document-outline" loading={printing} disabled={pending} onPress={() => void onPrint()} />
        {editable ? (
          <View className="flex-row gap-2">
            <Button className="flex-1" label="Kaydet" variant="ghost" disabled={pending} onPress={onSave} />
            <Button className="flex-1" label="Servisi Kapat" loading={setStage.isPending} disabled={pending} onPress={onClose} />
          </View>
        ) : null}
      </View>
    </>
  );
}
