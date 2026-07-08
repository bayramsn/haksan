import { useEffect, useMemo, useState } from "react";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Input } from "../../ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../ui/accordion";
import { Layers, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { adminService, lookupService } from "../../../../lib/services";
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
import { useAuth } from "../../../../lib/auth";
import { useStore } from "../../../lib/store";
import { ALL_DIVISIONS, isCncDivision, usePersistedSettingsDivision } from "./settings-division";

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
  divisionId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

type ProductOption = { code: string; label: string };
type ProductTypeOption = ProductOption & { categoryCode?: string; subcategoryCode?: string; productGroupCode?: string };

type SpecTemplateScope = {
  productId: string;
  categoryCode: string;
  productGroupCode: string;
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
  divisionId?: string | null;
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

const TEMPLATE_PRODUCT_GROUPS: ProductOption[] = [
  { code: "CNC", label: "CNC" },
  { code: "UNIVERSAL", label: "Üniversal" },
  { code: "SAC_ISLEME", label: "Sac İşleme" },
];

const TEMPLATE_PRODUCT_SUBCATEGORIES: ProductOption[] = [
  { code: "ISLEME_MERKEZI", label: "İşleme Merkezi" },
  { code: "TORNA", label: "Torna" },
];

const TEMPLATE_PRODUCT_TYPE_GROUPS: Array<{ label: string; options: ProductTypeOption[] }> = [
  {
    label: "İşleme Merkezi",
    options: [
      { code: "CNC_DIK_ISLEME_MERKEZ", label: "CNC Dik İşleme Merkezi", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI", productGroupCode: "CNC" },
      { code: "CNC_KOPRU_TIPI_ISLEME_MERKEZI", label: "CNC Köprü Tipi İşleme Merkezi", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI", productGroupCode: "CNC" },
      { code: "CNC_5_EKSEN_ISLEME_MERKEZI", label: "CNC 5 Eksen İşleme Merkezi", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI", productGroupCode: "CNC" },
      { code: "CNC_TAPPING_CENTER", label: "CNC Tapping Center", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI", productGroupCode: "CNC" },
    ],
  },
  {
    label: "Torna",
    options: [
      { code: "CNC_YATAY_TORNA_TEZGAHI", label: "CNC Yatay Torna Tezgahı", categoryCode: "TEZGAH", subcategoryCode: "TORNA", productGroupCode: "CNC" },
      { code: "CNC_DIK_TORNA_TEZGAHI", label: "CNC Dik Torna Tezgahı", categoryCode: "TEZGAH", subcategoryCode: "TORNA", productGroupCode: "CNC" },
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
const TEMPLATE_PRODUCT_TYPE_GROUP_BY_CODE = new Map(TEMPLATE_PRODUCT_TYPE_GROUPS.flatMap((group) => group.options.map((option) => [option.code, group.label])));

const emptySpecForm = { productTypeCode: "", specKey: "", specGroupCode: "", defaultValue: "", specUnit: "", divisionId: "", sortOrder: "0", isActive: true };
const emptySpecScope: SpecTemplateScope = { productId: "", categoryCode: "TEZGAH", productGroupCode: "CNC", subcategoryCode: "ISLEME_MERKEZI", productTypeCode: "" };

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

type LookupRow = { code: string; name: string };
const fallbackLookupRows = (options: ProductOption[]): LookupRow[] => options.map((option) => ({ code: option.code, name: option.label }));
const lookupCodeOptions = (rows: LookupRow[]) => rows.map((row) => ({ code: row.code, label: row.name }));
const findLabel = (options: ProductOption[], code: string, fallback = "") =>
  options.find((option) => option.code === code)?.label ?? fallback;

function useProductLookupRows(name: string, fallback: ProductOption[], divisionId?: string, includeShared = false) {
  const allowFallback = !divisionId;
  const [rows, setRows] = useState<LookupRow[]>(() => (allowFallback ? fallbackLookupRows(fallback) : []));
  useEffect(() => {
    let alive = true;
    const fallbackRows = allowFallback ? fallbackLookupRows(fallback) : [];
    lookupService
      .byName(name, divisionId ? { divisionId, scope: includeShared ? undefined : "exact" } : undefined)
      .then((items) => {
        if (!alive) return;
        const normalized = (items ?? [])
          .map((item: any) => ({ code: String(item.code ?? ""), name: String(item.name ?? "") }))
          .filter((item: LookupRow) => item.code && item.name);
        setRows(normalized.length ? normalized : fallbackRows);
      })
      .catch(() => alive && setRows(fallbackRows));
    return () => {
      alive = false;
    };
  }, [name, divisionId, includeShared, allowFallback]);
  return rows;
}

const subcategoriesForCategory = (
  categoryCode: string,
  productTypeOptions: ProductTypeOption[] = TEMPLATE_PRODUCT_TYPES,
  productSubcategoryOptions: ProductOption[] = TEMPLATE_PRODUCT_SUBCATEGORIES,
) => {
  const subcategoryCodes = new Set(
    productTypeOptions
      .filter((item) => (!item.categoryCode || item.categoryCode === categoryCode) && item.subcategoryCode)
      .map((item) => item.subcategoryCode!),
  );
  return productSubcategoryOptions.filter((item) => subcategoryCodes.has(item.code));
};

const productTypesForScope = (
  categoryCode: string,
  subcategoryCode: string,
  productGroupCode: string,
  productTypeOptions: ProductTypeOption[] = TEMPLATE_PRODUCT_TYPES,
  productSubcategoryOptions: ProductOption[] = TEMPLATE_PRODUCT_SUBCATEGORIES,
) => {
  const categorySubcategories = subcategoriesForCategory(categoryCode, productTypeOptions, productSubcategoryOptions);
  return productTypeOptions.filter((item) => {
    if (item.categoryCode && item.categoryCode !== categoryCode) return false;
    if (categorySubcategories.length && item.subcategoryCode && item.subcategoryCode !== subcategoryCode) return false;
    if (item.productGroupCode && productGroupCode && item.productGroupCode !== productGroupCode) return false;
    return true;
  });
};

const scopeForCategory = (categoryCode: string): SpecTemplateScope => {
  const [firstSubcategory] = subcategoriesForCategory(categoryCode);
  return { productId: "", categoryCode, productGroupCode: "", subcategoryCode: firstSubcategory?.code ?? "", productTypeCode: "" };
};

const scopeForProductType = (productTypeCode: string): SpecTemplateScope => {
  const productType = productTypeByCode(productTypeCode);
  if (!productType) return emptySpecScope;
  return {
    productId: "",
    categoryCode: productType.categoryCode ?? emptySpecScope.categoryCode,
    productGroupCode: productType.productGroupCode ?? "",
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
  // Bölüm (CNC / Üniversal / Sac İşleme) filtresi. "all" → Tümü (paylaşılan dahil hepsi).
  const { user } = useAuth();
  const { products } = useStore();
  const divisions = user?.divisions ?? [];
  const [specDivisionId, setSpecDivisionId] = usePersistedSettingsDivision();
  const selectedDivisionId = specDivisionId === ALL_DIVISIONS ? undefined : specDivisionId;
  const selectedDivisionIncludesShared = isCncDivision(divisions, specDivisionId);
  const divisionLabel = (id?: string | null) => (id ? divisions.find((d) => d.id === id)?.name ?? "Bölüm" : "Tümü");
  const divisionOptions = [{ value: ALL_DIVISIONS, label: "Tümü" }, ...divisions.map((d) => ({ value: d.id, label: d.name }))];
  const productCategoryRows = useProductLookupRows("product-categories", TEMPLATE_PRODUCT_CATEGORIES, selectedDivisionId, selectedDivisionIncludesShared);
  const productGroupRows = useProductLookupRows("product-groups", TEMPLATE_PRODUCT_GROUPS, selectedDivisionId, selectedDivisionIncludesShared);
  const productSubcategoryRows = useProductLookupRows("product-subcategories", TEMPLATE_PRODUCT_SUBCATEGORIES, selectedDivisionId, selectedDivisionIncludesShared);
  const productTypeRows = useProductLookupRows("product-types", TEMPLATE_PRODUCT_TYPES, selectedDivisionId, selectedDivisionIncludesShared);
  const productCategoryOptions = useMemo(() => lookupCodeOptions(productCategoryRows), [productCategoryRows]);
  const productGroupOptions = useMemo(() => lookupCodeOptions(productGroupRows), [productGroupRows]);
  const productSubcategoryOptions = useMemo(() => lookupCodeOptions(productSubcategoryRows), [productSubcategoryRows]);
  const scopedProducts = useMemo(() => {
    if (!selectedDivisionId) return products;
    const categoryCodes = new Set(productCategoryRows.map((row) => row.code));
    const groupCodes = new Set(productGroupRows.map((row) => row.code));
    const subcategoryCodes = new Set(productSubcategoryRows.map((row) => row.code));
    const typeCodes = new Set(productTypeRows.map((row) => row.code));
    const hasScopedRows = categoryCodes.size || groupCodes.size || subcategoryCodes.size || typeCodes.size;
    if (!hasScopedRows) return [];
    return products.filter((product) => {
      if (categoryCodes.size && (!product.categoryCode || !categoryCodes.has(product.categoryCode))) return false;
      if (groupCodes.size && (!product.productGroupCode || !groupCodes.has(product.productGroupCode))) return false;
      if (subcategoryCodes.size && (!product.subcategoryCode || !subcategoryCodes.has(product.subcategoryCode))) return false;
      if (typeCodes.size && (!product.productTypeCode || !typeCodes.has(product.productTypeCode))) return false;
      return true;
    });
  }, [productCategoryRows, productGroupRows, productSubcategoryRows, productTypeRows, products, selectedDivisionId]);
  const productTypeOptions = useMemo<ProductTypeOption[]>(() => {
    const templateByCode = new Map(TEMPLATE_PRODUCT_TYPES.map((option) => [option.code, option]));
    const byCode = new Map<string, ProductTypeOption>();
    const put = (option: ProductTypeOption) => {
      if (!option.code) return;
      const current = byCode.get(option.code);
      byCode.set(option.code, {
        code: option.code,
        label: option.label || current?.label || option.code,
        categoryCode: option.categoryCode ?? current?.categoryCode,
        subcategoryCode: option.subcategoryCode ?? current?.subcategoryCode,
        productGroupCode: option.productGroupCode ?? current?.productGroupCode,
      });
    };
    if (!selectedDivisionId) {
      TEMPLATE_PRODUCT_TYPES.forEach((option) => put(option));
    }
    productTypeRows.forEach((row) => {
      const template = templateByCode.get(canonicalProductTypeCode(row.code));
      put({
        code: row.code,
        label: row.name,
        categoryCode: template?.categoryCode,
        subcategoryCode: template?.subcategoryCode,
        productGroupCode: template?.productGroupCode,
      });
    });
    scopedProducts.forEach((product) => {
      if (!product.productTypeCode) return;
      put({
        code: product.productTypeCode,
        label: productTypeRows.find((row) => row.code === product.productTypeCode)?.name ?? product.type ?? product.productTypeCode,
        categoryCode: product.categoryCode,
        subcategoryCode: product.subcategoryCode,
        productGroupCode: product.productGroupCode,
      });
    });
    return Array.from(byCode.values());
  }, [productTypeRows, scopedProducts, selectedDivisionId]);

  const availableSpecProducts = useMemo(
    () =>
      scopedProducts
        .filter((product) => !specScope.categoryCode || product.categoryCode === specScope.categoryCode)
        .map((product) => ({
          value: product.id,
          label: [product.brand, product.model].filter(Boolean).join(" ").trim() || product.shortDescription || product.stockCode || "Ürün",
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "tr-TR", { numeric: true })),
    [scopedProducts, specScope.categoryCode],
  );
  const availableSpecSubcategories = useMemo(
    () => subcategoriesForCategory(specScope.categoryCode, productTypeOptions, productSubcategoryOptions),
    [productSubcategoryOptions, productTypeOptions, specScope.categoryCode],
  );
  const availableSpecProductGroups = useMemo(() => {
    const usedCodes = new Set(
      scopedProducts
        .filter((product) => (!specScope.categoryCode || product.categoryCode === specScope.categoryCode) && (!specScope.subcategoryCode || product.subcategoryCode === specScope.subcategoryCode))
        .map((product) => product.productGroupCode)
        .filter(Boolean),
    );
    const options = productGroupOptions.filter((option) => !usedCodes.size || usedCodes.has(option.code));
    return options.length ? options : productGroupOptions;
  }, [productGroupOptions, scopedProducts, specScope.categoryCode, specScope.subcategoryCode]);
  const availableSpecProductTypes = useMemo(
    () => productTypesForScope(specScope.categoryCode, specScope.subcategoryCode, specScope.productGroupCode, productTypeOptions, productSubcategoryOptions),
    [productSubcategoryOptions, productTypeOptions, specScope.categoryCode, specScope.productGroupCode, specScope.subcategoryCode],
  );

  const loadSpecTemplates = async () => {
    setSpecBusy(true);
    try {
      setSpecRows(await adminService.productSpecTemplates(undefined, selectedDivisionId, selectedDivisionId && !selectedDivisionIncludesShared ? "exact" : undefined));
    } catch (err: any) {
      toast.error("Teknik bilgi şablonları yüklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSpecBusy(false);
    }
  };

  useEffect(() => {
    void loadSpecTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specDivisionId, selectedDivisionIncludesShared]);

  useEffect(() => {
    setSpecScope((current) => {
      const categoryCode = current.categoryCode && productCategoryOptions.some((item) => item.code === current.categoryCode)
        ? current.categoryCode
        : productCategoryOptions[0]?.code ?? "";
      const subcategoryCode = current.subcategoryCode && productSubcategoryOptions.some((item) => item.code === current.subcategoryCode)
        ? current.subcategoryCode
        : "";
      const productGroupCode = current.productGroupCode && productGroupOptions.some((item) => item.code === current.productGroupCode)
        ? current.productGroupCode
        : "";
      const productTypeCode = current.productTypeCode && productTypeOptions.some((item) => item.code === current.productTypeCode)
        ? current.productTypeCode
        : "";
      const productId = current.productId && scopedProducts.some((item) => item.id === current.productId) ? current.productId : "";
      if (
        categoryCode === current.categoryCode &&
        subcategoryCode === current.subcategoryCode &&
        productGroupCode === current.productGroupCode &&
        productTypeCode === current.productTypeCode &&
        productId === current.productId
      ) {
        return current;
      }
      setSearch("");
      setEditingSpecId(null);
      setSpecTargetTypes(productTypeCode ? [productTypeCode] : []);
      setSpecForm({ ...emptySpecForm, productTypeCode, divisionId: selectedDivisionId ?? "" });
      return { productId, categoryCode, productGroupCode, subcategoryCode, productTypeCode };
    });
  }, [productCategoryOptions, productGroupOptions, productSubcategoryOptions, productTypeOptions, scopedProducts, selectedDivisionId]);

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
      divisionId: row.divisionId ?? null,
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
    () => productTypeOptions.find((item) => item.code === specForm.productTypeCode)?.categoryCode ?? "",
    [productTypeOptions, specForm.productTypeCode],
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
    // Yeni alan varsayılan olarak filtrede seçili bölüme atanır (Tümü → boş).
    setSpecForm({ ...emptySpecForm, productTypeCode, divisionId: selectedDivisionId ?? "" });
    setSpecTargetTypes(productTypeCode ? [productTypeCode] : []);
  };

  const changeSpecCategory = (categoryCode: string) => {
    if (!categoryCode) {
      setSpecScope({ productId: "", categoryCode: "", productGroupCode: "", subcategoryCode: "", productTypeCode: "" });
      resetSpecTemplateForm("");
      setSearch("");
      return;
    }
    const [firstSubcategory] = subcategoriesForCategory(categoryCode, productTypeOptions, productSubcategoryOptions);
    setSpecScope({ productId: "", categoryCode, productGroupCode: "", subcategoryCode: firstSubcategory?.code ?? "", productTypeCode: "" });
    resetSpecTemplateForm("");
    setSearch("");
  };

  const changeSpecProduct = (productId: string) => {
    const product = scopedProducts.find((item) => item.id === productId);
    if (!product) {
      setSpecScope((current) => ({ ...current, productId: "", productTypeCode: "" }));
      resetSpecTemplateForm("");
      setSearch("");
      return;
    }
    const productTypeCode = product.productTypeCode ?? "";
    setSpecScope({
      productId,
      categoryCode: product.categoryCode || specScope.categoryCode,
      productGroupCode: product.productGroupCode || "",
      subcategoryCode: product.subcategoryCode || "",
      productTypeCode,
    });
    resetSpecTemplateForm(productTypeCode);
    setSearch("");
  };

  const changeSpecSubcategory = (subcategoryCode: string) => {
    const selectedProduct = scopedProducts.find((item) => item.id === specScope.productId);
    const keepProduct = selectedProduct && (selectedProduct.subcategoryCode || "") === subcategoryCode;
    const productTypeCode = keepProduct ? specScope.productTypeCode : "";
    setSpecScope({
      ...specScope,
      productId: keepProduct ? specScope.productId : "",
      subcategoryCode,
      productGroupCode: keepProduct ? specScope.productGroupCode : "",
      productTypeCode,
    });
    resetSpecTemplateForm(productTypeCode);
    setSearch("");
  };

  const changeSpecProductGroup = (productGroupCode: string) => {
    const selectedProduct = scopedProducts.find((item) => item.id === specScope.productId);
    const keepProduct = selectedProduct && (selectedProduct.productGroupCode || "") === productGroupCode;
    const currentType = productTypeOptions.find((item) => item.code === specScope.productTypeCode);
    const keepType = currentType && (!currentType.productGroupCode || currentType.productGroupCode === productGroupCode);
    const productTypeCode = keepProduct ? specScope.productTypeCode : keepType ? specScope.productTypeCode : "";
    setSpecScope({ ...specScope, productId: keepProduct ? specScope.productId : "", productGroupCode, productTypeCode });
    resetSpecTemplateForm(productTypeCode);
    setSearch("");
  };

  const changeSpecDivision = (divisionId: string) => {
    const nextDivisionId = divisionId === ALL_DIVISIONS ? undefined : divisionId;
    setSpecDivisionId(divisionId);
    setSpecScope({ productId: "", categoryCode: "", productGroupCode: "", subcategoryCode: "", productTypeCode: "" });
    setSpecForm({ ...emptySpecForm, divisionId: nextDivisionId ?? "" });
    setSpecTargetTypes([]);
    setEditingSpecId(null);
    setSearch("");
  };

  const changeSpecProductType = (productTypeCode: string) => {
    const productType = productTypeOptions.find((item) => item.code === productTypeCode);
    setSpecScope(
      productTypeCode && productType
        ? {
            productId: "",
            categoryCode: productType.categoryCode || specScope.categoryCode,
            productGroupCode: productType.productGroupCode || specScope.productGroupCode,
            subcategoryCode: productType.subcategoryCode || specScope.subcategoryCode,
            productTypeCode: productType.code,
          }
        : { ...specScope, productId: "", productTypeCode: "" },
    );
    resetSpecTemplateForm(productTypeCode);
    setSearch("");
  };

  const submitSpecTemplate = async () => {
    const productTypeCode = specForm.productTypeCode.trim();
    if (!productTypeCode || !specForm.specKey.trim()) return toast.error("Ürün tipi ve teknik alan zorunludur");
    const formDivisionId = selectedDivisionId ?? (specForm.divisionId || null);
    const body = {
      productTypeCode,
      specKey: specForm.specKey.trim(),
      specGroupCode: specForm.specGroupCode || undefined,
      defaultValue: specForm.defaultValue || undefined,
      specUnit: specForm.specUnit || undefined,
      divisionId: formDivisionId,
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
      setSpecForm({ ...emptySpecForm, productTypeCode, divisionId: formDivisionId ?? "" });
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
        divisionId: specDivisionId === ALL_DIVISIONS ? null : specDivisionId,
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
        divisionId: specDivisionId === ALL_DIVISIONS ? null : specDivisionId,
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
    const productTypeCode = canonicalProductTypeCode(row.productTypeCode);
    const productType = productTypeOptions.find((item) => item.code === productTypeCode);
    setEditingSpecId(row.id);
    setSpecTargetTypes([productTypeCode]);
    setSpecScope(
      productType
        ? {
            productId: "",
            categoryCode: productType.categoryCode || specScope.categoryCode,
            productGroupCode: productType.productGroupCode || specScope.productGroupCode,
            subcategoryCode: productType.subcategoryCode || specScope.subcategoryCode,
            productTypeCode,
          }
        : scopeForProductType(row.productTypeCode),
    );
    setSpecForm({
      productTypeCode,
      specKey: row.specKey,
      specGroupCode: row.specGroupCode ?? "",
      defaultValue: row.defaultValue ?? "",
      specUnit: row.specUnit ?? "",
      divisionId: row.divisionId ?? "",
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
  const selectedSpecProductTypeLabel = productTypeOptions.find((item) => item.code === specScope.productTypeCode)?.label ?? productTypeLabel(specScope.productTypeCode);

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
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <SettingsSelect
              label="Bölüm"
              value={specDivisionId}
              onChange={changeSpecDivision}
              options={divisionOptions}
            />
            <SettingsSelect
              label="Ürün Kategorisi"
              value={specScope.categoryCode}
              onChange={changeSpecCategory}
              options={[
                { value: "", label: "Kategori seçin" },
                ...productCategoryOptions.map((item) => ({ value: item.code, label: item.label })),
              ]}
            />
            <SettingsSelect
              label="Ürün"
              value={specScope.productId}
              onChange={changeSpecProduct}
              options={[
                { value: "", label: "Tüm ürünler" },
                ...availableSpecProducts,
              ]}
            />
            <SettingsSelect
              label="Ürün Alt Kategorisi"
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
              label="Ürün Grupları"
              value={specScope.productGroupCode}
              onChange={changeSpecProductGroup}
              options={[
                { value: "", label: "Tüm gruplar" },
                ...availableSpecProductGroups.map((item) => ({ value: item.code, label: item.label })),
              ]}
            />
            <SettingsSelect
              label="Ürün Tipleri"
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
                  <span className="text-sm font-semibold">{selectedSpecProductTypeLabel}</span>
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
                <div className="flex items-end">
                  <div className="w-full rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Teknik alan <span className="font-medium text-foreground">{divisionLabel(selectedDivisionId)}</span> seçimine göre kaydedilecek.
                  </div>
                </div>
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
                        <SpecGroupTable rows={rows} onAdd={addCatalogEntry} onEdit={editSpecTemplate} onDelete={deleteSpecTemplate} disabled={specBusy} divisionLabel={divisionLabel} />
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
  divisionLabel,
}: {
  rows: SpecDisplayRow[];
  onAdd: (row: SpecDisplayRow) => void;
  onEdit: (row: SpecTemplateRow) => void;
  onDelete: (row: SpecTemplateRow) => void;
  disabled: boolean;
  divisionLabel: (id?: string | null) => string;
}) {
  return (
    <div className="min-w-0 overflow-x-auto pb-2">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/20 text-left text-[11px] uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Alan</th>
            <th className="px-3 py-2">Başlangıç Değeri</th>
            <th className="px-3 py-2">Birim</th>
            <th className="px-3 py-2">Bölüm</th>
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
                <td className="px-3 py-2">
                  {isCatalogOnly ? (
                    "-"
                  ) : (
                    <Badge variant={row.divisionId ? "secondary" : "outline"} className={row.divisionId ? "" : "text-muted-foreground"}>
                      {divisionLabel(row.divisionId)}
                    </Badge>
                  )}
                </td>
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
