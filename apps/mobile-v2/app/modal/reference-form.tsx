import { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useCan } from '@/src/auth/AuthProvider';
import type { ReferenceRecord } from '@/src/api/references.api';
import { referenceKeys, useSaveReference } from '@/src/api/references.hooks';
import { EmptyState, Field } from '@/src/ui';
import { ModalForm } from '@/src/ui/documents/pickers';
import { toast } from '@/src/ui/toast';
import { emptyReferenceForm, referenceFormFromRecord, referencePayload, type ReferenceForm } from '@/src/ui/references/referenceLogic';
import { DateTextField } from '@/src/ui/select/DateTextField';
import { BrandSelect, CompanySelect, ContactSelect, DistrictSelect, ProductSelect, ProvinceSelect, companyLabel } from '@/src/ui/select/fields';

export default function ReferenceFormModal() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string }>();
  const editing = params.id ? (queryClient.getQueryData<ReferenceRecord[]>(referenceKeys.list) ?? []).find((r) => r.id === params.id) ?? null : null;
  const canSave = useCan(editing ? 'companies.update' : 'companies.create');
  const canPickCompany = useCan('companies.read');
  const [form, setForm] = useState<ReferenceForm>(() => (editing ? referenceFormFromRecord(editing) : emptyReferenceForm()));
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const save = useSaveReference();

  const set = (key: keyof ReferenceForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  if (params.id && !editing) {
    return (
      <ModalForm title="Referansı Düzenle" submitLabel="Kapat" onSubmit={() => router.back()}>
        <EmptyState title="Referans bulunamadı" hint="Listeyi yenileyip tekrar açın." />
      </ModalForm>
    );
  }

  const submit = () => {
    const result = referencePayload(form);
    if (!result.ok) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    setError(null);
    save.mutate(
      { id: editing?.id, body: result.body },
      {
        onSuccess: () => {
          toast.success(editing ? 'Referans güncellendi' : 'Referans eklendi');
          router.back();
        },
        onError: (err) => toast.error(err.message || 'Referans kaydedilemedi'),
      },
    );
  };

  return (
    <ModalForm
      title={editing ? 'Referansı Düzenle' : 'Yeni Referans'}
      submitLabel={editing ? 'Kaydet' : 'Referans Ekle'}
      onSubmit={submit}
      loading={save.isPending}
      disabled={!canSave}
    >
      <Text className="font-inter text-sm text-muted-foreground">Teslim edilmiş makineyi satış referansı olarak kaydedin.</Text>
      {canPickCompany ? (
        <CompanySelect
          label="Firma *"
          placeholder="Kayıtlı firmadan seçin veya yazın"
          value={form.firm}
          selectedId={companyId}
          onSelect={(item) => {
            const company = item?.data;
            setCompanyId(company?.id ?? null);
            if (!company) return setForm((f) => ({ ...f, firm: item?.label.slice(0, 255) ?? '' }));
            setForm((f) => ({
              ...f,
              firm: companyLabel(company),
              city: f.city || company.primaryAddress?.province || '',
              district: f.district || company.primaryAddress?.district || '',
            }));
          }}
          allowCustom
          clearable
          error={error === 'Firma adı zorunludur' ? error : undefined}
        />
      ) : (
        <Field
          label="Firma *"
          value={form.firm}
          onChangeText={set('firm')}
          placeholder="Firma adı"
          maxLength={255}
          autoComplete="off"
          error={error === 'Firma adı zorunludur' ? error : undefined}
        />
      )}
      {canPickCompany ? (
        <ContactSelect
          label="İlgili"
          placeholder={companyId ? 'Firmanın kontağını seçin veya yazın' : 'İlgili kişiyi yazın'}
          companyId={companyId}
          value={form.contact}
          onSelect={(item) => set('contact')(item?.label.slice(0, 255) ?? '')}
          allowCustom
          clearable
        />
      ) : (
        <Field label="İlgili" value={form.contact} onChangeText={set('contact')} maxLength={255} />
      )}
      <ProvinceSelect value={form.city} onChange={set('city')} />
      <DistrictSelect province={form.city} value={form.district} onChange={set('district')} />
      <BrandSelect label="Tezgah Markası" value={form.brand} onSelect={(item) => set('brand')(item?.label.slice(0, 128) ?? '')} />
      <ProductSelect
        label="Tezgah Modeli"
        placeholder="Katalogdan model seçin veya yazın"
        value={form.model}
        onSelect={(item) => {
          const product = item?.data;
          if (!product) return set('model')(item?.label.slice(0, 128) ?? '');
          setForm((f) => ({
            ...f,
            model: (product.modelName ?? product.modelCode ?? product.fullName).slice(0, 128),
            brand: f.brand || product.brand?.name || '',
          }));
        }}
        clearable
      />
      <DateTextField
        label="Teslim Tarihi"
        value={form.deliveryDate}
        onChangeText={set('deliveryDate')}
        error={error && error !== 'Firma adı zorunludur' ? error : undefined}
      />
      <Field label="Notlar" value={form.notes} onChangeText={set('notes')} maxLength={4000} multiline numberOfLines={3} style={{ minHeight: 80, textAlignVertical: 'top' }} />
    </ModalForm>
  );
}
