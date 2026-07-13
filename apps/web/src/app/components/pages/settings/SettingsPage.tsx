import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Bell, Briefcase, Building2, CheckCircle2, Clock, Database, Download, FileCheck2, Globe, History, Layers, Package, Pencil, Plus, RotateCcw, Save, Search, Settings2, SlidersHorizontal, Sparkles, Trash2, Upload, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../lib/auth";
import { adminService } from "../../../../lib/services";
import { DIVISION_MACHINE_TYPES, MACHINE_SPEC_TEMPLATES, PRODUCT_SPEC_GROUPS } from "../../../lib/productSpecTemplates";
import { ProductSpecTemplatesCard } from "./ProductSpecTemplatesCard";
import { ALL_DIVISIONS, divisionCatalogGroupCode, isCncDivision, usePersistedSettingsDivision } from "./settings-division";
import { InfoCallout, SettingsField, SettingsSection, SettingsSelect, SettingsToggle } from "./settings-controls";

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
  divisionId?: string | null;
};

type LookupForm = {
  code: string;
  name: string;
  description: string;
  province: string;
  divisionId: string;
  sortOrder: string;
  isActive: boolean;
};

// Bölüme (CNC / Üniversal / Sac İşleme) göre ayrılabilen ürün listeleri.
// API tarafındaki DIVISION_SCOPED_LOOKUPS ile aynı olmalıdır.
const DIVISION_SCOPED_LOOKUPS = new Set([
  "product-groups",
  "product-categories",
  "product-subcategories",
  "product-types",
  "product-spec-groups",
]);

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
  brands: "Ürün Markaları",
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

