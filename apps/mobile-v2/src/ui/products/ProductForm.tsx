import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Redirect, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/auth/AuthProvider';
import { activeScope } from '@/src/auth/scope';
import { useLookup } from '@/src/api/crm.hooks';
import { useProduct, useUpdateProduct } from '@/src/api/inventory.hooks';
import {
  useAllProducts,
  useBrands,
  useCreateProduct,
  useProductEquipment,
  useProductSpecs,
  useProductTaxonomy,
  useReplaceProductDetails,
  useSpecTemplates,
} from '@/src/api/products.hooks';
import { productsExtraApi } from '@/src/api/products.api';
import { useTheme } from '@/src/theme/theme';
import { Card, ErrorState, Eyebrow, Field, Loading } from '@/src/ui';
import { CompanyPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { MultiOptionPicker, OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { CountrySelect } from '@/src/ui/select/fields';
import { toast } from '@/src/ui/toast';
import { FormScreen, Segmented, SmallButton } from '@/src/ui/finance/kit';
import {
  EMPTY_PRODUCT_FORM,
  PRODUCT_VAT_RATES,
  buildDetailsPayload,
  buildProductBody,
  equipmentFromLines,
  isMachineCategory,
  isOptionalEquipmentCategory,
  taxonomyChildren,
  validateProductForm,
  type EquipmentDraft,
  type ProductFormState,
  type SpecDraft,
} from '@/src/ui/products/product-form';

const VAT_OPTIONS = PRODUCT_VAT_RATES.map((rate) => ({ value: rate, label: `%${rate}` }));

/** Web `canEditProduct` / `canCreateProducts`: admin rolleri veya ilgili izin. */
function useProductPermission(kind: 'create' | 'update') {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  return roles.includes('super_admin') || roles.includes('admin') || (user?.permissions ?? []).includes(`products.${kind}`);
}

/** Web `ProductDialog`: "Yeni Ürün" ve "Ürünü Düzenle". */
export function ProductForm({ id }: { id?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const editing = Boolean(id);
  const allowed = useProductPermission(editing ? 'update' : 'create');
  const divisionId = activeScope().divisionId ?? undefined;

  const detail = useProduct(id ?? '');
  const specRows = useProductSpecs(id ?? '', editing);
  const equipmentRows = useProductEquipment(id ?? '', editing);
  const taxonomy = useProductTaxonomy();
  const brands = useBrands(divisionId);
  const currencies = useLookup('currencies');
  const products = useAllProducts();
  const create = useCreateProduct();
  const update = useUpdateProduct(id ?? '');
  const replaceDetails = useReplaceProductDetails(id ?? '');

  const [form, setForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [supplier, setSupplier] = useState<PickedRecord | null>(null);
  const [specs, setSpecs] = useState<SpecDraft[]>([]);
  const [standardText, setStandardText] = useState('');
  const [optionalText, setOptionalText] = useState('');
  const [originalEquipment, setOriginalEquipment] = useState<EquipmentDraft[]>([]);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  const templates = useSpecTemplates(form.productTypeCode || undefined, divisionId);

  useEffect(() => {
    const data = detail.data;
    if (!editing || hydrated || !data || specRows.isPending || equipmentRows.isPending) return;
    setForm({
      productGroupCode: data.productGroup?.code ?? '',
      categoryCode: data.category?.code ?? '',
      subcategoryCode: data.subcategory?.code ?? '',
      productTypeCode: data.productType?.code ?? '',
      brandId: data.brand?.id ?? '',
      series: data.series ?? '',
      fullName: data.fullName ?? '',
      modelCode: data.modelCode ?? '',
      modelName: data.modelName ?? '',
      supplierCompanyId: data.supplierCompany?.id ?? null,
      currencyCode: data.currency?.code ?? 'USD',
      listPrice: data.listPrice ?? '',
      cashPrice: data.cashPrice ?? '',
      vatRate: data.vatRate != null ? String(Number(data.vatRate)) : '20',
      originCountry: data.originCountry ?? '',
      hsCode: data.hsCode ?? '',
      stockCode: data.stockCode ?? '',
      description: data.description ?? '',
      muadilProductIds: (data.muadilProducts ?? []).map((product) => product.id),
    });
    if (data.supplierCompany) {
      setSupplier({ id: data.supplierCompany.id, name: data.supplierCompany.shortName ?? data.supplierCompany.legalTitle });
    }
    setSpecs(
      (specRows.data ?? []).map((row) => ({
        key: row.spec.specKey,
        value: row.spec.specValue,
        unit: row.spec.specUnit ?? '',
        groupCode: row.group?.code ?? null,
      })),
    );
    const equipment = (equipmentRows.data ?? []).map((row) => ({
      code: row.type?.code ?? '',
      draft: { title: row.item.title, description: row.item.description, isPromotion: row.item.isPromotion },
    }));
    setOriginalEquipment(equipment.map((row) => row.draft));
    setStandardText(equipment.filter((row) => row.code === 'standart').map((row) => row.draft.title).join('\n'));
    setOptionalText(equipment.filter((row) => row.code !== 'standart').map((row) => row.draft.title).join('\n'));
    setHydrated(true);
  }, [editing, hydrated, detail.data, specRows.isPending, specRows.data, equipmentRows.isPending, equipmentRows.data]);

  // Yeni üründe tip seçilince web gibi teknik bilgi şablonu yüklenir.
  useEffect(() => {
    if (editing || detailsDirty || !templates.data) return;
    setSpecs(
      [...templates.data]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row) => ({ key: row.specKey, value: row.defaultValue ?? '', unit: row.specUnit ?? '', groupCode: row.specGroupCode })),
    );
  }, [editing, detailsDirty, templates.data]);

  const rows = taxonomy.data;
  const group = rows?.groups.find((row) => row.code === form.productGroupCode);
  const category = rows?.categories.find((row) => row.code === form.categoryCode);
  const subcategory = rows?.subcategories.find((row) => row.code === form.subcategoryCode);
  const groupOptions = useMemo(
    () => taxonomyChildren(rows?.groups ?? [], null, () => null).filter((row) => !divisionId || !row.divisionId || row.divisionId === divisionId),
    [rows, divisionId],
  );
  const categoryOptions = useMemo(() => taxonomyChildren(rows?.categories ?? [], group?.id, (row) => row.productGroupId), [rows, group?.id]);
  const subcategoryOptions = useMemo(
    () => taxonomyChildren(rows?.subcategories ?? [], category?.id, (row) => row.categoryId),
    [rows, category?.id],
  );
  const typeOptions = useMemo(
    () =>
      taxonomyChildren(rows?.types ?? [], subcategory?.id ?? category?.id, (row) =>
        subcategory ? row.subcategoryId : (row.categoryId ?? null),
      ),
    [rows, subcategory, category?.id],
  );
  const muadilOptions = useMemo(
    () =>
      (products.data ?? [])
        .filter((product) => product.id !== id)
        .map((product) => ({ value: product.id, label: product.fullName, hint: [product.brand?.name, product.modelCode].filter(Boolean).join(' · ') })),
    [products.data, id],
  );

  if (!allowed) return <Redirect href={'/(tabs)/modules/products' as Href} />;
  const title = editing ? 'Ürünü Düzenle' : 'Yeni Ürün';
  if (editing && (detail.isPending || !hydrated) && !detail.error) {
    return (
      <FormScreen title={title}>
        <Loading />
      </FormScreen>
    );
  }
  if (editing && detail.error) {
    return (
      <FormScreen title={title}>
        <ErrorState message={detail.error.message} onRetry={() => void detail.refetch()} />
      </FormScreen>
    );
  }

  const set = <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const setSpec = (index: number, patch: Partial<SpecDraft>) => {
    setDetailsDirty(true);
    setSpecs((current) => current.map((spec, i) => (i === index ? { ...spec, ...patch } : spec)));
  };

  async function submit() {
    const check = validateProductForm(form);
    if (!check.ok) return toast.error(check.title);
    const body = buildProductBody(form);
    const details = buildDetailsPayload({
      specs,
      standard: equipmentFromLines(standardText, originalEquipment),
      optional: equipmentFromLines(optionalText, originalEquipment),
    });
    setSaving(true);
    try {
      if (editing) {
        await update.mutateAsync(body);
        if (detailsDirty) await replaceDetails.mutateAsync(details);
        toast.success(`Ürün güncellendi · ${body.modelCode}`);
      } else {
        const created = await create.mutateAsync({ ...body, divisionId, supplierCompanyId: body.supplierCompanyId ?? undefined, listPrice: body.listPrice ?? undefined, cashPrice: body.cashPrice ?? undefined });
        if (details.specs.length || details.equipment.length) await productsExtraApi.replaceDetails(created.id, details);
        toast.success(`Ürün oluşturuldu · ${body.modelCode}`);
      }
      router.back();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'API isteği başarısız oldu.';
      toast.error(`${editing ? 'Ürün güncellenemedi' : 'Ürün oluşturulamadı'}: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  const machine = isMachineCategory(form.categoryCode);
  const optionalProduct = isOptionalEquipmentCategory(form.categoryCode);
  const currencyOptions = (currencies.data ?? []).map((row) => ({ value: row.code, label: row.code }));

  return (
    <FormScreen title={title} submitLabel={saving ? 'Kaydediliyor...' : 'Kaydet'} submitting={saving} onSubmit={() => void submit()}>
      <Text className="font-inter text-xs text-muted-foreground">
        Ürün sınıflandırması, fiyat, stok kodu ve teknik bilgileri tek ekranda yönetin.
      </Text>
      {taxonomy.isPending ? <Loading /> : null}
      <OptionPicker
        label="1. Ürün Grubu"
        value={form.productGroupCode || null}
        options={groupOptions.map((row) => ({ value: row.code, label: row.name }))}
        placeholder="Grup seçin"
        onChange={(next) => setForm((current) => ({ ...current, productGroupCode: next ?? '', categoryCode: '', subcategoryCode: '', productTypeCode: '' }))}
      />
      <OptionPicker
        label="2. Ürün Kategorisi"
        value={form.categoryCode || null}
        options={categoryOptions.map((row) => ({ value: row.code, label: row.name }))}
        placeholder="Kategori seçin"
        onChange={(next) => setForm((current) => ({ ...current, categoryCode: next ?? '', subcategoryCode: '', productTypeCode: '' }))}
      />
      {subcategoryOptions.length ? (
        <OptionPicker
          label="3. Ürün Alt Kategorisi"
          value={form.subcategoryCode || null}
          options={subcategoryOptions.map((row) => ({ value: row.code, label: row.name }))}
          placeholder="Alt kategori seçin"
          onChange={(next) => setForm((current) => ({ ...current, subcategoryCode: next ?? '', productTypeCode: '' }))}
        />
      ) : null}
      <OptionPicker
        label="4. Ürün Tipi"
        value={form.productTypeCode || null}
        options={typeOptions.map((row) => ({ value: row.code, label: row.name }))}
        placeholder={typeOptions.length ? 'Ürün tipi seçin' : 'Önce kategori seçin'}
        searchable
        onChange={(next) => set('productTypeCode', next ?? '')}
      />
      <OptionPicker
        label="5. Ürün Markası"
        value={form.brandId || null}
        options={(brands.data ?? []).map((brand) => ({ value: brand.id, label: brand.name, hint: brand.country }))}
        placeholder="Kayıtlı marka seçin..."
        searchable
        onChange={(next) => set('brandId', next ?? '')}
      />
      {machine ? <Field label="6. Ürün Serisi" value={form.series} onChangeText={(value) => set('series', value)} placeholder="örn. VM" /> : null}
      <Field label={machine ? '7. Ürün Adı' : 'Ürün Adı'} value={form.fullName} onChangeText={(value) => set('fullName', value)} placeholder="Ürün adı" />
      <Field label="Model" value={form.modelCode} onChangeText={(value) => set('modelCode', value)} placeholder="örn. MT-520/2000" autoCapitalize="characters" />
      <Field label="Model Adı" value={form.modelName} onChangeText={(value) => set('modelName', value)} />
      <CompanyPicker
        label="Ürün Tedarikçisi"
        placeholder="Tedarikçi seçin"
        value={supplier}
        onChange={(next) => {
          setSupplier(next);
          set('supplierCompanyId', next?.id ?? null);
        }}
      />
      {currencyOptions.length ? (
        <OptionPicker
          label="Ürün Para Birimi"
          value={form.currencyCode}
          options={currencyOptions}
          onChange={(next) => set('currencyCode', next ?? 'USD')}
        />
      ) : null}
      <Field label="Liste Fiyatı" value={form.listPrice} onChangeText={(value) => set('listPrice', value)} keyboardType="decimal-pad" placeholder="0" />
      <Field label="Peşin Fiyatı" value={form.cashPrice} onChangeText={(value) => set('cashPrice', value)} keyboardType="decimal-pad" placeholder="0" />
      <CountrySelect label="Menşei" value={form.originCountry} onChange={(value) => set('originCountry', value)} />
      <Field label="GTIP Kodu" value={form.hsCode} onChangeText={(value) => set('hsCode', value)} />
      <Segmented label="Ürün KDV" value={form.vatRate as (typeof PRODUCT_VAT_RATES)[number]} options={VAT_OPTIONS} onChange={(value) => set('vatRate', value)} />
      <Field label="Ürün Stok Kodu" value={form.stockCode} onChangeText={(value) => set('stockCode', value)} />
      {optionalProduct ? null : (
        <MultiOptionPicker
          label="Muadil Ürünler"
          values={form.muadilProductIds}
          options={muadilOptions}
          placeholder="Muadil ürün seçin"
          onChange={(values) => set('muadilProductIds', values)}
        />
      )}
      <Field label="Açıklama" value={form.description} onChangeText={(value) => set('description', value)} multiline />

      <Card className="gap-3">
        <View className="flex-row items-center justify-between">
          <Eyebrow>Teknik Bilgiler</Eyebrow>
          <SmallButton
            label="Satır Ekle"
            icon="add"
            onPress={() => {
              setDetailsDirty(true);
              setSpecs((current) => [...current, { key: '', value: '', unit: '', groupCode: null }]);
            }}
          />
        </View>
        {specs.length === 0 ? (
          <Text className="font-inter text-xs text-muted-foreground">Teknik bilgi satırı yok.</Text>
        ) : (
          specs.map((spec, index) => (
            <View key={index} className="gap-2 border-t border-border pt-2">
              <View className="flex-row items-center gap-2">
                <View className="flex-1">
                  <Field label="Özellik" value={spec.key} onChangeText={(value) => setSpec(index, { key: value })} />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${spec.key || 'Teknik bilgi'} satırını sil`}
                  onPress={() => {
                    setDetailsDirty(true);
                    setSpecs((current) => current.filter((_, i) => i !== index));
                  }}
                  className="h-11 w-11 items-center justify-center self-end active:opacity-60"
                >
                  <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                </Pressable>
              </View>
              <View className="flex-row gap-2">
                <View className="flex-[2]">
                  <Field label="Değer" value={spec.value} onChangeText={(value) => setSpec(index, { value })} />
                </View>
                <View className="flex-1">
                  <Field label="Birim" value={spec.unit} onChangeText={(value) => setSpec(index, { unit: value })} />
                </View>
              </View>
            </View>
          ))
        )}
      </Card>

      <Field
        label="Standart Donanım (her satır bir kalem)"
        value={standardText}
        onChangeText={(value) => {
          setDetailsDirty(true);
          setStandardText(value);
        }}
        multiline
      />
      <Field
        label="Opsiyonel Donanım (her satır bir kalem)"
        value={optionalText}
        onChangeText={(value) => {
          setDetailsDirty(true);
          setOptionalText(value);
        }}
        multiline
      />
    </FormScreen>
  );
}
