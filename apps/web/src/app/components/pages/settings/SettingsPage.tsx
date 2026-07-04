import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Switch } from "../../ui/switch";
import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../lib/auth";
import { adminService } from "../../../../lib/services";
import {
  PRODUCT_SPEC_GROUPS,
  machineSpecTemplateEntries,
  normalizeProductSpecKey,
  productSpecGroupForTypeKey,
  type ProductSpecGroup,
} from "../../../lib/productSpecTemplates";

type Preferences = {
  notifyNewCase: boolean;
  notifyQuoteApproved: boolean;
  notifyPaymentOverdue: boolean;
  notifyService: boolean;
  currency: string;
  timezone: string;
};

type CompanyInfo = {
  companyName: string;
  taxId: string;
  email: string;
  phone: string;
};

const prefDefaults: Preferences = {
  notifyNewCase: true,
  notifyQuoteApproved: true,
  notifyPaymentOverdue: true,
  notifyService: false,
  currency: "USD",
  timezone: "Europe/Istanbul",
};

const companyDefaults: CompanyInfo = {
  companyName: "",
  taxId: "",
  email: "",
  phone: "",
};

type LookupRow = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  province?: string | null;
};

type LookupForm = {
  code: string;
  name: string;
  description: string;
  province: string;
  sortOrder: string;
  isActive: boolean;
};

