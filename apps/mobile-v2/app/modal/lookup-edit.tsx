import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLookupRows, useUpdateLookup } from '@/src/api/admin.hooks';
import { useAuth } from '@/src/auth/AuthProvider';
import { Button, Field } from '@/src/ui';
import { OptionPicker, MultiOptionPicker } from '@/src/ui/pickers/OptionPicker';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { SwitchRow } from '@/src/ui/admin/controls';
import { DIVISION_SCOPED_LOOKUPS, LOOKUP_PARENTS, SPEC_GROUP_LOOKUP, TAX_OFFICE_LOOKUP, lookupLabel } from '@/src/ui/admin/lookup-meta';
import { Help, ModalShell } from '@/src/ui/admin/ModalShell';
import { ProvinceSelect } from '@/src/ui/select/fields';

type EditForm = {
  name: string;
  description: string;
  province: string;
  isActive: boolean;
  code: string;
  divisionId: string;
  parentId: string;
  productTypeIds: string[];
};

export default function LookupEditModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name: string; id: string; divisionId?: string }>();
  const name = params.name ?? '';
  const { user } = useAuth();
  const access = useAdminAccess();
  const divisions = user?.divisions ?? [];
  const scoped = DIVISION_SCOPED_LOOKUPS.has(name);
  const parent = LOOKUP_PARENTS[name];
  const isSpecGroup = name === SPEC_GROUP_LOOKUP;
  const isTaxOffice = name === TAX_OFFICE_LOOKUP;
  const label = lookupLabel(name);

  const rows = useLookupRows(name, scoped ? { divisionId: params.divisionId ?? '' } : undefined, access.isSuperAdmin);
  const row = rows.data?.find((item) => item.id === params.id);
  const update = useUpdateLookup(name);
  const [form, setForm] = useState<EditForm | null>(null);

  useEffect(() => {
    if (!row || form) return;
    setForm({
      name: row.name ?? '',
      description: row.description ?? '',
      province: row.province ?? '',
      isActive: row.isActive !== false,
      code: row.code ?? '',
      divisionId: row.divisionId ?? '',
      parentId: parent ? row[parent.field] ?? '' : '',
      productTypeIds: row.productTypeIds ?? [],
    });
  }, [row, form, parent]);

  const relationQuery = form?.divisionId ? { divisionId: form.divisionId } : undefined;
  const parentRows = useLookupRows(parent?.lookup ?? '', relationQuery, access.isSuperAdmin && Boolean(parent) && Boolean(form));
  const typeRows = useLookupRows('product-types', relationQuery, access.isSuperAdmin && isSpecGroup && Boolean(form));
  const inScope = <T extends { isActive?: boolean; divisionId?: string | null }>(items: T[] | undefined) =>
    (items ?? []).filter(
      (item) => item.isActive !== false && (form?.divisionId ? !item.divisionId || item.divisionId === form.divisionId : !item.divisionId)
    );
  const parentOptions = useMemo(() => {
    const list = inScope(parentRows.data).map((item) => ({ value: item.id, label: item.name }));
    if (form?.parentId && !list.some((option) => option.value === form.parentId))
      list.push({ value: form.parentId, label: 'Mevcut üst kayıt (başka bölümde)' });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentRows.data, form?.divisionId, form?.parentId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const typeOptions = useMemo(() => inScope(typeRows.data).map((item) => ({ value: item.id, label: item.name })), [typeRows.data, form?.divisionId]);

  const set = (patch: Partial<EditForm>) => setForm((current) => (current ? { ...current, ...patch } : current));

  const save = () => {
    if (!form || !row) return;
    if (!form.name.trim()) return toast.error('Ad alanı zorunludur');
    if (isTaxOffice && !form.province.trim()) return toast.error('Vergi dairesi için il zorunludur');
    update.mutate(
      {
        id: row.id,
        body: {
          name: form.name,
          description: form.description,
          province: isTaxOffice ? form.province : undefined,
          divisionId: scoped ? form.divisionId || null : undefined,
          parentId: parent ? form.parentId || null : undefined,
          productTypeIds: isSpecGroup ? form.productTypeIds : undefined,
          isActive: form.isActive,
        },
      },
      {
        onSuccess: () => {
          toast.success('Kayıt güncellendi');
          router.back();
        },
        onError: (err) => toast.error(`Kayıt kaydedilemedi: ${err.message || 'API isteği başarısız oldu.'}`),
      }
    );
  };

  return (
    <ModalShell
      title={`${label} — Düzenle`}
      allowed={access.isSuperAdmin}
      loading={rows.isPending || (!!row && !form)}
      error={rows.error?.message ?? (rows.data && !row ? 'Kayıt bulunamadı' : null)}
      onRetry={() => void rows.refetch()}
      description={
        form?.divisionId
          ? `Bu kayıt ${divisions.find((d) => d.id === form.divisionId)?.name ?? 'Bölüm'} bölümüne bağlıdır.`
          : scoped
            ? 'Bu kayıt tüm bölümlerde ortaktır.'
            : 'Kayıt bilgilerini güncelleyin.'
      }
    >
      {form ? (
        <>
          <Field label="Ad" value={form.name} onChangeText={(value) => set({ name: value })} maxLength={255} />
          {isTaxOffice ? <ProvinceSelect label="İl" value={form.province} onChange={(value) => set({ province: value })} /> : null}
          {scoped ? (
            <View className="gap-1.5">
              <OptionPicker
                label="Bağlı olduğu bölüm"
                value={form.divisionId || null}
                options={divisions.map((d) => ({ value: d.id, label: d.name }))}
                placeholder="Tümü (ortak kayıt)"
                clearable
                onChange={(value) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          divisionId: value ?? '',
                          parentId: (value ?? '') === current.divisionId ? current.parentId : '',
                          productTypeIds: (value ?? '') === current.divisionId ? current.productTypeIds : [],
                        }
                      : current
                  )
                }
              />
              <Help>Bölümü değiştirirseniz üst kayıt ve ürün tipi bağlantılarını yeni bölüme göre yeniden seçin.</Help>
            </View>
          ) : null}
          {parent ? (
            <OptionPicker
              label={`Bağlı olduğu ${parent.label}`}
              value={form.parentId || null}
              options={parentOptions}
              placeholder="Tümü (bağımsız)"
              searchable
              clearable
              onChange={(value) => set({ parentId: value ?? '' })}
            />
          ) : null}
          {isSpecGroup ? (
            <View className="gap-1.5">
              <MultiOptionPicker
                label="Atandığı Ürün Tipleri"
                values={form.productTypeIds}
                options={typeOptions}
                placeholder="Ürün tipi seçin"
                onChange={(values) => set({ productTypeIds: values })}
              />
              <Help>Bu grup yalnızca seçilen ürün tiplerinin teknik bilgi ekranlarında önerilir. Boş bırakılırsa tüm tiplerde geçerlidir.</Help>
            </View>
          ) : null}
          <Field label="Açıklama" value={form.description} onChangeText={(value) => set({ description: value })} maxLength={2000} multiline />
          <Field label="Sistem kodu" value={form.code} editable={false} />
          <SwitchRow title="Aktif" value={form.isActive} onValueChange={(value) => set({ isActive: value })} />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button label="Vazgeç" variant="ghost" disabled={update.isPending} onPress={() => router.back()} />
            </View>
            <View className="flex-1">
              <Button label="Kaydet" loading={update.isPending} onPress={save} />
            </View>
          </View>
        </>
      ) : null}
    </ModalShell>
  );
}
