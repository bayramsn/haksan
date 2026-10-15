import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/src/api/admin.api';
import { adminKeys, useLookupRows } from '@/src/api/admin.hooks';
import { apiBaseUrl } from '@/src/api/config';
import { useAuth } from '@/src/auth/AuthProvider';
import { resolveMediaUrl } from '@/src/lib/mediaUrl';
import { useTheme } from '@/src/theme/theme';
import { Button, Eyebrow, Field } from '@/src/ui';
import { CompanyPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ActionPill, ChipSelect, SwitchRow } from '@/src/ui/admin/controls';
import { BRAND_LOOKUP } from '@/src/ui/admin/lookup-meta';
import { Help, ModalShell } from '@/src/ui/admin/ModalShell';
import { pickBrandLogo, uploadBrandLogo, type PickedSignatureImage } from '@/src/ui/admin/signature-upload';

type CatalogCode = 'AORE_LASER' | '';

export default function LookupBrandModal() {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; divisionId?: string }>();
  const { user } = useAuth();
  const access = useAdminAccess();
  const divisions = user?.divisions ?? [];
  const rows = useLookupRows(BRAND_LOOKUP, { divisionId: params.divisionId ?? '' }, access.isSuperAdmin && Boolean(params.id));
  const editing = params.id ? rows.data?.find((row) => row.id === params.id) : undefined;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [divisionId, setDivisionId] = useState(params.divisionId && params.divisionId !== 'all' ? params.divisionId : '');
  const [owned, setOwned] = useState(true);
  const [company, setCompany] = useState<PickedRecord | null>(null);
  const [supplier, setSupplier] = useState<PickedRecord | null>(null);
  const [catalogCode, setCatalogCode] = useState<CatalogCode>('');
  const [logo, setLogo] = useState<PickedSignatureImage | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setName(editing.name ?? '');
    setDescription(editing.description ?? '');
    setDivisionId(editing.divisionId ?? '');
    setOwned(Boolean(editing.isOwned));
    setCompany(!editing.isOwned && editing.companyId ? { id: editing.companyId, name: editing.companyName ?? 'Firma' } : null);
    setSupplier(editing.supplierCompanyId ? { id: editing.supplierCompanyId, name: editing.supplierCompanyName ?? 'Tedarikçi' } : null);
    setCatalogCode(editing.technicalCatalogCode ?? '');
  }, [editing]);

  const preview = logo ? logo.uri : removeLogo ? null : resolveMediaUrl(editing?.logoUrl, apiBaseUrl());

  const chooseLogo = async () => {
    try {
      const picked = await pickBrandLogo();
      if (!picked) return;
      setLogo(picked);
      setRemoveLogo(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Logo okunamadı.');
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.error('Marka adı zorunludur');
    if (!owned && !company) return toast.error('Markanın bağlı olduğu firmayı seçin');
    const base = {
      name: trimmed,
      description: description.trim() || undefined,
      divisionId: divisionId || null,
      companyId: owned ? null : company?.id ?? null,
      supplierCompanyId: supplier?.id ?? null,
      technicalCatalogCode: catalogCode || null,
      isOwned: owned,
    };
    let createdId: string | null = null;
    setSaving(true);
    try {
      if (editing) {
        const logoFileId = logo ? await uploadBrandLogo(editing.id, logo) : removeLogo ? null : undefined;
        await adminApi.updateLookup(BRAND_LOOKUP, editing.id, { ...base, ...(logoFileId === undefined ? {} : { logoFileId }) });
        toast.success('Marka güncellendi');
      } else {
        const created = await adminApi.createLookup(BRAND_LOOKUP, { ...base, isActive: true });
        createdId = created?.id ?? null;
        if (logo && createdId) {
          const logoFileId = await uploadBrandLogo(createdId, logo);
          await adminApi.updateLookup(BRAND_LOOKUP, createdId, { logoFileId });
        }
        toast.success('Marka eklendi');
      }
      router.back();
    } catch (err) {
      if (!editing && createdId) {
        toast.info('Marka oluşturuldu fakat logo yüklenemedi. Markayı düzenleyerek logoyu yeniden yükleyebilirsiniz.');
        router.back();
        return;
      }
      toast.error(`${editing ? 'Marka güncellenemedi' : 'Marka eklenemedi'}: ${err instanceof Error ? err.message : 'API isteği başarısız oldu.'}`);
    } finally {
      setSaving(false);
      void qc.invalidateQueries({ queryKey: adminKeys.lookupsOf(BRAND_LOOKUP) });
      void qc.invalidateQueries({ queryKey: adminKeys.audit(`lookup:${BRAND_LOOKUP}`) });
    }
  };

  return (
    <ModalShell
      title={params.id ? 'Ürün Markasını Düzenle' : 'Yeni Ürün Markası'}
      allowed={access.isSuperAdmin}
      loading={!!params.id && rows.isPending}
      error={params.id ? rows.error?.message ?? (rows.data && !editing ? 'Marka bulunamadı' : null) : null}
      onRetry={() => void rows.refetch()}
      description="Marka adı, sahibi, kullanılacağı bölüm ve görsel kimliğini tek kayıtta yönetin."
    >
      <View className="gap-2">
        <Eyebrow>Marka Logosu</Eyebrow>
        <View className="flex-row items-center gap-3">
          <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-control border border-dashed border-border bg-card p-2">
            {preview ? (
              <Image source={{ uri: preview }} accessibilityLabel={`${name || 'Marka'} logosu`} resizeMode="contain" className="h-20 w-20" />
            ) : (
              <View className="items-center gap-1">
                <Ionicons name="image-outline" size={24} color={colors.mutedForeground} />
                <Text className="font-inter text-[11px] text-muted-foreground">Logo seçilmedi</Text>
              </View>
            )}
          </View>
          <View className="flex-1 gap-2">
            <ActionPill icon="cloud-upload-outline" label="Fotoğraf seç" disabled={saving} onPress={() => void chooseLogo()} />
            {preview ? (
              <ActionPill
                icon="trash-outline"
                tone="destructive"
                label="Logoyu kaldır"
                disabled={saving}
                onPress={() => {
                  setLogo(null);
                  setRemoveLogo(true);
                }}
              />
            ) : null}
          </View>
        </View>
        <Help>PNG, JPG veya WEBP · en fazla 5 MB</Help>
      </View>
      <Field label="Marka Adı" value={name} onChangeText={setName} placeholder="Örn. HAXAN" maxLength={255} editable={!saving} />
      <View className="gap-2">
        <Eyebrow>Marka Sahibi</Eyebrow>
        <SwitchRow title="Haksan Makina" subtitle="Kendi firmamız" value={owned} onValueChange={setOwned} disabled={saving} />
        {!owned ? <CompanyPicker label="Marka sahibi firma" value={company} onChange={setCompany} placeholder="Firma seçin..." disabled={saving} /> : null}
        <Help>Markanın sahibi seçilir; ürünün tedarikçisi aşağıda ayrıca belirlenir.</Help>
      </View>
      <View className="gap-1.5">
        <CompanyPicker label="Varsayılan Tedarikçi" value={supplier} onChange={setSupplier} placeholder="Tedarikçi firma seçin" disabled={saving} />
        <Help>Örn. HEXLASER markasının tedarikçisi AORE olabilir.</Help>
      </View>
      <ChipSelect<CatalogCode>
        label="Teknik Bilgi Kaynağı"
        options={[
          { value: '', label: 'Elle yönetilen teknik bilgiler' },
          { value: 'AORE_LASER', label: 'AORE lazer katalog / Excel kaynağı' },
        ]}
        value={catalogCode}
        onChange={setCatalogCode}
        disabled={saving}
      />
      <ChipSelect
        label="Markanın Bağlı Olduğu Bölüm"
        options={[{ value: '', label: 'Tümü (tüm bölümlerde kullanılır)' }, ...divisions.map((d) => ({ value: d.id, label: d.name }))]}
        value={divisionId}
        onChange={setDivisionId}
        disabled={saving}
      />
      <Field
        label="Açıklama / Not"
        value={description}
        onChangeText={setDescription}
        placeholder="Marka hakkında kısa not (isteğe bağlı)"
        maxLength={2000}
        editable={!saving}
      />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="Vazgeç" variant="ghost" disabled={saving} onPress={() => router.back()} />
        </View>
        <View className="flex-1">
          <Button
            label={saving ? 'Kaydediliyor…' : params.id ? 'Değişiklikleri Kaydet' : 'Markayı Oluştur'}
            loading={saving}
            onPress={() => void save()}
          />
        </View>
      </View>
    </ModalShell>
  );
}