type SpecTemplateRow = {
  id: string;
  productTypeCode: string;
  specKey: string;
  defaultValue?: string | null;
  specUnit?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

type ProductOption = { code: string; label: string };
type ProductTypeOption = ProductOption & { categoryCode: string; subcategoryCode?: string };
type SpecTemplateDisplayGroup = { group: ProductSpecGroup; rows: SpecTemplateRow[] };
type SpecTemplateDisplaySection = {
  id: string;
  title: string;
  description: string;
  groups: SpecTemplateDisplayGroup[];
};

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
      { code: "CNC_YATAY_ISLEME_MERKEZI", label: "CNC Yatay İşleme Merkezi", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI" },
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

type SpecTemplateScope = {
  categoryCode: string;
  subcategoryCode: string;
  productTypeCode: string;
};

const lookupLabels: Record<string, string> = {
  "company-sectors": "Sektörler",
  "contact-sources": "Firma İrtibat Şekli",
  "company-groups": "Firma Grupları",
  "company-statuses": "Firma Durumları",
  "company-relation-types": "Firma İlişki Türleri",
  "decision-roles": "Karar Rolleri",
  "activity-types": "Aktivite Türleri",
  "pipeline-stages": "Satış Aşamaları",
  "opportunity-statuses": "Satış Kartı Durumları",
  "quote-statuses": "Teklif Durumları",
  "proforma-statuses": "Proforma Durumları",
  "contract-statuses": "Sözleşme Durumları",
  "product-types": "Ürün Tipleri",
  "product-groups": "Ürün Grupları",
  "product-categories": "Ürün Kategorileri",
  "product-subcategories": "Ürün Alt Kategorileri",
  "product-spec-groups": "Teknik Bilgi Grupları",
  "equipment-types": "Donanım Tipleri",
  "units": "Birimler",
  "inventory-statuses": "Stok Durumları",
  "stock-location-statuses": "Stok Lokasyon Durumları",
  "warranty-statuses": "Garanti Durumları",
  "service-ticket-statuses": "Servis Talebi Durumları",
  "installation-statuses": "Kurulum Durumları",
  "shipment-statuses": "Sevkiyat Durumları",
  "payment-statuses": "Ödeme Durumları",
  "invoice-statuses": "Fatura Durumları",
  "currencies": "Para Birimleri",
  "file-document-types": "Doküman Türleri",
  "storage-providers": "Depolama Sağlayıcıları",
  "tax-offices": "Vergi Daireleri",
};

const LOOKUP_MENU_GROUPS: Array<{ label: string; names: string[] }> = [
  {
    label: "Firma",
    names: ["company-sectors", "company-groups", "company-statuses", "company-relation-types", "contact-sources", "decision-roles", "tax-offices"],
  },
  {
    label: "Satış",
    names: ["pipeline-stages", "opportunity-statuses", "activity-types", "quote-statuses", "proforma-statuses", "contract-statuses"],
  },
  {
    label: "Ürün",
    names: ["product-categories", "product-subcategories", "product-types", "product-groups", "product-spec-groups", "equipment-types", "units"],
  },
  {
    label: "Stok & Servis",
    names: ["inventory-statuses", "stock-location-statuses", "warranty-statuses", "service-ticket-statuses", "installation-statuses", "shipment-statuses"],
  },
  {
    label: "Finans",
    names: ["payment-statuses", "invoice-statuses", "currencies"],
  },
  {
    label: "Genel",
    names: ["file-document-types", "storage-providers"],
  },
];

const emptyLookupForm: LookupForm = { code: "", name: "", description: "", province: "", sortOrder: "0", isActive: true };
const emptySpecForm = { productTypeCode: "", specKey: "", defaultValue: "", specUnit: "", sortOrder: "0", isActive: true };
const emptySpecScope: SpecTemplateScope = { categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI", productTypeCode: "" };

// Eski şablon kayıtları bu ürün tipi kodlarıyla saklanmış olabilir; güncel kodlara eşlenir.
const LEGACY_PRODUCT_TYPE_ALIASES: Record<string, string> = {
  DIK_ISLEME_MERKEZI: "CNC_DIK_ISLEME_MERKEZ",
  YATAY_ISLEME_MERKEZI: "CNC_YATAY_ISLEME_MERKEZI",
  KOPRU_TIPI_ISLEME_MERKEZI: "CNC_KOPRU_TIPI_ISLEME_MERKEZI",
  CNC_TORNA: "CNC_YATAY_TORNA_TEZGAHI",
};

const canonicalProductTypeCode = (code: string) => LEGACY_PRODUCT_TYPE_ALIASES[code] ?? code;
const productTypeLabel = (code: string) =>
  TEMPLATE_PRODUCT_TYPES.find((item) => item.code === canonicalProductTypeCode(code))?.label ?? code;
const productTypeByCode = (code: string) => TEMPLATE_PRODUCT_TYPES.find((item) => item.code === canonicalProductTypeCode(code));
const specTemplateKey = (row: SpecTemplateRow) => normalizeProductSpecKey(row.specKey);

const groupSpecTemplateRows = (rows: SpecTemplateRow[]): SpecTemplateDisplayGroup[] => {
  const buckets = new Map<ProductSpecGroup["code"], SpecTemplateRow[]>();
  for (const row of rows) {
    const group = productSpecGroupForTypeKey(canonicalProductTypeCode(row.productTypeCode), { key: row.specKey, value: row.defaultValue ?? "" });
    buckets.set(group.code, [...(buckets.get(group.code) ?? []), row]);
  }
  return PRODUCT_SPEC_GROUPS.map((group) => ({ group, rows: buckets.get(group.code) ?? [] })).filter((item) => item.rows.length > 0);
};

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

function storageKey(userId?: string) {
  return userId ? `haksan:settings:${userId}` : "haksan:settings:guest";
}

export function SettingsPage() {
  const { user, hasPermission, hasRole } = useAuth();
  const canReadTenant = hasPermission("tenants.read");
  const canEditTenant = hasPermission("tenants.update");
  const canManageLookups = hasRole("super_admin");

  const [prefs, setPrefs] = useState<Preferences>(() => {
    try {
      const raw = localStorage.getItem(storageKey(user?.id));
      return raw ? { ...prefDefaults, ...JSON.parse(raw) } : prefDefaults;
    } catch {
      return prefDefaults;
    }
  });
  const [prefsSaved, setPrefsSaved] = useState(false);

  const [company, setCompany] = useState<CompanyInfo>(companyDefaults);
  const [companyLoading, setCompanyLoading] = useState(canReadTenant);
  const [companySaving, setCompanySaving] = useState(false);
  const [lookupNames, setLookupNames] = useState<string[]>([]);
  const [selectedLookup, setSelectedLookup] = useState("company-sectors");
  const [lookupRows, setLookupRows] = useState<LookupRow[]>([]);
  const [lookupForm, setLookupForm] = useState<LookupForm>(emptyLookupForm);
  const [editingLookupId, setEditingLookupId] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [specRows, setSpecRows] = useState<SpecTemplateRow[]>([]);
  const [specScope, setSpecScope] = useState<SpecTemplateScope>(emptySpecScope);
  const [specForm, setSpecForm] = useState(emptySpecForm);
  const [editingSpecId, setEditingSpecId] = useState<string | null>(null);
  const [specBusy, setSpecBusy] = useState(false);

  const lookupMenuGroups = useMemo(() => {
    const names = new Set(lookupNames.length ? lookupNames : Object.keys(lookupLabels));
    const grouped = new Set(LOOKUP_MENU_GROUPS.flatMap((group) => group.names));
    const rest = [...names]
      .filter((name) => !grouped.has(name))
      .sort((a, b) => (lookupLabels[a] ?? a).localeCompare(lookupLabels[b] ?? b, "tr-TR"));
    const groups = LOOKUP_MENU_GROUPS.map((group) => ({
      label: group.label,
      names: group.names.filter((name) => names.has(name)),
    }));
    if (rest.length) groups.push({ label: "Diğer", names: rest });
    return groups.filter((group) => group.names.length > 0);
  }, [lookupNames]);

  const availableSpecSubcategories = useMemo(() => subcategoriesForCategory(specScope.categoryCode), [specScope.categoryCode]);

  const availableSpecProductTypes = useMemo(
    () => productTypesForScope(specScope.categoryCode, specScope.subcategoryCode),
    [specScope.categoryCode, specScope.subcategoryCode],
  );

  const filteredSpecRows = useMemo(() => {
    if (specScope.productTypeCode) return specRows.filter((row) => canonicalProductTypeCode(row.productTypeCode) === specScope.productTypeCode);
    const availableCodes = new Set(availableSpecProductTypes.map((item) => item.code));
    return specRows.filter((row) => availableCodes.has(canonicalProductTypeCode(row.productTypeCode)));
  }, [availableSpecProductTypes, specRows, specScope.productTypeCode]);

  const scopedSpecRows = useMemo(() => {
    const availableCodes = new Set(availableSpecProductTypes.map((item) => item.code));
    return specRows.filter((row) => availableCodes.has(canonicalProductTypeCode(row.productTypeCode)));
  }, [availableSpecProductTypes, specRows]);

  const commonSpecKeys = useMemo(() => {
    const productTypesByKey = new Map<string, Set<string>>();
    for (const row of scopedSpecRows) {
      const key = specTemplateKey(row);
      if (!key) continue;
      const codes = productTypesByKey.get(key) ?? new Set<string>();
      codes.add(canonicalProductTypeCode(row.productTypeCode));
      productTypesByKey.set(key, codes);
    }
    return new Set(
      [...productTypesByKey.entries()]
        .filter(([, productTypeCodes]) => productTypeCodes.size > 1)
        .map(([key]) => key),
    );
  }, [scopedSpecRows]);

  const specTemplateSections = useMemo<SpecTemplateDisplaySection[]>(() => {
    const commonRows = filteredSpecRows.filter((row) => commonSpecKeys.has(specTemplateKey(row)));
    const specificRows = filteredSpecRows.filter((row) => !commonSpecKeys.has(specTemplateKey(row)));
    const selectedTypeLabel = specScope.productTypeCode ? productTypeLabel(specScope.productTypeCode) : "Seçili kapsam";
    return [
      {
        id: "common",
        title: "Ortak Teknik Bilgiler",
        description: "Seçili üst/alt grupta birden fazla ürün tipinde kullanılan alanlar.",
        rows: commonRows,
      },
      {
        id: "specific",
        title: specScope.productTypeCode ? `${selectedTypeLabel} Özel Teknik Bilgiler` : "Ürün Tipine Özel Teknik Bilgiler",
        description: "Sadece tek ürün tipinde bulunan veya kapsam içinde ortak olmayan alanlar.",
        rows: specificRows,
      },
    ]
      .map((section) => ({ ...section, groups: groupSpecTemplateRows(section.rows) }))
      .filter((section) => section.groups.length > 0);
  }, [commonSpecKeys, filteredSpecRows, specScope.productTypeCode]);

  useEffect(() => {
    if (!canReadTenant) return;
    let cancelled = false;
    setCompanyLoading(true);
    adminService
      .tenant()
      .then((t) => {
        if (cancelled) return;
        setCompany({
          companyName: t.name ?? "",
          taxId: t.taxNumber ?? "",
          email: t.email ?? "",
          phone: t.phone ?? "",
        });
      })
      .catch(() => {
        if (!cancelled) toast.error("Şirket bilgileri yüklenemedi");
      })
      .finally(() => {
        if (!cancelled) setCompanyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canReadTenant]);

  const loadLookupRows = async (name = selectedLookup) => {
    if (!canManageLookups) return;
    setLookupBusy(true);
    try {
      setLookupRows(await adminService.lookupRows(name));
    } catch (err: any) {
      toast.error("Lookup kayıtları yüklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setLookupBusy(false);
    }
  };

  useEffect(() => {
    if (!canManageLookups) return;
    let cancelled = false;
    adminService
      .lookups()
      .then((res) => {
        if (cancelled) return;
        setLookupNames(res.available ?? []);
        if (res.available?.length && !res.available.includes(selectedLookup)) setSelectedLookup(res.available[0]);
      })
      .catch(() => setLookupNames(Object.keys(lookupLabels)));
    return () => {
      cancelled = true;
    };
  }, [canManageLookups]);

  useEffect(() => {
    void loadLookupRows(selectedLookup);
    setLookupForm(emptyLookupForm);
    setEditingLookupId(null);
  }, [selectedLookup, canManageLookups]);

  const loadSpecTemplates = async () => {
    if (!canManageLookups) return;
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
  }, [canManageLookups]);

  const submitLookup = async () => {
    if (!lookupForm.name.trim()) return toast.error("Ad alanı zorunludur");
    if (selectedLookup === "tax-offices" && !lookupForm.province.trim()) return toast.error("Vergi dairesi için il zorunludur");
    const body = {
      code: lookupForm.code || undefined,
      name: lookupForm.name,
      description: lookupForm.description || undefined,
      province: selectedLookup === "tax-offices" ? lookupForm.province : undefined,
      sortOrder: Number(lookupForm.sortOrder || 0),
      isActive: lookupForm.isActive,
    };
    setLookupBusy(true);
    try {
      if (editingLookupId) await adminService.updateLookup(selectedLookup, editingLookupId, body);
      else await adminService.createLookup(selectedLookup, body);
      toast.success(editingLookupId ? "Lookup güncellendi" : "Lookup eklendi");
      setLookupForm(emptyLookupForm);
      setEditingLookupId(null);
      await loadLookupRows(selectedLookup);
    } catch (err: any) {
      toast.error("Lookup kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setLookupBusy(false);
    }
  };

  const editLookup = (row: LookupRow) => {
    setEditingLookupId(row.id);
    setLookupForm({
      code: row.code ?? "",
      name: row.name ?? "",
      description: row.description ?? "",
      province: row.province ?? "",
      sortOrder: String(row.sortOrder ?? 0),
      isActive: row.isActive !== false,
    });
  };

  const deleteLookup = async (row: LookupRow) => {
    if (!window.confirm(`${row.name} kaydı silinsin mi? Kullanılıyorsa pasifleştirilecek.`)) return;
    setLookupBusy(true);
    try {
      const result = await adminService.deleteLookup(selectedLookup, row.id);
      toast.success(result?.deactivated ? "Lookup pasifleştirildi" : "Lookup silindi");
      await loadLookupRows(selectedLookup);
    } catch (err: any) {
      toast.error("Lookup silinemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setLookupBusy(false);
    }
  };

  // Şablonu olan tezgahlarda alan etiketi katalog listesinden seçilir; birim
  // şablondan sabit gelir, sadece başlangıç değeri elle girilir.
  const specTemplateOptions = useMemo(
    () => [...machineSpecTemplateEntries(specForm.productTypeCode)],
    [specForm.productTypeCode],
  );

  const applySpecTemplateKey = (specKey: string) => {
    const item = specTemplateOptions.find((option) => option.key === specKey);
    setSpecForm((current) => ({
      ...current,
      specKey,
      specUnit: item ? item.unit : current.specUnit,
      defaultValue: current.defaultValue || (item?.value ?? ""),
    }));
  };

  const resetSpecTemplateForm = (productTypeCode = specScope.productTypeCode) => {
    setEditingSpecId(null);
    setSpecForm({ ...emptySpecForm, productTypeCode });
  };

  const changeSpecCategory = (categoryCode: string) => {
    const nextScope = scopeForCategory(categoryCode);
    setSpecScope(nextScope);
    resetSpecTemplateForm("");
  };

  const changeSpecSubcategory = (subcategoryCode: string) => {
    setSpecScope({ categoryCode: specScope.categoryCode, subcategoryCode, productTypeCode: "" });
    resetSpecTemplateForm("");
  };

  const changeSpecProductType = (productTypeCode: string) => {
    setSpecScope(productTypeCode ? scopeForProductType(productTypeCode) : { ...specScope, productTypeCode: "" });
    resetSpecTemplateForm(productTypeCode);
  };

  const submitSpecTemplate = async () => {
    const productTypeCode = specForm.productTypeCode.trim();
    if (!productTypeCode || !specForm.specKey.trim()) return toast.error("Ürün tipi ve teknik alan zorunludur");
    const body = {
      productTypeCode,
      specKey: specForm.specKey.trim(),
      defaultValue: specForm.defaultValue || undefined,
      specUnit: specForm.specUnit || undefined,
      sortOrder: Number(specForm.sortOrder || 0),
      isActive: specForm.isActive,
    };
    setSpecBusy(true);
    try {
      if (editingSpecId) await adminService.updateProductSpecTemplate(editingSpecId, body);
      else await adminService.createProductSpecTemplate(body);
      toast.success(editingSpecId ? "Teknik alan güncellendi" : "Teknik alan eklendi");
      setSpecForm({ ...emptySpecForm, productTypeCode });
      setEditingSpecId(null);
      await loadSpecTemplates();
    } catch (err: any) {
      toast.error("Teknik alan kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSpecBusy(false);
    }
  };

  const editSpecTemplate = (row: SpecTemplateRow) => {
    setEditingSpecId(row.id);
    setSpecScope(scopeForProductType(row.productTypeCode));
    setSpecForm({
      productTypeCode: canonicalProductTypeCode(row.productTypeCode),
      specKey: row.specKey,
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

  const savePrefs = () => {
    localStorage.setItem(storageKey(user?.id), JSON.stringify(prefs));
    setPrefsSaved(true);
    toast.success("Tercihler kaydedildi", {
      description: user ? "Bu kullanıcı için bu cihazda saklandı." : "Bu cihazda saklandı.",
    });
    setTimeout(() => setPrefsSaved(false), 2000);
  };

  const saveCompany = async () => {
    if (!canEditTenant) return;
    setCompanySaving(true);
    try {
      const updated = await adminService.updateTenant({
        name: company.companyName,
        taxNumber: company.taxId || null,
        email: company.email || null,
        phone: company.phone || null,
      });
      setCompany({
        companyName: updated.name ?? "",
        taxId: updated.taxNumber ?? "",
        email: updated.email ?? "",
        phone: updated.phone ?? "",
      });
      toast.success("Şirket bilgileri kaydedildi");
    } catch (err: any) {
      toast.error("Şirket bilgileri kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setCompanySaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        Kurumsal şirket bilgileri tenant kaydından yönetilir ve tüm kullanıcılarda ortaktır. Bildirim ve görünüm tercihleri kullanıcı bazında bu cihazda saklanır.
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Şirket Bilgileri</CardTitle>
            {canEditTenant && (
              <Button size="sm" onClick={saveCompany} disabled={companyLoading || companySaving} className="gap-1">
                <Save className="size-4" /> {companySaving ? "Kaydediliyor" : "Kaydet"}
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {!canReadTenant ? (
              <p className="text-sm text-muted-foreground">Şirket bilgilerini görüntüleme yetkiniz yok.</p>
            ) : companyLoading ? (
              <p className="text-sm text-muted-foreground">Yükleniyor…</p>
            ) : (
              <>
                <SettingsField label="Şirket Adı" value={company.companyName} disabled={!canEditTenant} onChange={(v) => setCompany({ ...company, companyName: v })} />
                <SettingsField label="VKN" value={company.taxId} disabled={!canEditTenant} onChange={(v) => setCompany({ ...company, taxId: v })} />
                <SettingsField label="E-posta" value={company.email} disabled={!canEditTenant} onChange={(v) => setCompany({ ...company, email: v })} />
                <SettingsField label="Telefon" value={company.phone} disabled={!canEditTenant} onChange={(v) => setCompany({ ...company, phone: v })} />
                {!canEditTenant && <p className="text-xs text-muted-foreground">Düzenleme için yönetici yetkisi gerekir.</p>}
              </>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader><CardTitle>Bildirimler</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <SettingsToggle label="Yeni satış kartı oluşturulduğunda" checked={prefs.notifyNewCase} onChange={(v) => setPrefs({ ...prefs, notifyNewCase: v })} />
            <SettingsToggle label="Teklif onaylandığında" checked={prefs.notifyQuoteApproved} onChange={(v) => setPrefs({ ...prefs, notifyQuoteApproved: v })} />
            <SettingsToggle label="Ödeme gecikmesinde" checked={prefs.notifyPaymentOverdue} onChange={(v) => setPrefs({ ...prefs, notifyPaymentOverdue: v })} />
            <SettingsToggle label="Yeni servis talebinde" checked={prefs.notifyService} onChange={(v) => setPrefs({ ...prefs, notifyService: v })} />
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader><CardTitle>Para Birimi & Bölge</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <SettingsField label="Varsayılan Para Birimi" value={prefs.currency} onChange={(v) => setPrefs({ ...prefs, currency: v })} />
            <SettingsField label="Saat Dilimi" value={prefs.timezone} onChange={(v) => setPrefs({ ...prefs, timezone: v })} />
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader><CardTitle>Depolama</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Dosya yüklemeleri S3 uyumlu depolamada tutulur. Bucket ve sağlayıcı yapılandırması sunucu tarafından yönetilir.</p>
          </CardContent>
        </Card>
      </div>
      <Button onClick={savePrefs} className="gap-1">
        <Save className="size-4" /> {prefsSaved ? "Tercihler Kaydedildi" : "Tercihleri Kaydet"}
      </Button>
      {canManageLookups && (
        <>
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <CardHeader>
              <CardTitle>CRM Alan Ayarları</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
                <div className="rounded-lg border border-border/60 overflow-hidden">
                  {lookupMenuGroups.map((group) => (
                    <div key={group.label} className="border-b border-border/60 last:border-b-0">
                      <div className="bg-muted/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/70">
                        {group.label}
                      </div>
                      {group.names.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setSelectedLookup(name)}
                          className={`block w-full px-3 py-2 text-left text-sm border-t border-border/60 ${selectedLookup === name ? "bg-primary/10 text-primary" : "hover:bg-muted/50"}`}
                        >
                          {lookupLabels[name] ?? name}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-2 rounded-lg border border-border/60 p-3">
                    <SettingsField label="Kod" value={lookupForm.code} onChange={(v) => setLookupForm({ ...lookupForm, code: v })} />
                    <div className="md:col-span-2">
                      <SettingsField label="Ad" value={lookupForm.name} onChange={(v) => setLookupForm({ ...lookupForm, name: v })} />
                    </div>
                    {selectedLookup === "tax-offices" && (
                      <SettingsField label="İl" value={lookupForm.province} onChange={(v) => setLookupForm({ ...lookupForm, province: v })} />
                    )}
                    <SettingsField label="Sıra" value={lookupForm.sortOrder} onChange={(v) => setLookupForm({ ...lookupForm, sortOrder: v })} />
                    <label className="flex items-end gap-2 pb-2 text-sm">
                      <input
                        type="checkbox"
                        checked={lookupForm.isActive}
                        onChange={(e) => setLookupForm({ ...lookupForm, isActive: e.target.checked })}
                      />
                      Aktif
                    </label>
                    <div className="md:col-span-6">
                      <SettingsField label="Açıklama" value={lookupForm.description} onChange={(v) => setLookupForm({ ...lookupForm, description: v })} />
                    </div>
                    <div className="md:col-span-6 flex justify-end gap-2">
                      {editingLookupId && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setEditingLookupId(null);
                            setLookupForm(emptyLookupForm);
                          }}
                        >
                          Temizle
                        </Button>
                      )}
                      <Button type="button" onClick={submitLookup} disabled={lookupBusy} className="gap-1">
                        <Plus className="size-4" /> {editingLookupId ? "Güncelle" : "Ekle"}
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border/60 bg-white">
                    <div className="grid grid-cols-[56px_minmax(0,1fr)]">
                      <div className="flex items-center justify-center border-r border-border/60 bg-muted/50 px-1 py-2">
                        <div className="rotate-180 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/80 [writing-mode:vertical-rl]">
                          {lookupLabels[selectedLookup] ?? selectedLookup}
                        </div>
                      </div>
                      <div className="min-w-0 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/20 text-left text-[11px] uppercase text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2">Kod</th>
                              <th className="px-3 py-2">Ad</th>
                              <th className="px-3 py-2">Açıklama</th>
                              {selectedLookup === "tax-offices" && <th className="px-3 py-2">İl</th>}
                              <th className="px-3 py-2">Sıra</th>
                              <th className="px-3 py-2">Durum</th>
                              <th className="px-3 py-2 text-right">İşlem</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lookupRows.map((row) => (
                              <tr key={row.id} className="border-t border-dotted border-foreground/30">
                                <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                                <td className="px-3 py-2 font-medium">{row.name}</td>
                                <td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted-foreground" title={row.description ?? undefined}>{row.description || "-"}</td>
                                {selectedLookup === "tax-offices" && <td className="px-3 py-2">{row.province || "-"}</td>}
                                <td className="px-3 py-2">{row.sortOrder ?? 0}</td>
                                <td className="px-3 py-2">{row.isActive === false ? "Pasif" : "Aktif"}</td>
                                <td className="px-3 py-2">
                                  <div className="flex justify-end gap-1">
                                    <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => editLookup(row)}>
                                      <Pencil className="size-4" />
                                    </Button>
                                    <Button type="button" variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => deleteLookup(row)}>
                                      <Trash2 className="size-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {!lookupRows.length && (
                              <tr>
                                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={selectedLookup === "tax-offices" ? 7 : 6}>
                                  Kayıt yok.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm overflow-hidden">
            <CardHeader>
              <CardTitle>Ürün Teknik Bilgi Şablonları</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
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
                    { value: "", label: "Tüm ürün tipleri" },
                    ...availableSpecProductTypes.map((item) => ({ value: item.code, label: item.label })),
                  ]}
                />
              </div>
              <div className="rounded-lg border border-border/60 p-3">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                  <SettingsField label="Ürün Tipi Kodu" value={specForm.productTypeCode} disabled onChange={(v) => setSpecForm({ ...specForm, productTypeCode: v })} />
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
                  <SettingsField label="Yeni Ürün Başlangıç Değeri" value={specForm.defaultValue} onChange={(v) => setSpecForm({ ...specForm, defaultValue: v })} />
                  <SettingsField
                    label="Birim"
                    value={specForm.specUnit}
                    disabled={Boolean(specTemplateOptions.length && specForm.specKey)}
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
              <div className="space-y-3">
                {specTemplateSections.map((section) => (
                  <SpecTemplateSectionTable
                    key={section.id}
                    section={section}
                    onEdit={editSpecTemplate}
                    onDelete={deleteSpecTemplate}
                  />
                ))}
                {!specTemplateSections.length && (
                  <div className="rounded-lg border border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
                    Seçili kapsamda kayıt yok.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SpecTemplateSectionTable({
  section,
  onEdit,
  onDelete,
}: {
  section: SpecTemplateDisplaySection;
  onEdit: (row: SpecTemplateRow) => void;
  onDelete: (row: SpecTemplateRow) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-white">
      <div className="border-b border-border/60 bg-muted/40 px-3 py-2">
        <div className="text-sm font-semibold">{section.title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{section.description}</div>
      </div>
      {section.groups.map(({ group, rows }, groupIndex) => (
        <div
          key={`${section.id}-${group.code}`}
          className={`grid grid-cols-[56px_minmax(0,1fr)] ${groupIndex > 0 ? "border-t border-border/60" : ""}`}
        >
          <div className="flex items-center justify-center border-r border-border/60 bg-muted/50 px-1 py-2">
            <div className="rotate-180 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/80 [writing-mode:vertical-rl]">
              {group.label}
            </div>
          </div>
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/20 text-left text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Ürün Tipi</th>
                  <th className="px-3 py-2">Alan</th>
                  <th className="px-3 py-2">Başlangıç Değeri</th>
                  <th className="px-3 py-2">Birim</th>
                  <th className="px-3 py-2">Sıra</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-dotted border-foreground/30">
                    <td className="px-3 py-2">
                      <div className="font-medium">{productTypeLabel(row.productTypeCode)}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{row.productTypeCode}</div>
                    </td>
                    <td className="px-3 py-2">{row.specKey}</td>
                    <td className="px-3 py-2">{row.defaultValue || "-"}</td>
                    <td className="px-3 py-2">{row.specUnit || "-"}</td>
                    <td className="px-3 py-2">{row.sortOrder ?? 0}</td>
                    <td className="px-3 py-2">{row.isActive === false ? "Pasif" : "Aktif"}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => onEdit(row)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => onDelete(row)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function SettingsField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-1" />
    </div>
  );
}

function SettingsSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-input bg-input-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-[3px] focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option.value || option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SettingsToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="font-normal text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
