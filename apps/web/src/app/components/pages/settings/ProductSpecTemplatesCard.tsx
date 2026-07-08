import { useEffect, useMemo, useState } from "react";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Input } from "../../ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../ui/accordion";
import { Layers, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { adminService } from "../../../../lib/services";
import {
  HAKSAN_CNC_SPEC_KEYS,
  PRODUCT_SPEC_GROUPS,
  machineSpecTemplateEntries,
  normalizeProductSpecKey,
  productSpecGroupForKey,
  productSpecGroupForTypeKey,
  specUnitForKey,
  type MachineSpecTemplateEntry,
  type ProductSpecGroup,
  type ProductSpecGroupCode,
} from "../../../lib/productSpecTemplates";
import { MultiSelect } from "../../ui/multi-select";
import { SettingsField, SettingsSection, SettingsSelect } from "./settings-controls";

// Opsiyonel donanım tipleri için katalog şablonu yoktur; bu tiplerin "etkilediği"
// teknik alan, tüm tezgah teknik anahtarlarının birleşik listesinden seçilir
// (örn. Spindle → "Fener Mili Devri"). Böylece anahtar tezgah alanıyla birebir eşleşir.
const optionalEquipmentSpecEntries = (): MachineSpecTemplateEntry[] =>
  HAKSAN_CNC_SPEC_KEYS.map((key) => ({
    group: productSpecGroupForKey(key).code,
    key,
    value: "",
    unit: specUnitForKey(key),
  }));

// Bir ürün tipinin seçilebilir teknik alan (etiket) kaynağı: tezgahsa katalog
// şablonu; opsiyonel donanımsa tezgah anahtarları birleşik listesi.
const specEntriesForType = (categoryCode: string, productTypeCode: string): MachineSpecTemplateEntry[] => {
  const catalog = machineSpecTemplateEntries(productTypeCode);
  if (catalog.length) return [...catalog];
  if (categoryCode === "OPSIYONEL_DONANIM") return optionalEquipmentSpecEntries();
  return [];
};

type SpecTemplateRow = {
  id: string;
  productTypeCode: string;
  specKey: string;
  specGroupCode?: string | null;
  defaultValue?: string | null;
  specUnit?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

type ProductOption = { code: string; label: string };
type ProductTypeOption = ProductOption & { categoryCode: string; subcategoryCode?: string };

type SpecTemplateScope = {
  categoryCode: string;
  subcategoryCode: string;
  productTypeCode: string;
};

// Katalog (şablon) alanı ile DB'ye kayıtlı alanı tek satır modelinde birleştirir.
type SpecDisplayRow = {
  reactKey: string;
  specKey: string;
  specUnit: string;
  defaultValue: string;
  sortOrder: number;
  groupCode: ProductSpecGroupCode;
  isActive: boolean;
  dbRow?: SpecTemplateRow;
  catalogEntry?: MachineSpecTemplateEntry;
  catalogIndex: number;
};

type SpecDisplayGroup = { group: ProductSpecGroup; rows: SpecDisplayRow[] };

const TEMPLATE_PRODUCT_CATEGORIES: ProductOption[] = [
  { code: "TEZGAH", label: "Tezgah" },
  { code: "YEDEK_PARCA", label: "Yedek Parça" },
  { code: "OPSIYONEL_DONANIM", label: "Opsiyonel Donanım" },
  { code: "ISCILIK", label: "İşçilik" },
  { code: "AKSESUAR", label: "Aksesuar" },
];

const TEMPLATE_PRODUCT_SUBCATEGORIES: ProductOption[] = [
  { code: "ISLEME_MERKEZI", label: "İşleme Merkezi" },
  { code: "TORNA", label: "Torna" },
];

const TEMPLATE_PRODUCT_TYPE_GROUPS: Array<{ label: string; options: ProductTypeOption[] }> = [
  {
    label: "İşleme Merkezi",
    options: [
      { code: "CNC_DIK_ISLEME_MERKEZ", label: "CNC Dik İşleme Merkezi", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI" },
      { code: "CNC_KOPRU_TIPI_ISLEME_MERKEZI", label: "CNC Köprü Tipi İşleme Merkezi", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI" },
      { code: "CNC_5_EKSEN_ISLEME_MERKEZI", label: "CNC 5 Eksen İşleme Merkezi", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI" },
      { code: "CNC_TAPPING_CENTER", label: "CNC Tapping Center", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI" },
    ],
  },
  {
    label: "Torna",
    options: [
      { code: "CNC_YATAY_TORNA_TEZGAHI", label: "CNC Yatay Torna Tezgahı", categoryCode: "TEZGAH", subcategoryCode: "TORNA" },
      { code: "CNC_DIK_TORNA_TEZGAHI", label: "CNC Dik Torna Tezgahı", categoryCode: "TEZGAH", subcategoryCode: "TORNA" },
    ],
  },
  {
    label: "Yedek Parça",
    options: [
      { code: "ELEKTRONIK", label: "Elektronik", categoryCode: "YEDEK_PARCA" },
      { code: "ELEKTRIK", label: "Elektrik", categoryCode: "YEDEK_PARCA" },
      { code: "MEKANIK", label: "Mekanik", categoryCode: "YEDEK_PARCA" },
    ],
  },
  {
    label: "Opsiyonel Donanım",
    options: [
      { code: "KONTROL_UNITESI", label: "Kontrol Ünitesi", categoryCode: "OPSIYONEL_DONANIM" },
      { code: "SPINDLE", label: "Spindle", categoryCode: "OPSIYONEL_DONANIM" },
    ],
  },
  {
    label: "İşçilik",
    options: [{ code: "ISCILIK", label: "İşçilik", categoryCode: "ISCILIK" }],
  },
  {
    label: "Aksesuar",
    options: [
      { code: "YAG_SIYIRICI", label: "Yağ Sıyırıcı", categoryCode: "AKSESUAR" },
      { code: "TUTUCU_TAKIMLAR", label: "Tutucu & Takımlar", categoryCode: "AKSESUAR" },
      { code: "DIVIZOR", label: "Divizör", categoryCode: "AKSESUAR" },
      { code: "REGULATOR", label: "Regülatör", categoryCode: "AKSESUAR" },
    ],
  },
];

const TEMPLATE_PRODUCT_TYPES = TEMPLATE_PRODUCT_TYPE_GROUPS.flatMap((group) => group.options);

const emptySpecForm = { productTypeCode: "", specKey: "", specGroupCode: "", defaultValue: "", specUnit: "", sortOrder: "0", isActive: true };
const emptySpecScope: SpecTemplateScope = { categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI", productTypeCode: "" };

// Eski şablon kayıtları bu ürün tipi kodlarıyla saklanmış olabilir; güncel kodlara eşlenir.
const LEGACY_PRODUCT_TYPE_ALIASES: Record<string, string> = {
  DIK_ISLEME_MERKEZI: "CNC_DIK_ISLEME_MERKEZ",
  KOPRU_TIPI_ISLEME_MERKEZI: "CNC_KOPRU_TIPI_ISLEME_MERKEZI",
  CNC_TORNA: "CNC_YATAY_TORNA_TEZGAHI",
};

const canonicalProductTypeCode = (code: string) => LEGACY_PRODUCT_TYPE_ALIASES[code] ?? code;
const productTypeLabel = (code: string) =>
  TEMPLATE_PRODUCT_TYPES.find((item) => item.code === canonicalProductTypeCode(code))?.label ?? code;
const productTypeByCode = (code: string) => TEMPLATE_PRODUCT_TYPES.find((item) => item.code === canonicalProductTypeCode(code));

const GROUP_BY_CODE = new Map(PRODUCT_SPEC_GROUPS.map((group) => [group.code, group]));

// Grup ataması: kalıcı specGroupCode öncelikli, yoksa katalog/anahtar sezgisi.
const resolveRowGroupCode = (row: SpecTemplateRow): ProductSpecGroupCode => {
  const persisted = row.specGroupCode ? (row.specGroupCode.toLocaleUpperCase("tr-TR") as ProductSpecGroupCode) : undefined;
  if (persisted && GROUP_BY_CODE.has(persisted)) return persisted;
  return productSpecGroupForTypeKey(canonicalProductTypeCode(row.productTypeCode), {
    key: row.specKey,
    value: row.defaultValue ?? "",
  }).code;
};

const seedValueFromEntry = (value: string) => (value && value !== "-" ? value : undefined);

const subcategoriesForCategory = (categoryCode: string) => {
  const subcategoryCodes = new Set(
    TEMPLATE_PRODUCT_TYPES.filter((item) => item.categoryCode === categoryCode && item.subcategoryCode).map((item) => item.subcategoryCode!),
  );
  return TEMPLATE_PRODUCT_SUBCATEGORIES.filter((item) => subcategoryCodes.has(item.code));
};

const productTypesForScope = (categoryCode: string, subcategoryCode: string) => {
  const categorySubcategories = subcategoriesForCategory(categoryCode);
  return TEMPLATE_PRODUCT_TYPES.filter((item) => {
    if (item.categoryCode !== categoryCode) return false;
    if (!categorySubcategories.length) return true;
    return item.subcategoryCode === subcategoryCode;
  });
};

const scopeForCategory = (categoryCode: string): SpecTemplateScope => {
  const [firstSubcategory] = subcategoriesForCategory(categoryCode);
  return { categoryCode, subcategoryCode: firstSubcategory?.code ?? "", productTypeCode: "" };
};

const scopeForProductType = (productTypeCode: string): SpecTemplateScope => {
  const productType = productTypeByCode(productTypeCode);
  if (!productType) return emptySpecScope;
  return {
    categoryCode: productType.categoryCode,
    subcategoryCode: productType.subcategoryCode ?? "",
    productTypeCode: productType.code,
  };
};

export function ProductSpecTemplatesCard() {
  const [specRows, setSpecRows] = useState<SpecTemplateRow[]>([]);
  const [specScope, setSpecScope] = useState<SpecTemplateScope>(emptySpecScope);
  const [specForm, setSpecForm] = useState(emptySpecForm);
  const [editingSpecId, setEditingSpecId] = useState<string | null>(null);
  const [specBusy, setSpecBusy] = useState(false);
  const [search, setSearch] = useState("");
  // Yeni teknik alanın uygulanacağı ürün tipleri (çoklu seçim). Düzenlemede tek tip.
  const [specTargetTypes, setSpecTargetTypes] = useState<string[]>([]);

  const availableSpecSubcategories = useMemo(() => subcategoriesForCategory(specScope.categoryCode), [specScope.categoryCode]);
  const availableSpecProductTypes = useMemo(
    () => productTypesForScope(specScope.categoryCode, specScope.subcategoryCode),
    [specScope.categoryCode, specScope.subcategoryCode],
  );

  const loadSpecTemplates = async () => {
    setSpecBusy(true);
    try {
      setSpecRows(await adminService.productSpecTemplates());
    } catch (err: any) {
      toast.error("Teknik bilgi şablonları yüklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSpecBusy(false);
    }
  };

  useEffect(() => {
    void loadSpecTemplates();
  }, []);

  // Seçili ürün tipinin DB satırları.
  const typeDbRows = useMemo(
    () =>
      specScope.productTypeCode
        ? specRows.filter((row) => canonicalProductTypeCode(row.productTypeCode) === specScope.productTypeCode)
        : [],
    [specRows, specScope.productTypeCode],
  );

  const catalogEntries = useMemo(
    () => [...machineSpecTemplateEntries(specScope.productTypeCode)],
    [specScope.productTypeCode],
  );

  // DB satırları + katalogda olup DB'de olmayan alanlar tek listede birleşir.
  const mergedRows = useMemo<SpecDisplayRow[]>(() => {
    const dbKeys = new Set(typeDbRows.map((row) => normalizeProductSpecKey(row.specKey)));
    const catalogIndexByKey = new Map<string, number>();
    catalogEntries.forEach((entry, index) => {
      const norm = normalizeProductSpecKey(entry.key);
      if (!catalogIndexByKey.has(norm)) catalogIndexByKey.set(norm, index);
    });

    const dbDisplay: SpecDisplayRow[] = typeDbRows.map((row) => ({
      reactKey: `db-${row.id}`,
      specKey: row.specKey,
      specUnit: row.specUnit ?? "",
      defaultValue: row.defaultValue ?? "",
      sortOrder: row.sortOrder ?? 0,
      groupCode: resolveRowGroupCode(row),
      isActive: row.isActive !== false,
      dbRow: row,
      catalogIndex: catalogIndexByKey.get(normalizeProductSpecKey(row.specKey)) ?? Number.MAX_SAFE_INTEGER,
    }));

    const catalogOnly: SpecDisplayRow[] = catalogEntries
      .filter((entry) => !dbKeys.has(normalizeProductSpecKey(entry.key)))
      .map((entry, index) => ({
        reactKey: `catalog-${entry.group}-${entry.key}`,
        specKey: entry.key,
        specUnit: entry.unit,
        defaultValue: entry.value,
        sortOrder: index,
        groupCode: entry.group,
        isActive: true,
        catalogEntry: entry,
        catalogIndex: catalogIndexByKey.get(normalizeProductSpecKey(entry.key)) ?? Number.MAX_SAFE_INTEGER,
      }));

    return [...dbDisplay, ...catalogOnly];
  }, [typeDbRows, catalogEntries]);

  const searchNorm = normalizeProductSpecKey(search);
  const filteredMergedRows = useMemo(
    () => (searchNorm ? mergedRows.filter((row) => normalizeProductSpecKey(row.specKey).includes(searchNorm)) : mergedRows),
    [mergedRows, searchNorm],
  );

  // Grup sırası: önce katalog şablonundaki sıra, sonra kalan gruplar.
  const groupedDisplay = useMemo<SpecDisplayGroup[]>(() => {
    const orderedCodes: ProductSpecGroupCode[] = [];
    for (const entry of catalogEntries) {
      if (!orderedCodes.includes(entry.group)) orderedCodes.push(entry.group);
    }
    for (const group of PRODUCT_SPEC_GROUPS) {
      if (!orderedCodes.includes(group.code)) orderedCodes.push(group.code);
    }
    const buckets = new Map<ProductSpecGroupCode, SpecDisplayRow[]>();
    for (const row of filteredMergedRows) {
      buckets.set(row.groupCode, [...(buckets.get(row.groupCode) ?? []), row]);
    }
    return orderedCodes
      .map((code) => ({
        group: GROUP_BY_CODE.get(code)!,
        rows: (buckets.get(code) ?? []).sort(
          (a, b) => a.catalogIndex - b.catalogIndex || a.sortOrder - b.sortOrder || a.specKey.localeCompare(b.specKey, "tr-TR"),
        ),
      }))
      .filter((item) => item.rows.length > 0);
  }, [catalogEntries, filteredMergedRows]);

  const missingCatalogEntries = useMemo(() => {
    const dbKeys = new Set(typeDbRows.map((row) => normalizeProductSpecKey(row.specKey)));
    return catalogEntries.filter((entry) => !dbKeys.has(normalizeProductSpecKey(entry.key)));
  }, [catalogEntries, typeDbRows]);

  // Şablonu olan tezgahlarda alan etiketi katalogdan seçilir; birim sabit gelir.
  const specFormCategoryCode = useMemo(
    () => productTypeByCode(specForm.productTypeCode)?.categoryCode ?? "",
    [specForm.productTypeCode],
  );
  const specTemplateOptions = useMemo(() => {
    const entries = specEntriesForType(specFormCategoryCode, specForm.productTypeCode);
    if (!entries.length) return [] as MachineSpecTemplateEntry[];
    // Ekleme sırasında zaten kayıtlı alanlar gizlenir; düzenlemede mevcut alan dahil edilir.
    const existing = new Set(typeDbRows.map((row) => normalizeProductSpecKey(row.specKey)));
    const currentNorm = normalizeProductSpecKey(specForm.specKey);
    return entries.filter((entry) => {
      const norm = normalizeProductSpecKey(entry.key);
      if (editingSpecId && norm === currentNorm) return true;
      return !existing.has(norm);
    });
  }, [specFormCategoryCode, specForm.productTypeCode, specForm.specKey, typeDbRows, editingSpecId]);

  const applySpecTemplateKey = (specKey: string) => {
    const item = specEntriesForType(specFormCategoryCode, specForm.productTypeCode).find((option) => option.key === specKey);
    setSpecForm((current) => ({
      ...current,
      specKey,
      specGroupCode: item ? item.group : current.specGroupCode,
      specUnit: item ? item.unit : current.specUnit,
      defaultValue: current.defaultValue || (item ? seedValueFromEntry(item.value) ?? "" : ""),
    }));
  };

  const resetSpecTemplateForm = (productTypeCode = specScope.productTypeCode) => {
    setEditingSpecId(null);
    setSpecForm({ ...emptySpecForm, productTypeCode });
    setSpecTargetTypes(productTypeCode ? [productTypeCode] : []);
  };

  const changeSpecCategory = (categoryCode: string) => {
    setSpecScope(scopeForCategory(categoryCode));
    resetSpecTemplateForm("");
    setSearch("");
  };

  const changeSpecSubcategory = (subcategoryCode: string) => {
    setSpecScope({ categoryCode: specScope.categoryCode, subcategoryCode, productTypeCode: "" });
    resetSpecTemplateForm("");
    setSearch("");
  };

  const changeSpecProductType = (productTypeCode: string) => {
    setSpecScope(productTypeCode ? scopeForProductType(productTypeCode) : { ...specScope, productTypeCode: "" });
    resetSpecTemplateForm(productTypeCode);
    setSearch("");
  };

  const submitSpecTemplate = async () => {
    const productTypeCode = specForm.productTypeCode.trim();
    if (!productTypeCode || !specForm.specKey.trim()) return toast.error("Ürün tipi ve teknik alan zorunludur");
    const body = {
      productTypeCode,
      specKey: specForm.specKey.trim(),
      specGroupCode: specForm.specGroupCode || undefined,
      defaultValue: specForm.defaultValue || undefined,
      specUnit: specForm.specUnit || undefined,
      sortOrder: Number(specForm.sortOrder || 0),
      isActive: specForm.isActive,
    };
    setSpecBusy(true);
    try {
      if (editingSpecId) {
        await adminService.updateProductSpecTemplate(editingSpecId, body);
        toast.success("Teknik alan güncellendi");
      } else {
        // Çoklu ürün tipi: seçilen her tipe aynı alan eklenir (birincil tip dahil).
        const targets = Array.from(new Set([productTypeCode, ...specTargetTypes])).filter(Boolean);
        if (targets.length > 1) {
          const res = await adminService.bulkCreateProductSpecTemplates(targets.map((t) => ({ ...body, productTypeCode: t })));
          toast.success(`${res.created} ürün tipine eklendi`, {
            description: res.skipped ? `${res.skipped} tip için alan zaten kayıtlıydı, atlandı.` : undefined,
          });
        } else {
          await adminService.createProductSpecTemplate(body);
          toast.success("Teknik alan eklendi");
        }
      }
      setSpecForm({ ...emptySpecForm, productTypeCode });
      setSpecTargetTypes(productTypeCode ? [productTypeCode] : []);
      setEditingSpecId(null);
      await loadSpecTemplates();
    } catch (err: any) {
      toast.error("Teknik alan kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSpecBusy(false);
    }
  };

  const addCatalogEntry = async (row: SpecDisplayRow) => {
    const entry = row.catalogEntry;
    if (!entry || !specScope.productTypeCode) return;
    setSpecBusy(true);
    try {
      await adminService.createProductSpecTemplate({
        productTypeCode: specScope.productTypeCode,
        specKey: entry.key,
        specGroupCode: entry.group,
        defaultValue: seedValueFromEntry(entry.value),
        specUnit: entry.unit || undefined,
        sortOrder: row.catalogIndex === Number.MAX_SAFE_INTEGER ? 0 : row.catalogIndex,
        isActive: true,
      });
      toast.success(`"${entry.key}" eklendi`);
      await loadSpecTemplates();
    } catch (err: any) {
      toast.error("Teknik alan eklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSpecBusy(false);
    }
  };

  const seedMissingFromCatalog = async () => {
    if (!specScope.productTypeCode || !missingCatalogEntries.length) return;
    const items = missingCatalogEntries.map((entry) => {
      const index = catalogEntries.indexOf(entry);
      return {
        productTypeCode: specScope.productTypeCode,
        specKey: entry.key,
        specGroupCode: entry.group,
        defaultValue: seedValueFromEntry(entry.value),
        specUnit: entry.unit || undefined,
        sortOrder: index < 0 ? 0 : index,
        isActive: true,
      };
    });
    setSpecBusy(true);
    try {
      const res = await adminService.bulkCreateProductSpecTemplates(items);
      toast.success(`${res.created} teknik alan eklendi`, {
        description: res.skipped ? `${res.skipped} alan zaten kayıtlı olduğu için atlandı (mevcut değerler korundu).` : undefined,
      });
      await loadSpecTemplates();
    } catch (err: any) {
      toast.error("Şablon yüklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSpecBusy(false);
    }
  };

  const editSpecTemplate = (row: SpecTemplateRow) => {
    setEditingSpecId(row.id);
    setSpecTargetTypes([canonicalProductTypeCode(row.productTypeCode)]);
    setSpecScope(scopeForProductType(row.productTypeCode));
    setSpecForm({
      productTypeCode: canonicalProductTypeCode(row.productTypeCode),
      specKey: row.specKey,
      specGroupCode: row.specGroupCode ?? "",
      defaultValue: row.defaultValue ?? "",
      specUnit: row.specUnit ?? "",
      sortOrder: String(row.sortOrder ?? 0),
      isActive: row.isActive !== false,
    });
  };

  const deleteSpecTemplate = async (row: SpecTemplateRow) => {
    if (!window.confirm(`${row.specKey} teknik alanı pasifleştirilsin mi?`)) return;
    setSpecBusy(true);
    try {
      await adminService.deleteProductSpecTemplate(row.id);
      toast.success("Teknik alan pasifleştirildi");
      await loadSpecTemplates();
    } catch (err: any) {
      toast.error("Teknik alan pasifleştirilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSpecBusy(false);
    }
  };

  const hasTypeSelected = Boolean(specScope.productTypeCode);
  const hasCatalog = catalogEntries.length > 0;
  const registeredCount = typeDbRows.length;
  const openGroupValues = groupedDisplay.map((item) => item.group.code);

  return (
    <SettingsSection
      icon={<Layers />}
      tone="primary"
      title="Ürün Teknik Bilgi Şablonları"
      description="Ürün tipine göre teknik alanları ve varsayılan değerleri yönetin."
      bodyClassName="space-y-3"
    >
        {/* Yapışkan filtre çubuğu: kaydırırken kapsam seçimi görünür kalır. */}
        <div className="sticky top-0 z-10 -mx-5 border-b border-border/60 bg-card/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <SettingsSelect
              label="Üst Grup"
              value={specScope.categoryCode}
              onChange={changeSpecCategory}
              options={TEMPLATE_PRODUCT_CATEGORIES.map((item) => ({ value: item.code, label: item.label }))}
            />
            <SettingsSelect
              label="Alt Grup"
              value={specScope.subcategoryCode}
              onChange={changeSpecSubcategory}
              disabled={!availableSpecSubcategories.length}
              options={
                availableSpecSubcategories.length
                  ? availableSpecSubcategories.map((item) => ({ value: item.code, label: item.label }))
                  : [{ value: "", label: "Alt grup yok" }]
              }
            />
            <SettingsSelect
              label="Ürün Tipi"
              value={specScope.productTypeCode}
              onChange={changeSpecProductType}
              options={[
                { value: "", label: "Ürün tipi seçin" },
                ...availableSpecProductTypes.map((item) => ({ value: item.code, label: item.label })),
              ]}
            />
          </div>
        </div>

        {!hasTypeSelected ? (
          <div className="rounded-lg border border-dashed border-border/70 px-4 py-10 text-center">
            <div className="text-sm font-medium">Teknik bilgileri görmek için bir ürün tipi seçin</div>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              Ürün tipi seçildiğinde o tipe ait tüm teknik alanlar (kayıtlı olanlar ve katalog şablonundakiler) gruplar halinde listelenir.
            </p>
          </div>
        ) : (
          <>
            {/* Seçili tip başlığı + özet + toplu şablon aksiyonu */}
            <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{productTypeLabel(specScope.productTypeCode)}</span>
                  <Badge variant="secondary">{registeredCount} kayıtlı</Badge>
                  {hasCatalog && missingCatalogEntries.length > 0 && (
                    <Badge variant="outline" className="border-warning/40 bg-warning-soft text-warning">
                      {missingCatalogEntries.length} katalog alanı eksik
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{specScope.productTypeCode}</div>
              </div>
              {hasCatalog && missingCatalogEntries.length > 0 && (
                <Button type="button" size="sm" variant="outline" className="gap-1 shrink-0" disabled={specBusy} onClick={seedMissingFromCatalog}>
                  <Sparkles className="size-4" /> Eksik Alanları Şablondan Ekle
                </Button>
              )}
            </div>

            {/* Ekleme / düzenleme formu */}
            <div className="rounded-lg border border-border/60 p-3">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                {!editingSpecId && availableSpecProductTypes.length > 1 && (
                  <div className="md:col-span-6">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Uygulanacak Ürün Tipleri</label>
                    <MultiSelect
                      options={availableSpecProductTypes.map((item) => ({ value: item.code, label: item.label }))}
                      selected={specTargetTypes}
                      onChange={setSpecTargetTypes}
                      placeholder="Ürün tipi seçin"
                      emptyText="Ürün tipi yok"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">Bu teknik alan seçilen tüm ürün tiplerine tek seferde eklenir.</p>
                  </div>
                )}
                <div className="md:col-span-2">
                  {specTemplateOptions.length ? (
                    <SettingsSelect
                      label="Alan Etiketi"
                      value={specForm.specKey}
                      onChange={applySpecTemplateKey}
                      options={[
                        { value: "", label: "Alan seçin" },
                        ...specTemplateOptions.map((item) => ({ value: item.key, label: item.key })),
                      ]}
                    />
                  ) : (
                    <SettingsField label="Alan Etiketi" value={specForm.specKey} onChange={(v) => setSpecForm({ ...specForm, specKey: v })} />
                  )}
                </div>
                <SettingsSelect
                  label="Grup"
                  value={specForm.specGroupCode}
                  onChange={(v) => setSpecForm({ ...specForm, specGroupCode: v })}
                  options={[
                    { value: "", label: "Otomatik" },
                    ...PRODUCT_SPEC_GROUPS.map((group) => ({ value: group.code, label: group.label })),
                  ]}
                />
                <SettingsField label="Başlangıç Değeri" value={specForm.defaultValue} onChange={(v) => setSpecForm({ ...specForm, defaultValue: v })} />
                <SettingsField
                  label="Birim"
                  value={specForm.specUnit}
                  disabled={Boolean(specTemplateOptions.length && specForm.specKey && specEntriesForType(specFormCategoryCode, specForm.productTypeCode).some((e) => e.key === specForm.specKey))}
                  onChange={(v) => setSpecForm({ ...specForm, specUnit: v })}
                />
                <SettingsField label="Sıra" value={specForm.sortOrder} onChange={(v) => setSpecForm({ ...specForm, sortOrder: v })} />
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={specForm.isActive}
                    onChange={(e) => setSpecForm({ ...specForm, isActive: e.target.checked })}
                  />
                  Aktif
                </label>
                <div className="md:col-span-6 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Başlangıç değeri, yeni ürün oluşturulurken bu teknik bilgi alanına otomatik gelen değerdir. Boş bırakılırsa alan boş gelir.
                </div>
                <div className="md:col-span-6 flex justify-end gap-2">
                  {editingSpecId && (
                    <Button type="button" variant="outline" onClick={() => resetSpecTemplateForm()}>
                      Temizle
                    </Button>
                  )}
                  <Button type="button" onClick={submitSpecTemplate} disabled={specBusy} className="gap-1">
                    <Plus className="size-4" /> {editingSpecId ? "Güncelle" : "Ekle"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Arama */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Teknik alanlarda ara…"
                className="pl-9"
              />
            </div>

            {/* Grup akordeonları */}
            {groupedDisplay.length ? (
              <Accordion type="multiple" value={openGroupValues} className="rounded-lg border border-border/60 bg-card">
                {groupedDisplay.map(({ group, rows }) => {
                  const inactive = rows.filter((row) => row.dbRow && !row.isActive).length;
                  const catalogOnly = rows.filter((row) => !row.dbRow).length;
                  return (
                    <AccordionItem key={group.code} value={group.code} className="border-border/60 px-3">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground/80">{group.label}</span>
                          <Badge variant="secondary">{rows.length}</Badge>
                          {catalogOnly > 0 && (
                            <Badge variant="outline" className="border-warning/40 bg-warning-soft text-warning">{catalogOnly} eksik</Badge>
                          )}
                          {inactive > 0 && <Badge variant="outline" className="text-muted-foreground">{inactive} pasif</Badge>}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-0">
                        <SpecGroupTable rows={rows} onAdd={addCatalogEntry} onEdit={editSpecTemplate} onDelete={deleteSpecTemplate} disabled={specBusy} />
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            ) : (
              <div className="rounded-lg border border-border/60 px-3 py-8 text-center text-sm text-muted-foreground">
                {search ? (
                  "Aramanızla eşleşen teknik alan yok."
                ) : hasCatalog ? (
                  <div className="space-y-2">
                    <p>Bu ürün tipi için henüz kayıtlı teknik alan yok.</p>
                    <Button type="button" size="sm" variant="outline" className="gap-1" disabled={specBusy} onClick={seedMissingFromCatalog}>
                      <Sparkles className="size-4" /> Şablondan Doldur
                    </Button>
                  </div>
                ) : (
                  "Bu ürün tipi için katalog şablonu yok, alanları elle ekleyin."
                )}
              </div>
            )}
          </>
        )}
    </SettingsSection>
  );
}

function SpecGroupTable({
  rows,
  onAdd,
  onEdit,
  onDelete,
  disabled,
}: {
  rows: SpecDisplayRow[];
  onAdd: (row: SpecDisplayRow) => void;
  onEdit: (row: SpecTemplateRow) => void;
  onDelete: (row: SpecTemplateRow) => void;
  disabled: boolean;
}) {
  return (
    <div className="min-w-0 overflow-x-auto pb-2">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/20 text-left text-[11px] uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Alan</th>
            <th className="px-3 py-2">Başlangıç Değeri</th>
            <th className="px-3 py-2">Birim</th>
            <th className="px-3 py-2">Sıra</th>
            <th className="px-3 py-2">Durum</th>
            <th className="px-3 py-2 text-right">İşlem</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isCatalogOnly = !row.dbRow;
            return (
              <tr
                key={row.reactKey}
                className={`border-t border-dotted border-foreground/20 ${isCatalogOnly ? "bg-muted/20 text-muted-foreground" : ""}`}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={isCatalogOnly ? "" : "font-medium text-foreground"}>{row.specKey}</span>
                    {isCatalogOnly && (
                      <Badge variant="outline" className="border-warning/40 bg-warning-soft text-warning">Katalogda</Badge>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">{row.defaultValue && row.defaultValue !== "-" ? row.defaultValue : "-"}</td>
                <td className="px-3 py-2">{row.specUnit || "-"}</td>
                <td className="px-3 py-2 tabular-nums">{isCatalogOnly ? "-" : row.sortOrder}</td>
                <td className="px-3 py-2">
                  {isCatalogOnly ? (
                    <Badge variant="outline" className="text-muted-foreground">Kayıtlı değil</Badge>
                  ) : row.isActive ? (
                    <Badge variant="outline" className="border-success/40 bg-success-soft text-success">Aktif</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">Pasif</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {isCatalogOnly ? (
                      <Button type="button" size="sm" variant="outline" className="h-8 gap-1" disabled={disabled} onClick={() => onAdd(row)}>
                        <Plus className="size-4" /> Ekle
                      </Button>
                    ) : (
                      <>
                        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => onEdit(row.dbRow!)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => onDelete(row.dbRow!)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