const lookupUsage: Record<string, string[]> = {
  "company-sectors": ["Firma formu", "firma filtreleri", "rapor kırılımları"],
  "contact-sources": ["Firma formu", "lead kaynağı", "satış raporları"],
  "company-groups": ["Firma formu", "portföy filtreleri", "bölüm ayrımı"],
  "company-statuses": ["Firma kartı", "firma filtreleri"],
  "company-relation-types": ["Firma ilişkileri", "tedarikçi/müşteri bağlantıları"],
  "decision-roles": ["Kontak formu", "karar verici analizi"],
  "activity-types": ["Aktivite formu", "takvim", "satış takip raporları"],
  "pipeline-stages": ["Satış kanbanı", "satış kartı", "pipeline raporu"],
  "opportunity-statuses": ["Satış kartı", "fırsat filtreleri"],
  "quote-statuses": ["Teklif listesi", "teklif onay akışı"],
  "proforma-statuses": ["Proforma listesi", "doküman durumu"],
  "contract-statuses": ["Sözleşme listesi", "doküman durumu"],
  "product-categories": ["Ürün formu", "teklif satırları", "stok filtreleri"],
  brands: ["Ürün formu", "teklif satırları", "fiyat listesi"],
  "product-subcategories": ["Ürün formu", "teklif satırları", "ürün daraltma"],
  "product-groups": ["Ürün formu", "teklif satırları", "bölüm bazlı katalog"],
  "product-types": ["Ürün formu", "teklif satırları", "teknik bilgi şablonları"],
  "product-spec-groups": ["Teknik bilgi", "ürün özellikleri", "teklif teknik tablo"],
  "equipment-types": ["Ürün donanımı", "standart/opsiyonel ekipman"],
  "units": ["Teklif kalemleri", "stok", "teknik bilgi birimleri"],
  "inventory-statuses": ["Stok kartları", "stok filtreleri"],
  "stock-location-statuses": ["Stok lokasyonları", "depo takibi"],
  "warranty-statuses": ["Garanti kayıtları", "servis filtreleri"],
  "service-ticket-statuses": ["Servis talepleri", "servis panosu"],
  "installation-statuses": ["Kurulum kayıtları", "operasyon filtreleri"],
  "shipment-statuses": ["Sevkiyat listesi", "operasyon filtreleri"],
  "payment-statuses": ["Ödeme listesi", "finans raporları"],
  "invoice-statuses": ["Fatura listesi", "finans raporları"],
  currencies: ["Teklif", "fatura", "rapor para birimi"],
  "file-document-types": ["Doküman yükleme", "dosya filtreleri"],
  "storage-providers": ["Dosya altyapısı", "entegrasyon ayarları"],
  "tax-offices": ["Firma formu", "fatura bilgileri", "vergi dairesi seçimi"],
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
    names: ["brands", "product-groups", "product-categories", "product-subcategories", "equipment-types", "product-spec-groups", "units"],
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

const HIDDEN_LOOKUP_MENU_NAMES = new Set(["product-types"]);

const PRODUCT_FLOW_STEPS: Array<{ key: string; label: string; helper: string; lookupName?: string }> = [
  {
    key: "product-groups",
    lookupName: "product-groups",
    label: "Ürün Grupları",
    helper: "CNC, Üniversal, Sac İşleme gibi ana bölüm/grup ayrımı.",
  },
  {
    key: "product-categories",
    lookupName: "product-categories",
    label: "Ürün Kategorileri",
    helper: "Tezgah, yedek parça, aksesuar gibi ürün ailesi.",
  },
  {
    key: "product-subcategories",
    lookupName: "product-subcategories",
    label: "Ürün Alt Kategorileri",
    helper: "İşleme merkezi, torna veya parçaya ait alt ayrım.",
  },
  {
    key: "equipment-types",
    lookupName: "equipment-types",
    label: "Donanım Tipleri",
    helper: "Standart ve opsiyonel donanım sınıfları.",
  },
  {
    key: "product-spec-groups",
    lookupName: "product-spec-groups",
    label: "Teknik Bilgi Grupları",
    helper: "Teknik özellikleri tabloda gruplayan başlıklar.",
  },
  {
    key: "units",
    lookupName: "units",
    label: "Birimler",
    helper: "Teklif, stok ve teknik bilgi ölçü birimleri.",
  },
];

const PRODUCT_FLOW_LOOKUPS = new Set(PRODUCT_FLOW_STEPS.map((step) => step.lookupName).filter(Boolean) as string[]);

const emptyLookupForm: LookupForm = { code: "", name: "", description: "", province: "", divisionId: "", sortOrder: "0", isActive: true };
const PRODUCT_SETUP_START_LOOKUP = "product-groups";
type LookupStatusFilter = "active" | "passive" | "all";
type LookupAuditRow = {
  id: string;
  action: string;
  resourceId?: string | null;
  oldValues?: Partial<LookupRow> | null;
  newValues?: Partial<LookupRow> | null;
  createdAt?: string;
  actor?: { fullName?: string | null; email?: string | null } | null;
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const delimiter = (text.match(/;/g)?.length ?? 0) > (text.match(/,/g)?.length ?? 0) ? ";" : ",";

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);
  return rows;
}

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
  const [selectedLookup, setSelectedLookup] = useState(PRODUCT_SETUP_START_LOOKUP);
  const [lookupRows, setLookupRows] = useState<LookupRow[]>([]);
  const [lookupForm, setLookupForm] = useState<LookupForm>(emptyLookupForm);
  const [editingLookupId, setEditingLookupId] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupSearch, setLookupSearch] = useState("");
  const [lookupRowSearch, setLookupRowSearch] = useState("");
  const [lookupStatusFilter, setLookupStatusFilter] = useState<LookupStatusFilter>("active");
  const [lookupHistory, setLookupHistory] = useState<LookupAuditRow[]>([]);
  const [lookupHistoryLoading, setLookupHistoryLoading] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState("genel");
  // Bölüm filtresi (yalnızca ürün listelerinde etkilidir).
  const [lookupDivisionId, setLookupDivisionId] = usePersistedSettingsDivision();
  const divisions = user?.divisions ?? [];
  const isDivisionScoped = DIVISION_SCOPED_LOOKUPS.has(selectedLookup);
  const isProductFlowLookup = PRODUCT_FLOW_LOOKUPS.has(selectedLookup);
  const divisionLabel = (id?: string | null) => (id ? divisions.find((d) => d.id === id)?.name ?? "Bölüm" : "Tümü");
  const selectedLookupLabel = lookupLabels[selectedLookup] ?? selectedLookup;
  const selectedProductFlowStep = PRODUCT_FLOW_STEPS.find((step) => step.lookupName === selectedLookup);
  const selectedProductFlowIndex = PRODUCT_FLOW_STEPS.findIndex((step) => step.lookupName === selectedLookup);
  const selectedDivisionLabel = lookupDivisionId === ALL_DIVISIONS ? "Tümü" : divisionLabel(lookupDivisionId);
  const selectedDivisionIncludesShared = isCncDivision(divisions, lookupDivisionId);
  // Üniversal / Sac İşleme için tek tıkla önerilen taksonomi kurulumu.
  const selectedDivisionCatalogCode = divisionCatalogGroupCode(divisions, lookupDivisionId);
  const canSeedDivisionSetup = lookupDivisionId !== ALL_DIVISIONS && (selectedDivisionCatalogCode === "UNIVERSAL" || selectedDivisionCatalogCode === "SAC_ISLEME");
  const selectedLookupUsage = lookupUsage[selectedLookup] ?? ["İlgili CRM formları"];
  const freshLookupForm = (): LookupForm => ({ ...emptyLookupForm, divisionId: lookupDivisionId === ALL_DIVISIONS ? "" : lookupDivisionId });

  const lookupMenuGroups = useMemo(() => {
    const names = new Set((lookupNames.length ? lookupNames : Object.keys(lookupLabels)).filter((name) => !HIDDEN_LOOKUP_MENU_NAMES.has(name)));
    const grouped = new Set(LOOKUP_MENU_GROUPS.flatMap((group) => group.names));
    const rest = [...names]
      .filter((name) => !grouped.has(name))
      .sort((a, b) => (lookupLabels[a] ?? a).localeCompare(lookupLabels[b] ?? b, "tr-TR"));
    const groups = LOOKUP_MENU_GROUPS.map((group) => ({
      label: group.label,
      names: group.names.filter((name) => names.has(name)),
    }));
    if (rest.length) groups.push({ label: "Diğer", names: rest });
    const query = lookupSearch.trim().toLocaleLowerCase("tr-TR");
    return groups
      .map((group) => ({
        label: group.label,
        names: query ? group.names.filter((name) => (lookupLabels[name] ?? name).toLocaleLowerCase("tr-TR").includes(query)) : group.names,
      }))
      .filter((group) => group.names.length > 0);
  }, [lookupNames, lookupSearch]);

  const filteredLookupRows = useMemo(() => {
    const query = lookupRowSearch.trim().toLocaleLowerCase("tr-TR");
    return lookupRows.filter((row) => {
      if (lookupStatusFilter === "active" && row.isActive === false) return false;
      if (lookupStatusFilter === "passive" && row.isActive !== false) return false;
      if (!query) return true;
      return [row.name, row.description ?? "", row.province ?? "", row.code]
        .some((value) => String(value).toLocaleLowerCase("tr-TR").includes(query));
    });
  }, [lookupRows, lookupRowSearch, lookupStatusFilter]);

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
      // CNC seçiliyse mevcut Tümü kayıtları da görünür; diğer bölümler exact çalışır.
      const params =
        DIVISION_SCOPED_LOOKUPS.has(name) && lookupDivisionId !== ALL_DIVISIONS
          ? { divisionId: lookupDivisionId, scope: PRODUCT_FLOW_LOOKUPS.has(name) && !selectedDivisionIncludesShared ? "exact" : undefined }
          : undefined;
      setLookupRows(await adminService.lookupRows(name, params));
    } catch (err: any) {
      toast.error("Alan değerleri yüklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setLookupBusy(false);
    }
  };

  const loadLookupHistory = async (name = selectedLookup) => {
    if (!canManageLookups) return;
    setLookupHistoryLoading(true);
    try {
      const res = await adminService.auditLogs({ resourceType: `lookup:${name}`, page: 1, pageSize: 8 });
      setLookupHistory(res.data ?? []);
    } catch {
      setLookupHistory([]);
    } finally {
      setLookupHistoryLoading(false);
    }
  };

  // Seçili bölüm (Üniversal / Sac İşleme) için önerilen ürün taksonomisini kurar.
  // Bölümde veya Tümü'nde aynı kod/ad zaten varsa o kayıt atlanır; hiçbir mevcut kayda dokunulmaz.
  const seedDivisionSetup = async () => {
    const groupCode = selectedDivisionCatalogCode;
    if (!canSeedDivisionSetup || !groupCode || groupCode === "CNC") return;
    const divisionName = divisionLabel(lookupDivisionId);
    const machineTypes = DIVISION_MACHINE_TYPES.filter((item) => item.productGroupCode === groupCode);
    const subcategoryByCode = new Map(machineTypes.map((item) => [item.subcategoryCode, item.subcategoryLabel]));
    const specGroupCodes = new Set(
      machineTypes.flatMap((item) => (MACHINE_SPEC_TEMPLATES[item.code] ?? []).map((entryItem) => entryItem.group)),
    );
    const pack: Array<{ lookup: string; rows: Array<{ code: string; name: string }> }> = [
      { lookup: "product-groups", rows: [{ code: groupCode, name: divisionName }] },
      {
        lookup: "product-categories",
        rows: [
          { code: "TEZGAH", name: "Tezgah" },
          { code: "YEDEK_PARCA", name: "Yedek Parça" },
          { code: "OPSIYONEL_DONANIM", name: "Opsiyonel Donanım" },
          { code: "AKSESUAR", name: "Aksesuar" },
          { code: "ISCILIK", name: "İşçilik" },
        ],
      },
      {
        lookup: "product-subcategories",
        rows: Array.from(subcategoryByCode, ([code, name]) => ({ code, name })),
      },
      { lookup: "product-types", rows: machineTypes.map((item) => ({ code: item.code, name: item.label })) },
      {
        lookup: "product-spec-groups",
        rows: PRODUCT_SPEC_GROUPS.filter((group) => specGroupCodes.has(group.code)).map((group) => ({ code: group.code, name: group.label })),
      },
    ];

    setLookupBusy(true);
    let created = 0;
    let skipped = 0;
    const failures: string[] = [];
    try {
      for (const { lookup, rows } of pack) {
        if (!rows.length) continue;
        // Bölüm + Tümü kapsamındaki mevcut kayıtlarla karşılaştır (kod veya ad eşleşirse atla)
        // ki ürün formlarında aynı ad iki kez görünmesin.
        let existingKeys = new Set<string>();
        try {
          const existing = await adminService.lookupRows(lookup, { divisionId: lookupDivisionId });
          existingKeys = new Set(
            (existing ?? []).flatMap((row: any) => [normalizeHeader(String(row.code ?? "")), normalizeHeader(String(row.name ?? ""))]),
          );
        } catch {
          // Liste alınamazsa güvenli taraf: eklemeyi dene, mükerrer 409'da atlanır.
        }
        let order = 0;
        for (const row of rows) {
          order += 10;
          if (existingKeys.has(normalizeHeader(row.code)) || existingKeys.has(normalizeHeader(row.name))) {
            skipped += 1;
            continue;
          }
          try {
            await adminService.createLookup(lookup, {
              code: row.code,
              name: row.name,
              divisionId: lookupDivisionId,
              sortOrder: order,
              isActive: true,
            });
            created += 1;
          } catch (err: any) {
            if (err?.status === 409) skipped += 1;
            else failures.push(`${lookupLabels[lookup] ?? lookup}: ${row.name}`);
          }
        }
      }
      if (failures.length) {
        toast.error(`${failures.length} kayıt eklenemedi`, { description: failures.slice(0, 3).join(", ") });
      }
      toast.success(`${divisionName} için önerilen kurulum tamam: ${created} kayıt eklendi`, {
        description: skipped ? `${skipped} kayıt zaten mevcuttu, atlandı.` : undefined,
      });
      await loadLookupRows(selectedLookup);
      await loadLookupHistory(selectedLookup);
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
    void loadLookupHistory(selectedLookup);
    setLookupForm(freshLookupForm());
    setEditingLookupId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLookup, canManageLookups, lookupDivisionId, selectedDivisionIncludesShared]);

  const submitLookup = async () => {
    if (!lookupForm.name.trim()) return toast.error("Ad alanı zorunludur");
    if (selectedLookup === "tax-offices" && !lookupForm.province.trim()) return toast.error("Vergi dairesi için il zorunludur");
    const body = {
      code: lookupForm.code || undefined,
      name: lookupForm.name,
      description: lookupForm.description || undefined,
      province: selectedLookup === "tax-offices" ? lookupForm.province : undefined,
      // Ürün akışında bölüm üst seçimden gelir; form her kayıt için tekrar sormaz.
      divisionId: isDivisionScoped
        ? isProductFlowLookup && lookupDivisionId !== ALL_DIVISIONS
          ? lookupDivisionId
          : lookupForm.divisionId || null
        : undefined,
      sortOrder: Number(lookupForm.sortOrder || 0),
      isActive: lookupForm.isActive,
    };
    setLookupBusy(true);
    try {
      if (editingLookupId) await adminService.updateLookup(selectedLookup, editingLookupId, body);
      else await adminService.createLookup(selectedLookup, body);
      toast.success(editingLookupId ? "Kayıt güncellendi" : "Kayıt eklendi");
      setLookupForm(freshLookupForm());
      setEditingLookupId(null);
      await loadLookupRows(selectedLookup);
      await loadLookupHistory(selectedLookup);
    } catch (err: any) {
      toast.error("Kayıt kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
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
      divisionId: row.divisionId ?? "",
      sortOrder: String(row.sortOrder ?? 0),
      isActive: row.isActive !== false,
    });
  };

  const deleteLookup = async (row: LookupRow) => {
    if (!window.confirm(`${row.name} kaydı silinsin mi? Kullanılıyorsa pasifleştirilecek.`)) return;
    setLookupBusy(true);
    try {
      const result = await adminService.deleteLookup(selectedLookup, row.id);
      toast.success(result?.deactivated ? "Kayıt pasifleştirildi" : "Kayıt silindi");
      await loadLookupRows(selectedLookup);
      await loadLookupHistory(selectedLookup);
    } catch (err: any) {
      toast.error("Kayıt silinemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setLookupBusy(false);
    }
  };

  const exportLookupCsv = () => {
    const rows = filteredLookupRows;
    const headers = ["Ad", "Açıklama", "Durum", "Sıra", "İl", "Bölüm", "Sistem Kodu"];
    const lines = [
      headers.join(";"),
      ...rows.map((row) =>
        [
          row.name,
          row.description ?? "",
          row.isActive === false ? "Pasif" : "Aktif",
          row.sortOrder ?? 0,
          row.province ?? "",
          row.divisionId ? divisionLabel(row.divisionId) : "",
          row.code,
        ].map(csvEscape).join(";")
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedLookup}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resolveImportDivisionId = (value: string) => {
    const clean = value.trim();
    if (!clean) return lookupDivisionId === ALL_DIVISIONS ? null : lookupDivisionId;
    const normalized = clean.toLocaleLowerCase("tr-TR");
    return divisions.find((division) =>
      division.id === clean ||
      division.code.toLocaleLowerCase("tr-TR") === normalized ||
      division.name.toLocaleLowerCase("tr-TR") === normalized
    )?.id ?? null;
  };

  const importLookupCsv = async (file?: File | null) => {
    if (!file) return;
    setLookupBusy(true);
    try {
      const parsed = parseCsv(await file.text());
      if (!parsed.length) {
        toast.error("CSV dosyası boş");
        return;
      }
      const headerRow = parsed[0] ?? [];
      const dataRows = parsed.slice(1);
      const headers = headerRow.map(normalizeHeader);
      const indexOf = (...names: string[]) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
      const nameIdx = indexOf("ad", "name", "adi");
      const descIdx = indexOf("aciklama", "description");
      const statusIdx = indexOf("durum", "status", "aktif", "active");
      const sortIdx = indexOf("sira", "sort_order", "sortorder");
      const provinceIdx = indexOf("il", "province", "sehir");
      const divisionIdx = indexOf("bolum", "division");
      const codeIdx = indexOf("sistem_kodu", "kod", "code");
      if (nameIdx < 0) {
        toast.error("İçe aktarım için Ad kolonu zorunludur");
        return;
      }

      let created = 0;
      let failed = 0;
      for (const row of dataRows) {
        const name = row[nameIdx]?.trim();
        if (!name) continue;
        const status = row[statusIdx]?.trim().toLocaleLowerCase("tr-TR");
        const isActive = status ? !["pasif", "passive", "false", "0", "hayir", "hayır"].includes(status) : true;
        try {
          await adminService.createLookup(selectedLookup, {
            code: row[codeIdx]?.trim() || undefined,
            name,
            description: row[descIdx]?.trim() || undefined,
            province: selectedLookup === "tax-offices" ? row[provinceIdx]?.trim() || undefined : undefined,
            divisionId: isDivisionScoped ? resolveImportDivisionId(row[divisionIdx] ?? "") : undefined,
            sortOrder: Number(row[sortIdx] || 0),
            isActive,
          });
          created++;
        } catch {
          failed++;
        }
      }
      toast.success("İçe aktarım tamamlandı", { description: `${created} kayıt eklendi${failed ? `, ${failed} satır atlandı` : ""}` });
      await loadLookupRows(selectedLookup);
      await loadLookupHistory(selectedLookup);
    } catch (err: any) {
      toast.error("İçe aktarım başarısız", { description: err?.message ?? "CSV dosyası okunamadı." });
    } finally {
      setLookupBusy(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const revertHistory = async (item: LookupAuditRow) => {
    setLookupBusy(true);
    try {
      if (item.action === "lookup.created" && item.resourceId) {
        await adminService.deleteLookup(selectedLookup, item.resourceId);
      } else if (item.oldValues?.id || item.resourceId) {
        const old = item.oldValues ?? {};
        await adminService.updateLookup(selectedLookup, String(old.id ?? item.resourceId), {
          code: old.code || undefined,
          name: old.name,
          description: old.description ?? undefined,
          province: selectedLookup === "tax-offices" ? old.province ?? undefined : undefined,
          divisionId: isDivisionScoped ? old.divisionId ?? null : undefined,
          sortOrder: old.sortOrder ?? 0,
          isActive: old.isActive !== false,
        });
      } else {
        toast.error("Bu geçmiş kaydı otomatik geri alınamaz");
        return;
      }
      toast.success("Değişiklik geri alındı");
      await loadLookupRows(selectedLookup);
      await loadLookupHistory(selectedLookup);
    } catch (err: any) {
      toast.error("Geri alma başarısız", { description: err?.message ?? "Kayıt güncellenemedi." });
    } finally {
      setLookupBusy(false);
    }
  };

  const auditActionLabel = (action: string) =>
    ({
      "lookup.created": "Eklendi",
      "lookup.updated": "Güncellendi",
      "lookup.deleted": "Silindi",
      "lookup.deactivated": "Pasifleştirildi",
    }[action] ?? action);

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

  const tabTriggerClass =
    "flex-none gap-2 rounded-lg px-3.5 py-2 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:ring-1 data-[state=active]:ring-border/70";

  return (
    <div className="max-w-6xl">
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="rounded-xl border border-border/60 bg-gradient-to-br from-primary/8 via-card to-info/8 p-1.5 shadow-sm">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="genel" className={tabTriggerClass}>
              <Settings2 className="size-4" /> Genel
            </TabsTrigger>
            <TabsTrigger value="sirket" className={tabTriggerClass}>
              <Building2 className="size-4" /> Şirket
            </TabsTrigger>
            <TabsTrigger value="bildirimler" className={tabTriggerClass}>
              <Bell className="size-4" /> Bildirimler
            </TabsTrigger>
            {canManageLookups && (
              <TabsTrigger value="crm-alan" className={tabTriggerClass}>
                <SlidersHorizontal className="size-4" /> CRM Alan Ayarları
              </TabsTrigger>
            )}
            {canManageLookups && (
              <TabsTrigger value="teknik-bilgi" className={tabTriggerClass}>
                <Layers className="size-4" /> Teknik Bilgi
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* Genel */}
        <TabsContent value="genel" className="space-y-4">
          <InfoCallout>
            Bildirim ve görünüm tercihleri kullanıcı bazında bu cihazda saklanır. Kurumsal şirket bilgileri <span className="font-medium">Şirket</span> sekmesinden yönetilir ve tüm kullanıcılarda ortaktır.
          </InfoCallout>
          <SettingsSection icon={<Globe />} tone="info" title="Para Birimi & Bölge" description="Varsayılan para birimi ve saat dilimi.">
            <div className="grid gap-3 sm:grid-cols-2">
              <SettingsField label="Varsayılan Para Birimi" value={prefs.currency} onChange={(v) => setPrefs({ ...prefs, currency: v })} />
              <SettingsField label="Saat Dilimi" value={prefs.timezone} onChange={(v) => setPrefs({ ...prefs, timezone: v })} />
            </div>
          </SettingsSection>
          <SettingsSection icon={<Database />} tone="muted" title="Depolama" description="Dosya yükleme altyapısı.">
            <p className="text-sm text-muted-foreground">
              Dosya yüklemeleri S3 uyumlu depolamada tutulur. Bucket ve sağlayıcı yapılandırması sunucu tarafından yönetilir.
            </p>
          </SettingsSection>
          <div className="flex justify-end">
            <Button onClick={savePrefs} className="gap-1">
              <Save className="size-4" /> {prefsSaved ? "Tercihler Kaydedildi" : "Tercihleri Kaydet"}
            </Button>
          </div>
        </TabsContent>

        {/* Şirket */}
        <TabsContent value="sirket" className="space-y-4">
          <SettingsSection
            icon={<Building2 />}
            tone="primary"
            title="Şirket Bilgileri"
            description="Tenant kaydından yönetilir; tüm kullanıcılarda ortaktır."
            action={
              canEditTenant ? (
                <Button size="sm" onClick={saveCompany} disabled={companyLoading || companySaving} className="gap-1">
                  <Save className="size-4" /> {companySaving ? "Kaydediliyor" : "Kaydet"}
                </Button>
              ) : undefined
            }
          >
            {!canReadTenant ? (
              <p className="text-sm text-muted-foreground">Şirket bilgilerini görüntüleme yetkiniz yok.</p>
            ) : companyLoading ? (
              <p className="text-sm text-muted-foreground">Yükleniyor…</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <SettingsField label="Şirket Adı" value={company.companyName} disabled={!canEditTenant} onChange={(v) => setCompany({ ...company, companyName: v })} />
                <SettingsField label="VKN" value={company.taxId} disabled={!canEditTenant} onChange={(v) => setCompany({ ...company, taxId: v })} />
                <SettingsField label="E-posta" value={company.email} disabled={!canEditTenant} onChange={(v) => setCompany({ ...company, email: v })} />
                <SettingsField label="Telefon" value={company.phone} disabled={!canEditTenant} onChange={(v) => setCompany({ ...company, phone: v })} />
                {!canEditTenant && <p className="text-xs text-muted-foreground sm:col-span-2">Düzenleme için yönetici yetkisi gerekir.</p>}
              </div>
            )}
          </SettingsSection>
        </TabsContent>

        {/* Bildirimler */}
        <TabsContent value="bildirimler" className="space-y-4">
          <SettingsSection icon={<Bell />} tone="warning" title="Bildirim Tercihleri" description="Hangi olaylarda bildirim almak istediğinizi seçin." bodyClassName="py-1">
            <div className="divide-y divide-border/60">
              <SettingsToggle
                icon={<Briefcase />}
                label="Yeni satış kartı oluşturulduğunda"
                description="Sana atanan veya ekibinde yeni bir satış kartı açıldığında bildirim al."
                checked={prefs.notifyNewCase}
                onChange={(v) => setPrefs({ ...prefs, notifyNewCase: v })}
              />
              <SettingsToggle
                icon={<FileCheck2 />}
                label="Teklif onaylandığında"
                description="Gönderdiğin bir teklif müşteri tarafından onaylandığında bildirim al."
                checked={prefs.notifyQuoteApproved}
                onChange={(v) => setPrefs({ ...prefs, notifyQuoteApproved: v })}
              />
              <SettingsToggle
                icon={<Clock />}
                label="Ödeme gecikmesinde"
                description="Bir ödeme vadesi geçtiğinde bildirim al."
                checked={prefs.notifyPaymentOverdue}
                onChange={(v) => setPrefs({ ...prefs, notifyPaymentOverdue: v })}
              />
              <SettingsToggle
                icon={<Wrench />}
                label="Yeni servis talebinde"
                description="Yeni bir servis talebi oluşturulduğunda bildirim al."
                checked={prefs.notifyService}
                onChange={(v) => setPrefs({ ...prefs, notifyService: v })}
              />
            </div>
          </SettingsSection>
          <div className="flex justify-end">
            <Button onClick={savePrefs} className="gap-1">
              <Save className="size-4" /> {prefsSaved ? "Tercihler Kaydedildi" : "Tercihleri Kaydet"}
            </Button>
          </div>
        </TabsContent>

        {/* CRM Alan Ayarları (super_admin) */}
        {canManageLookups && (
          <TabsContent value="crm-alan" className="space-y-4">
            <SettingsSection
              icon={<SlidersHorizontal />}
              tone="primary"
              title="CRM Alan Ayarları"
              description="Firma, satış, ürün ve finans alanlarında kullanılan seçim listelerini kurun."
            >
              <div className="mb-4 rounded-xl border border-border/60 bg-gradient-to-br from-muted/35 via-card to-primary/5 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Package className="size-4" />
                      </span>
                      <div>
                        <h4 className="text-sm font-semibold">Ürün kurulum akışı</h4>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Ürün alanlarını aşağıdaki sırayla kur. Bölüm seçimi bölüm bazlı ürün adımlarını etkiler; genel alanlar tüm bölümlerde kullanılır.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end lg:max-w-xl">
                    <div className="w-full sm:max-w-xs">
                      <SettingsSelect
                        label="Bölüm"
                        value={lookupDivisionId}
                        onChange={setLookupDivisionId}
                        options={[{ value: ALL_DIVISIONS, label: "Tümü" }, ...divisions.map((d) => ({ value: d.id, label: d.name }))]}
                      />
                    </div>
                    {canSeedDivisionSetup && (
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-1 whitespace-nowrap"
                        disabled={lookupBusy}
                        onClick={() => void seedDivisionSetup()}
                      >
                        <Sparkles className="size-4" /> Önerilen {selectedDivisionLabel} kurulumunu yükle
                      </Button>
                    )}
                  </div>
                </div>
                {canSeedDivisionSetup && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Önerilen kurulum; {selectedDivisionLabel} bölümü için tezgah tiplerini, kategori/alt kategori yapısını ve teknik bilgi
                    gruplarını hazır olarak ekler. Mevcut kayıtlara dokunulmaz, aynı ad/kod varsa atlanır.
                  </p>
                )}

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <div className="sm:col-span-2 lg:col-span-3 xl:col-span-6 rounded-lg border border-border/60 bg-card/70 px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Bağımlı yapı kuralı:</span>{" "}
                    Ürün Grupları <span className="mx-1">→</span> Ürün Kategorileri <span className="mx-1">→</span> Ürün Alt Kategorileri <span className="mx-1">→</span> Donanım Tipleri <span className="mx-1">→</span> Teknik Bilgi Grupları <span className="mx-1">→</span> Birimler
                  </div>
                  {PRODUCT_FLOW_STEPS.map((step, index) => {
                    const active = step.lookupName === selectedLookup;
                    if (!step.lookupName) {
                      return (
                        <div key={step.key} className="min-h-[104px] rounded-lg border border-dashed border-border/70 bg-card/60 p-3">
                          <div className="flex items-center gap-2">
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                              {index + 1}
                            </span>
                            <Package className="size-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{step.label}</span>
                          </div>
                          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{step.helper}</p>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={step.key}
                        type="button"
                        onClick={() => setSelectedLookup(step.lookupName!)}
                        className={`min-h-[104px] rounded-lg border p-3 text-left transition-colors ${
                          active
                            ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
                            : "border-border/70 bg-card hover:border-primary/30 hover:bg-primary/5"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
                              active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {index + 1}
                          </span>
                          <span className="text-sm font-medium">{step.label}</span>
                        </div>
                        <p className={`mt-2 text-[11px] leading-relaxed ${active ? "text-primary/80" : "text-muted-foreground"}`}>
                          {step.helper}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={lookupSearch}
                      onChange={(e) => setLookupSearch(e.target.value)}
                      placeholder="Alan ayarında ara…"
                      className="pl-9"
                    />
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border/60">
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
                            className={`block w-full border-t border-l-2 border-border/60 px-3 py-2 text-left text-sm transition-colors ${selectedLookup === name ? "border-l-primary bg-primary/10 font-medium text-primary" : "border-l-transparent hover:bg-muted/50"}`}
                          >
                            {lookupLabels[name] ?? name}
                          </button>
                        ))}
                      </div>
                    ))}
                    {!lookupMenuGroups.length && (
                      <div className="px-3 py-6 text-center text-xs text-muted-foreground">Eşleşen alan yok.</div>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  {isDivisionScoped && !isProductFlowLookup && (
                    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-end sm:justify-between">
                      <div className="w-full sm:max-w-xs">
                        <SettingsSelect
                          label="Bölüm"
                          value={lookupDivisionId}
                          onChange={setLookupDivisionId}
                          options={[{ value: ALL_DIVISIONS, label: "Tümü" }, ...divisions.map((d) => ({ value: d.id, label: d.name }))]}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground sm:text-right">
                        Bu liste bölüm bazlıdır. Ürün kurulum akışında belirli bölüm seçildiğinde yalnızca o bölüme atanmış kayıtlar gösterilir.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/60 p-3 md:grid-cols-6">
                    <div className="md:col-span-6 rounded-lg border border-border/60 bg-muted/20 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="gap-1">
                              <CheckCircle2 className="size-3" />
                              {selectedProductFlowStep ? `${selectedProductFlowIndex + 1}. adım` : "Alan"}
                            </Badge>
                            {isDivisionScoped && <Badge variant="secondary">{selectedDivisionLabel}</Badge>}
                          </div>
                          <h4 className="mt-2 text-sm font-semibold">{selectedLookupLabel}</h4>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {isProductFlowLookup && isDivisionScoped
                              ? selectedDivisionIncludesShared
                                ? "CNC seçili olduğu için bu listede CNC kayıtlarıyla birlikte Tümü altındaki mevcut CNC kayıtları da görünür."
                                : "Buraya eklenen değerler seçili bölümde ürün ve teklif formlarında kullanılır; belirli bölüm seçiliyken sadece o bölümün kayıtları gelir."
                              : isProductFlowLookup
                                ? "Bu adım genel kullanılır; buraya eklenen değerler tüm bölümlerde ürün, teklif ve teknik bilgi alanlarında görünür."
                                : "Bu listedeki değerler ilgili CRM formlarındaki seçim alanlarında kullanılır."}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="text-[11px] text-muted-foreground">Kullanıldığı yerler:</span>
                            {selectedLookupUsage.map((usage) => (
                              <Badge key={usage} variant="outline" className="text-[11px] font-normal">
                                {usage}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <SettingsField label={`${selectedLookupLabel} adı`} value={lookupForm.name} onChange={(v) => setLookupForm({ ...lookupForm, name: v })} />
                    </div>
                    {selectedLookup === "tax-offices" && (
                      <SettingsField label="İl" value={lookupForm.province} onChange={(v) => setLookupForm({ ...lookupForm, province: v })} />
                    )}
                    {isDivisionScoped && isProductFlowLookup && (
                      <div className="flex items-end md:col-span-2">
                        <div className="w-full rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                          Bu kayıt <span className="font-medium text-foreground">{selectedDivisionLabel}</span> seçimine göre kaydedilecek.
                        </div>
                      </div>
                    )}
                    {isDivisionScoped && !isProductFlowLookup && (
                      <div className="md:col-span-2">
                        <SettingsSelect
                          label="Bölüm"
                          value={lookupForm.divisionId}
                          onChange={(v) => setLookupForm({ ...lookupForm, divisionId: v })}
                          options={[{ value: "", label: "Tümü" }, ...divisions.map((d) => ({ value: d.id, label: d.name }))]}
                        />
                      </div>
                    )}
                    <label className="flex items-end gap-2 pb-2 text-sm">
                      <input
                        type="checkbox"
                        checked={lookupForm.isActive}
                        onChange={(e) => setLookupForm({ ...lookupForm, isActive: e.target.checked })}
                      />
                      Aktif
                    </label>
                    <details className="md:col-span-6 rounded-lg border border-dashed border-border/70 bg-muted/20 p-3">
                      <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground">Gelişmiş</summary>
                      <div className="mt-3 grid gap-3 md:grid-cols-6">
                        <div className="md:col-span-2">
                          <SettingsField label="Sistem kodu" value={lookupForm.code || "Otomatik üretilecek"} disabled onChange={() => undefined} />
                        </div>
                        <SettingsField label="Sıra" value={lookupForm.sortOrder} onChange={(v) => setLookupForm({ ...lookupForm, sortOrder: v })} />
                        <div className="md:col-span-6">
                          <SettingsField label="Açıklama" value={lookupForm.description} onChange={(v) => setLookupForm({ ...lookupForm, description: v })} />
                        </div>
                      </div>
                    </details>
                    <div className="flex justify-end gap-2 md:col-span-6">
                      {editingLookupId && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setEditingLookupId(null);
                            setLookupForm(freshLookupForm());
                          }}
                        >
                          Temizle
                        </Button>
                      )}
                      <Button type="button" onClick={submitLookup} disabled={lookupBusy} className="gap-1">
                        <Plus className="size-4" /> {editingLookupId ? "Güncelle" : isProductFlowLookup ? "Bu adıma ekle" : "Ekle"}
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
                    <div className="flex flex-col gap-2 border-b border-border/60 bg-muted/20 p-3 lg:flex-row lg:items-end lg:justify-between">
                      <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(180px,1fr)_160px]">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={lookupRowSearch}
                            onChange={(e) => setLookupRowSearch(e.target.value)}
                            placeholder="Bu listede ara..."
                            className="pl-9"
                          />
                        </div>
                        <SettingsSelect
                          label="Durum"
                          value={lookupStatusFilter}
                          onChange={(value) => setLookupStatusFilter(value as LookupStatusFilter)}
                          options={[
                            { value: "active", label: "Aktif" },
                            { value: "passive", label: "Pasif" },
                            { value: "all", label: "Tümü" },
                          ]}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={importInputRef}
                          type="file"
                          accept=".csv,text/csv"
                          className="hidden"
                          onChange={(event) => void importLookupCsv(event.target.files?.[0])}
                        />
                        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => importInputRef.current?.click()} disabled={lookupBusy}>
                          <Upload className="size-4" /> Excel/CSV İçe Aktar
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={exportLookupCsv} disabled={lookupBusy || filteredLookupRows.length === 0}>
                          <Download className="size-4" /> Excel/CSV Dışa Aktar
                        </Button>
                      </div>
                    </div>
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
                              <th className="px-3 py-2">Ad</th>
                              <th className="px-3 py-2">Açıklama</th>
                              {selectedLookup === "tax-offices" && <th className="px-3 py-2">İl</th>}
                              {isDivisionScoped && <th className="px-3 py-2">Bölüm</th>}
                              <th className="px-3 py-2">Sıra</th>
                              <th className="px-3 py-2">Durum</th>
                              <th className="px-3 py-2 text-right">İşlem</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredLookupRows.map((row) => (
                              <tr key={row.id} className="border-t border-dotted border-foreground/30">
                                <td className="px-3 py-2 font-medium">{row.name}</td>
                                <td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted-foreground" title={row.description ?? undefined}>{row.description || "-"}</td>
                                {selectedLookup === "tax-offices" && <td className="px-3 py-2">{row.province || "-"}</td>}
                                {isDivisionScoped && (
                                  <td className="px-3 py-2">
                                    <Badge variant={row.divisionId ? "secondary" : "outline"} className={row.divisionId ? "" : "text-muted-foreground"}>
                                      {divisionLabel(row.divisionId)}
                                    </Badge>
                                  </td>
                                )}
                                <td className="px-3 py-2 tabular-nums">{row.sortOrder ?? 0}</td>
                                <td className="px-3 py-2">
                                  {row.isActive === false ? (
                                    <Badge variant="outline" className="text-muted-foreground">Pasif</Badge>
                                  ) : (
                                    <Badge variant="outline" className="border-success/40 bg-success-soft text-success">Aktif</Badge>
                                  )}
                                </td>
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
                            {!filteredLookupRows.length && (
                              <tr>
                                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={5 + (selectedLookup === "tax-offices" ? 1 : 0) + (isDivisionScoped ? 1 : 0)}>
                                  Kayıt yok.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-card">
                    <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <History className="size-4 text-muted-foreground" />
                        Değişiklik geçmişi
                      </div>
                      {lookupHistoryLoading && <span className="text-xs text-muted-foreground">Yükleniyor...</span>}
                    </div>
                    <div className="divide-y divide-border/60">
                      {lookupHistory.map((item) => {
                        const before = item.oldValues?.name ?? "";
                        const after = item.newValues?.name ?? "";
                        const actor = item.actor?.fullName || item.actor?.email || "Sistem";
                        const canRevert = item.action === "lookup.created" || Boolean(item.oldValues?.id || item.resourceId);
                        return (
                          <div key={item.id} className="flex flex-col gap-2 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{auditActionLabel(item.action)}</Badge>
                                <span className="font-medium">{after || before || item.resourceId}</span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {actor} · {item.createdAt ? new Date(item.createdAt).toLocaleString("tr-TR") : "-"}
                                {before && after && before !== after ? ` · ${before} → ${after}` : ""}
                              </p>
                            </div>
                            {canRevert && (
                              <Button type="button" variant="outline" size="sm" className="gap-1" disabled={lookupBusy} onClick={() => void revertHistory(item)}>
                                <RotateCcw className="size-3.5" /> Geri al
                              </Button>
                            )}
                          </div>
                        );
                      })}
                      {!lookupHistory.length && (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                          Bu liste için kayıtlı değişiklik geçmişi yok.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </SettingsSection>
          </TabsContent>
        )}

        {/* Teknik Bilgi (super_admin) */}
        {canManageLookups && (
          <TabsContent value="teknik-bilgi" className="space-y-4">
            <ProductSpecTemplatesCard />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
