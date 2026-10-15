import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useCan } from '@/src/auth/AuthProvider';
import type { ReferenceRecord } from '@/src/api/references.api';
import { referenceKeys, useSaveReference } from '@/src/api/references.hooks';
import { useTheme } from '@/src/theme/theme';
import { EmptyState, Field } from '@/src/ui';
import { CompanyPickerSheet, ModalForm } from '@/src/ui/documents/pickers';
import { toast } from '@/src/ui/toast';
import { emptyReferenceForm, referenceFormFromRecord, referencePayload, type ReferenceForm } from '@/src/ui/references/referenceLogic';

export default function ReferenceFormModal() {
  const router = useRouter();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string }>();
  const editing = params.id ? (queryClient.getQueryData<ReferenceRecord[]>(referenceKeys.list) ?? []).find((r) => r.id === params.id) ?? null : null;
  const canSave = useCan(editing ? 'companies.update' : 'companies.create');
  const canPickCompany = useCan('companies.read');
  const [form, setForm] = useState<ReferenceForm>(() => (editing ? referenceFormFromRecord(editing) : emptyReferenceForm()));
  const [error, setError] = useState<string | null>(null);
  const companySheet = useRef<BottomSheetModal>(null);
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
      <View className="gap-1.5">
        <Field
          label="Firma *"
          value={form.firm}
          onChangeText={set('firm')}
          placeholder="Firma adı yazın veya listeden seçin"
          maxLength={255}
          autoComplete="off"
          error={error === 'Firma adı zorunludur' ? error : undefined}
        />
        {canPickCompany ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kayıtlı firmalardan seç"
            onPress={() => companySheet.current?.present()}
            className="min-h-[44px] flex-row items-center gap-1.5 self-start active:opacity-60"
          >
            <Ionicons name="business-outline" size={16} color={colors.primary} />
            <Text className="font-inter-medium text-sm text-primary">Kayıtlı firmalardan seç</Text>
          </Pressable>
        ) : null}
      </View>
      <Field label="İlgili" value={form.contact} onChangeText={set('contact')} maxLength={255} />
      <Field label="İlçe" value={form.district} onChangeText={set('district')} maxLength={128} />
      <Field label="İl" value={form.city} onChangeText={set('city')} maxLength={128} />
      <Field label="Tezgah Markası" value={form.brand} onChangeText={set('brand')} maxLength={128} />
      <Field label="Tezgah Modeli" value={form.model} onChangeText={set('model')} maxLength={128} />
      <Field
        label="Teslim Tarihi"
        value={form.deliveryDate}
        onChangeText={set('deliveryDate')}
        placeholder="YYYY-AA-GG"
        maxLength={10}
        keyboardType="numbers-and-punctuation"
        error={error && error !== 'Firma adı zorunludur' ? error : undefined}
      />
      <Field label="Notlar" value={form.notes} onChangeText={set('notes')} maxLength={4000} multiline numberOfLines={3} style={{ minHeight: 80, textAlignVertical: 'top' }} />
      {canPickCompany ? (
        <CompanyPickerSheet
          sheetRef={companySheet}
          onSelect={(company) =>
            setForm((f) => ({
              ...f,
              firm: company.shortName ?? company.legalTitle,
              city: f.city || company.primaryAddress?.province || '',
              district: f.district || company.primaryAddress?.district || '',
            }))
          }
        />
      ) : null}
    </ModalForm>
  );
}
