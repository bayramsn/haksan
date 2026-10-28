import { OpportunityPickerSheet } from '@/src/ui/documents/pickers';
import { PickerField } from '@/src/ui/pickers/PickerField';
import type { SheetHandle } from '@/src/ui/pickers/HostedSheet';
import { useRef, useState } from 'react';
import { Field } from '@/src/ui';
import { CompanyPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { BrandSelect, ContactSelect, UserSelect } from '@/src/ui/select/fields';
import { ChoiceChips, DayField, DevicePicker, FormSection } from './fields';
import { DELIVERY_STATUS_LABELS, suggestedFormNo, type DeliveryDraft } from './logistics';

const STATUS_OPTIONS = (['pending', 'completed'] as const).map((value) => ({ value, label: DELIVERY_STATUS_LABELS[value]! }));

/** Web DeliveryFormFields: müşteri, satış kartı, makine, tarihler, tezgah/CNC ve imza alanları. */
export function DeliveryFormFields({
  draft,
  onChange,
  companyName,
  companyError,
}: {
  draft: DeliveryDraft;
  onChange: (next: DeliveryDraft) => void;
  companyName?: string;
  companyError?: string;
}) {
  const [company, setCompany] = useState<PickedRecord | null>(
    draft.companyId ? { id: draft.companyId, name: companyName || 'Seçili firma' } : null,
  );
  const opportunitySheet = useRef<SheetHandle>(null);
  const [opportunityLabel, setOpportunityLabel] = useState('');

  const set = <K extends keyof DeliveryDraft>(key: K, value: DeliveryDraft[K]) => onChange({ ...draft, [key]: value });
  const text = (label: string, key: keyof DeliveryDraft, extra?: { placeholder?: string; maxLength?: number }) => (
    <Field label={label} value={String(draft[key] ?? '')} onChangeText={(value) => set(key, value as never)} maxLength={extra?.maxLength ?? 255} placeholder={extra?.placeholder} />
  );

  return (
    <>
      <FormSection title="Müşteri">
        <CompanyPicker
          label="Müşteri *"
          placeholder="Müşteri seçin..."
          value={company}
          error={companyError}
          onChange={(next) => {
            setCompany(next);
            setOpportunityLabel('');
            onChange({ ...draft, companyId: next?.id ?? '', opportunityId: '', machineId: '', ilgili: '', signedBy: '', tezgahMarka: '', tezgahTip: '', tezgahModel: '', tezgahSeriNo: '', cncMarka: '', cncModel: '', cncSeriNo: '', technicalSpecs: [] });
          }}
        />
        <PickerField label="Satış Kartı" value={draft.opportunityId ? opportunityLabel || 'Seçili satış kartı' : ''}
              placeholder={draft.companyId ? 'Bağımsız kayıt' : 'Önce müşteri seçin'} icon="briefcase-outline" disabled={!draft.companyId}
              onPress={() => opportunitySheet.current?.present()} onClear={() => { set('opportunityId', ''); setOpportunityLabel(''); }} />

        <DevicePicker
          label="Makine / Tezgah"
          companyId={draft.companyId || null}
          value={draft.machineId || null}
          onChange={(device) => {
            if (!device) return onChange({ ...draft, machineId: '', technicalSpecs: [] });
            const [cncBrand = '', ...cncModel] = (device.controlUnit ?? '').split(' ');
            onChange({
              ...draft,
              machineId: device.id,
              formNo: draft.formNo || suggestedFormNo(device.id),
              tezgahMarka: device.brand ?? '',
              tezgahTip: device.productTypeName ?? '',
              tezgahModel: device.model ?? '',
              tezgahSeriNo: device.serialNumber ?? '',
              cncMarka: cncBrand,
              cncModel: cncModel.join(' '),
              cncSeriNo: device.controlUnitSerialNumber ?? '',
            });
          }}
        />
      </FormSection>

      <FormSection title="Tarihler & Form">
        <DayField label="Tezgah Teslim Tarihi" value={draft.deliveryDate} clearable={false} onChange={(value) => set('deliveryDate', value)} />
        <DayField label="Tezgah Kurulum Tarihi" value={draft.kurulumTarihi} onChange={(value) => set('kurulumTarihi', value)} />
        {text('Form No', 'formNo', { placeholder: '00001', maxLength: 64 })}
      </FormSection>

      <FormSection title="Tezgah Bilgileri">
        <BrandSelect label="Tezgah Markası" value={draft.tezgahMarka} onSelect={(item) => set('tezgahMarka', item?.label.slice(0, 255) ?? '')} />
        {text('Tezgah Tipi', 'tezgahTip')}
        {text('Tezgah Modeli', 'tezgahModel')}
        {text('Tezgah Seri No', 'tezgahSeriNo')}
      </FormSection>

      <FormSection title="Kontrol Ünitesi Bilgileri">
        {text('Cnc Markası', 'cncMarka')}
        {text('Cnc Modeli', 'cncModel')}
        {text('Cnc Seri No', 'cncSeriNo')}
        {text('Cnc Main S/W', 'cncMainSw')}
      </FormSection>

      {draft.technicalSpecs.length ? (
        <FormSection title="Teknik Bilgiler">
          {draft.technicalSpecs.map((spec) => (
            <Field key={spec.key} label={spec.key} value={[spec.value, spec.unit].filter(Boolean).join(' ')} editable={false} />
          ))}
        </FormSection>
      ) : null}

      <FormSection title="İmza Bilgileri">
        <ContactSelect
          label="İlgili Kişi"
          placeholder={draft.companyId ? 'Firmanın kontağını seçin veya yazın' : 'İlgili kişiyi yazın'}
          companyId={draft.companyId || null}
          value={draft.ilgili}
          onSelect={(item) => set('ilgili', item?.label.slice(0, 255) ?? '')}
          allowCustom
          clearable
        />
        <UserSelect label="Kurulumu Yapan" value={draft.kurulumuYapan} onSelect={(item) => set('kurulumuYapan', item?.label.slice(0, 255) ?? '')} />
        <ContactSelect
          label="Tezgahı Teslim Alan"
          placeholder={draft.companyId ? 'Kontak seçin veya ad soyad yazın' : 'Ad Soyad'}
          companyId={draft.companyId || null}
          value={draft.signedBy}
          onSelect={(item) => set('signedBy', item?.label.slice(0, 255) ?? '')}
          allowCustom
          clearable
        />
        <ChoiceChips label="Durum" value={draft.status} options={STATUS_OPTIONS} onChange={(value) => set('status', value)} />
        <Field
          label="Notlar"
          value={draft.notes}
          onChangeText={(value) => set('notes', value)}
          multiline
          maxLength={2000}
          style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }}
        />
      </FormSection>
      <OpportunityPickerSheet sheetRef={opportunitySheet} companyId={draft.companyId || null} view="all" selectedId={draft.opportunityId}
        onSelect={(row) => { set('opportunityId', row.id); setOpportunityLabel(row.title); }} />
    </>
  );
}
