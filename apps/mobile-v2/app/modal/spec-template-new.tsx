import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  useBulkCreateSpecTemplates,
  useCreateMachineTemplate,
  useLookupRows,
  useSpecTemplates,
} from '@/src/api/admin.hooks';
import { Button, Card, Eyebrow, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { useAdminAccess } from '@/src/ui/admin/access';
import { CheckRow, Notice } from '@/src/ui/admin/controls';
import { Help, ModalShell } from '@/src/ui/admin/ModalShell';
import { buildSpecDraft, sameTypeCode, typeCodeFromName } from '@/src/ui/admin/spec-template-model';

const NEW_TYPE = '__new__';
type StartMode = 'blank' | 'copy';

export default function SpecTemplateNewModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ divisionId?: string }>();
  const divisionId = params.divisionId ? String(params.divisionId) : '';
  const access = useAdminAccess();
  const allowed = access.isSuperAdmin;
  const scope = divisionId ? { divisionId } : undefined;
  const categories = useLookupRows('product-categories', scope, allowed);
  const subcategories = useLookupRows('product-subcategories', scope, allowed);
  const types = useLookupRows('product-types', scope, allowed);
  const specs = useSpecTemplates(scope ?? {}, allowed);
  const bulkCreate = useBulkCreateSpecTemplates();
  const createType = useCreateMachineTemplate();

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [targetTypeCode, setTargetTypeCode] = useState<string | null>(null);
  const [newTypeName, setNewTypeName] = useState('');
  const [startMode, setStartMode] = useState<StartMode>('blank');
  const [sourceTypeCode, setSourceTypeCode] = useState<string | null>(null);

  const activeCategories = useMemo(() => (categories.data ?? []).filter((row) => row.isActive !== false), [categories.data]);
  const scopedSubcategories = useMemo(
    () => (subcategories.data ?? []).filter((row) => row.isActive !== false && row.categoryId === categoryId),
    [categoryId, subcategories.data]
  );
  const activeTypes = useMemo(() => (types.data ?? []).filter((row) => row.isActive !== false), [types.data]);
  const scopedTypes = useMemo(() => activeTypes.filter((row) => row.subcategoryId === subcategoryId), [activeTypes, subcategoryId]);
  const isNewType = targetTypeCode === NEW_TYPE;
  const targetType = activeTypes.find((row) => sameTypeCode(row.code, targetTypeCode));
  const copySourceTypes = activeTypes.filter((row) => !sameTypeCode(row.code, targetTypeCode));

  useEffect(() => {
    if (categoryId || !activeCategories.length) return;
    setCategoryId(activeCategories[0]?.id ?? null);
  }, [activeCategories, categoryId]);
  useEffect(() => {
    if (scopedSubcategories.some((row) => row.id === subcategoryId)) return;
    setSubcategoryId(scopedSubcategories[0]?.id ?? null);
  }, [scopedSubcategories, subcategoryId]);
  useEffect(() => {
    if (targetTypeCode === NEW_TYPE || scopedTypes.some((row) => sameTypeCode(row.code, targetTypeCode))) return;
    setTargetTypeCode(scopedTypes[0]?.code ?? null);
  }, [scopedTypes, targetTypeCode]);

  const activeRows = (code: string | null) =>
    code ? buildSpecDraft(code, specs.data ?? []).filter((row) => row.isActive && !row.isDeleted) : [];
  const sourceRows = startMode === 'copy' ? activeRows(sourceTypeCode) : [];
  const previewFieldCount = startMode === 'copy' ? sourceRows.length : isNewType ? 0 : activeRows(targetTypeCode).length;
  const busy = bulkCreate.isPending || createType.isPending;
  const canCreate =
    !busy &&
    Boolean(divisionId) &&
    Boolean(categoryId) &&
    Boolean(subcategoryId) &&
    (isNewType ? newTypeName.trim().length >= 2 : Boolean(targetType)) &&
    (startMode === 'blank' || Boolean(sourceTypeCode && copySourceTypes.length));

  const openEditor = (code: string, label: string) =>
    router.replace(
      `/(tabs)/more/settings/spec-templates/${encodeURIComponent(code)}?name=${encodeURIComponent(label)}&divisionId=${divisionId}` as Href
    );

  const submit = async () => {
    if (!divisionId) {
      toast.error('Bölüm bağlantısı bulunamadı. Yeni ürün şablonu açmak için seçili ürün ailesinin aktif bir bölümü olmalıdır.');
      return;
    }
    if (!canCreate) return;
    try {
      if (isNewType) {
        const name = newTypeName.trim();
        const result = await createType.mutateAsync({
          name,
          code: typeCodeFromName(name),
          divisionId,
          subcategoryId: subcategoryId!,
          fields: sourceRows.map((row, index) => ({
            specKey: row.specKey.trim(),
            specGroupCode: row.groupCode || undefined,
            defaultValue: row.defaultValue || undefined,
            specUnit: row.unit || undefined,
            specOptions: row.specOptions.length ? row.specOptions : undefined,
            sortOrder: index,
            isActive: true,
            isDeleted: false,
          })),
        });
        toast.success(
          `Ürün şablonu açıldı. ${result.type.name} · ${sourceRows.length ? `${result.specs.length} teknik alan kopyalandı.` : 'çalışma sayfası hazır.'}`
        );
        openEditor(result.type.code, result.type.name);
        return;
      }
      if (!targetType) {
        toast.error('Ürün tipi seçimi geçersiz');
        return;
      }
      let copiedCount = 0;
      if (sourceRows.length) {
        const result = await bulkCreate.mutateAsync(
          sourceRows.map((row, index) => ({
            productTypeCode: targetType.code,
            specKey: row.specKey.trim(),
            specGroupCode: row.groupCode || undefined,
            defaultValue: row.defaultValue || undefined,
            specUnit: row.unit || undefined,
            divisionId,
            sortOrder: index,
            isActive: true,
            isDeleted: false,
          }))
        );
        copiedCount = result.created;
      }
      toast.success(
        `Ürün şablonu açıldı. ${targetType.name} · ${sourceRows.length ? `${copiedCount} teknik alan kopyalandı.` : 'çalışma sayfası hazır.'}`
      );
      openEditor(targetType.code, targetType.name);
    } catch (err) {
      toast.error(`Ürün şablonu oluşturulamadı: ${err instanceof Error ? err.message : 'API isteği başarısız oldu.'}`);
    }
  };

  const error = categories.error ?? subcategories.error ?? types.error ?? specs.error;
  const category = activeCategories.find((row) => row.id === categoryId);
  const subcategory = scopedSubcategories.find((row) => row.id === subcategoryId);

  return (
    <ModalShell
      title="Ürün şablonu aç"
      description="Ürün kategorisi, alt kategorisi ve tipini eşleştirerek teknik çalışma sayfası ekleyin."
      allowed={allowed}
      loading={categories.isPending || subcategories.isPending || types.isPending || specs.isPending}
      error={error ? `Teknik şablonlar yüklenemedi: ${error.message}` : null}
      onRetry={() => {
        void categories.refetch();
        void subcategories.refetch();
        void types.refetch();
        void specs.refetch();
      }}
    >
      {!divisionId ? (
        <Notice tone="warning" title="Bölüm bağlantısı bulunamadı">
          Yeni ürün şablonu açmak için seçili ürün ailesinin aktif bir bölümü olmalıdır.
        </Notice>
      ) : null}

      <Eyebrow>01 · Ürün eşleşmesi</Eyebrow>
      <OptionPicker
        label="Ürün kategorisi"
        value={categoryId}
        options={activeCategories.map((row) => ({ value: row.id, label: row.name }))}
        placeholder="Kategori bulunamadı"
        searchable
        onChange={(value) => setCategoryId(value)}
      />
      <OptionPicker
        label="Ürün alt kategorisi"
        value={subcategoryId}
        options={scopedSubcategories.map((row) => ({ value: row.id, label: row.name }))}
        placeholder="Alt kategori bulunamadı"
        searchable
        onChange={(value) => setSubcategoryId(value)}
      />
      <OptionPicker
        label="Ürün tipi"
        value={targetTypeCode}
        options={[
          ...scopedTypes.map((row) => ({ value: row.code, label: row.name })),
          { value: NEW_TYPE, label: '+ Yeni ürün tipi oluştur' },
        ]}
        placeholder="Ürün tipi bulunamadı"
        searchable
        onChange={(value) => setTargetTypeCode(value)}
      />
      {isNewType ? (
        <Field
          label="Ürün tipi adı"
          value={newTypeName}
          onChangeText={setNewTypeName}
          maxLength={255}
          placeholder="Örn. CNC Dik İşleme Merkezi"
          error={newTypeName && newTypeName.trim().length < 2 ? 'En az 2 karakter girin' : undefined}
        />
      ) : null}

      <Eyebrow>02 · Başlangıç düzeni</Eyebrow>
      <CheckRow
        title="Seçili düzenle aç"
        subtitle="Kayıtlı alanları açın; alan yoksa boş çalışma sayfasıyla başlayın."
        checked={startMode === 'blank'}
        onToggle={() => setStartMode('blank')}
      />
      <CheckRow
        title="Mevcut şablondan kopyala"
        subtitle="Alanları ve varsayılan birimleri başlangıç olarak alın."
        checked={startMode === 'copy'}
        onToggle={() => setStartMode('copy')}
      />
      {startMode === 'copy' ? (
        <OptionPicker
          label="Kaynak ürün şablonu"
          value={sourceTypeCode}
          options={copySourceTypes.map((row) => ({ value: row.code, label: row.name }))}
          placeholder={copySourceTypes.length ? 'Seçin' : 'Kopyalanabilecek başka şablon yok'}
          searchable
          onChange={(value) => setSourceTypeCode(value)}
        />
      ) : null}

      <Card className="gap-1.5 p-3.5">
        {[
          ['Kategori', category?.name ?? '—'],
          ['Alt kategori', subcategory?.name ?? '—'],
          ['Başlangıç alanı', String(previewFieldCount)],
        ].map(([label, value]) => (
          <View key={label} className="flex-row justify-between gap-3">
            <Text className="font-inter text-[13px] text-muted-foreground">{label}</Text>
            <Text className="shrink font-inter-semibold text-[13px] text-foreground" numberOfLines={1}>
              {value}
            </Text>
          </View>
        ))}
      </Card>
      <Help>Seçim tamamlandığında eşleşen teknik çalışma sayfası açılır. Sonraki adımda alanları düzenleyip kaydedebilirsiniz.</Help>

      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="Vazgeç" variant="ghost" disabled={busy} onPress={() => router.back()} />
        </View>
        <View className="flex-1">
          <Button label={busy ? 'Şablon açılıyor' : 'Şablonu aç'} loading={busy} disabled={!canCreate} onPress={() => void submit()} />
        </View>
      </View>
    </ModalShell>
  );
}
