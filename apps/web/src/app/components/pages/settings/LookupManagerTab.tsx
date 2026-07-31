import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Switch } from "../../ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { Building2, Download, GripVertical, History, ImageIcon, Info, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../lib/auth";
import { adminService, fileService } from "../../../../lib/services";
import { resolveMediaUrl } from "../../../../lib/apiClient";
import { useStore } from "../../../lib/store";
import { DIVISION_MACHINE_TYPES, MACHINE_SPEC_TEMPLATES, PRODUCT_SPEC_GROUPS } from "../../../lib/productSpecTemplates";
import { ALL_DIVISIONS, divisionCatalogGroupCode, isCncDivision, usePersistedSettingsDivision } from "./settings-division";
import { SettingsField, SettingsSection, SettingsSelect } from "./settings-controls";
import { MultiSelect } from "../../ui/multi-select";
import { Combobox, type ComboboxOption } from "../../ui/combobox";
import { Label } from "../../ui/label";
import {
  DIVISION_SCOPED_LOOKUPS,
  HIDDEN_LOOKUP_MENU_NAMES,
  LOOKUP_MENU_GROUPS,
  LOOKUP_PARENTS,
  PRODUCT_FLOW_LOOKUPS,
  PRODUCT_FLOW_STEPS,
  PRODUCT_SETUP_START_LOOKUP,
  SPEC_GROUP_LOOKUP,
  lookupLabels,
  lookupUsage,
} from "./lookup-meta";

type LookupRow = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  province?: string | null;
  divisionId?: string | null;
  // Taksonomi zinciri üst bağları (kategori→grup, alt kategori→kategori, tip→alt kategori).
  productGroupId?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  // Teknik bilgi gruplarında: atanmış ürün tipi id'leri (boş → tüm tiplerde geçerli).
  productTypeIds?: string[];
  companyId?: string | null;
  companyName?: string | null;
  companyNo?: string | null;
  isOwned?: boolean;
  logoFileId?: string | null;
  logoUrl?: string | null;
};

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

type LookupStatusFilter = "active" | "passive" | "all";

type BrandForm = {
  name: string;
  description: string;
  divisionId: string;
  companyValue: string;
  logoFileId: string | null;
  logoUrl: string;
};

const OWN_COMPANY_VALUE = "__haksan_owned__";
const emptyBrandForm: BrandForm = {
  name: "",
  description: "",
  divisionId: "",
  companyValue: OWN_COMPANY_VALUE,
  logoFileId: null,
  logoUrl: "",
};
const BRAND_LOGO_MAX_BYTES = 5 * 1024 * 1024;
const BRAND_LOGO_MIME_BY_EXTENSION = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
} as const;

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

const auditActionLabel = (action: string) =>
  ({
    "lookup.created": "Eklendi",
    "lookup.updated": "Güncellendi",
    "lookup.reordered": "Sıralandı",
    "lookup.deleted": "Silindi",
    "lookup.deactivated": "Pasifleştirildi",
  }[action] ?? action);

const emptyEditForm: EditForm = { name: "", description: "", province: "", isActive: true, code: "", divisionId: "", parentId: "", productTypeIds: [] };

const brandLogoMeta = (file: File) => {
  const extension = (file.name.split(".").pop() ?? "").toLocaleLowerCase("en-US") as keyof typeof BRAND_LOGO_MIME_BY_EXTENSION;
  const mimeType = BRAND_LOGO_MIME_BY_EXTENSION[extension];
  if (!mimeType || (file.type && file.type !== mimeType)) return null;
  return { extension, mimeType };
};

const validateBrandLogo = (file: File): string | null => {
  if (!brandLogoMeta(file)) return "Yalnızca PNG, JPG veya WEBP logo yükleyebilirsiniz.";
  if (file.size <= 0) return "Logo dosyası boş olamaz.";
  if (file.size > BRAND_LOGO_MAX_BYTES) return "Logo dosyası 5 MB'ı aşamaz.";
  return null;
};

const uploadBrandLogo = async (brandId: string, file: File): Promise<string> => {
  const validationError = validateBrandLogo(file);
  if (validationError) throw new Error(validationError);
  const meta = brandLogoMeta(file)!;
  const upload = await fileService.signedUpload({
    bucket: "erp-brand-logos",
    entityType: "brand",
    entityId: brandId,
    filename: file.name,
    mimeType: meta.mimeType,
    extension: meta.extension,
    sizeBytes: file.size,
  });
  await fileService.uploadBinary(upload, file, meta.mimeType);
  await fileService.link({
    fileId: upload.fileId,
    entityType: "brand",
    entityId: brandId,
    documentTypeCode: "brand_logo",
    description: "Marka logosu",
  });
  return upload.fileId;
};

function BrandEditorFields({
  form,
  onChange,
  companyOptions,
  divisionOptions,
  logoPreview,
  onLogoChange,
  onLogoRemove,
}: {
  form: BrandForm;
  onChange: (patch: Partial<BrandForm>) => void;
  companyOptions: ComboboxOption[];
  divisionOptions: Array<{ value: string; label: string }>;
  logoPreview: string;
  onLogoChange: (file: File | null) => void;
  onLogoRemove: () => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-[132px_1fr]">
      <div>
        <Label className="text-xs text-muted-foreground">Marka Logosu</Label>
        <div className="mt-1 flex min-h-32 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/20 p-3">
          {logoPreview ? (
            <img src={logoPreview} alt={`${form.name || "Marka"} logosu`} className="max-h-24 max-w-full object-contain" />
          ) : (
            <div className="text-center text-muted-foreground">
              <ImageIcon className="mx-auto size-7" />
              <span className="mt-2 block text-[11px]">Logo seçilmedi</span>
            </div>
          )}
        </div>
        <label className="mt-2 flex h-9 cursor-pointer items-center justify-center gap-1 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted">
          <Upload className="size-3.5" />
          Fotoğraf seç
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => onLogoChange(event.target.files?.[0] ?? null)}
          />
        </label>
        {logoPreview && (
          <Button type="button" variant="ghost" size="sm" className="mt-1 w-full text-xs text-destructive" onClick={onLogoRemove}>
            Logoyu kaldır
          </Button>
        )}
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">PNG, JPG veya WEBP · en fazla 5 MB</p>
      </div>

      <div className="grid content-start gap-3 sm:grid-cols-2">
        <SettingsField
          label="Marka Adı"
          value={form.name}
          onChange={(name) => onChange({ name })}
          placeholder="Örn. HAXAN"
        />
        <div>
          <Label className="text-xs text-muted-foreground">Markanın Bağlı Olduğu Firma</Label>
          <Combobox
            options={companyOptions}
            value={form.companyValue}
            onChange={(companyValue) => onChange({ companyValue })}
            placeholder="Firma seçin..."
            searchPlaceholder="Firma adı veya firma no ile ara..."
            emptyText="Uygun müşteri firması bulunamadı."
            className="mt-1"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Listede yalnız Müşteri ve Müşteri + Tedarikçi firmaları gösterilir.
          </p>
        </div>
        <SettingsSelect
          label="Markanın Bağlı Olduğu Bölüm"
          value={form.divisionId}
          onChange={(divisionId) => onChange({ divisionId })}
          options={divisionOptions}
        />
        <div className="sm:col-span-2">
          <SettingsField
            label="Açıklama / Not"
            value={form.description}
            onChange={(description) => onChange({ description })}
            placeholder="Marka hakkında kısa not (isteğe bağlı)"
          />
        </div>
      </div>
    </div>
  );
}

export function LookupManagerTab() {
  const { user, hasRole } = useAuth();
  const { customers } = useStore();
  const canManageLookups = hasRole("super_admin");

  const [lookupNames, setLookupNames] = useState<string[]>([]);
  const [selectedLookup, setSelectedLookup] = useState(PRODUCT_SETUP_START_LOOKUP);
  const [lookupRows, setLookupRows] = useState<LookupRow[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupSearch, setLookupSearch] = useState("");
  const [lookupRowSearch, setLookupRowSearch] = useState("");
  const [lookupStatusFilter, setLookupStatusFilter] = useState<LookupStatusFilter>("active");
  const [quickName, setQuickName] = useState("");
  const [quickProvince, setQuickProvince] = useState("");
  // Taksonomi zincirinde üst bağ: hızlı eklemede seçilen üst kayıt ve tablo filtresi.
  const [quickParentId, setQuickParentId] = useState("");
  const [parentFilterId, setParentFilterId] = useState("all");
  const [parentRows, setParentRows] = useState<LookupRow[]>([]);
  // Teknik bilgi grubu ataması için ürün tipi seçenekleri.
  const [productTypeRows, setProductTypeRows] = useState<LookupRow[]>([]);
  const [editParentRows, setEditParentRows] = useState<LookupRow[]>([]);
  const [editProductTypeRows, setEditProductTypeRows] = useState<LookupRow[]>([]);
  const [editRow, setEditRow] = useState<LookupRow | null>(null);
  const [brandCreateOpen, setBrandCreateOpen] = useState(false);
  const [brandForm, setBrandForm] = useState<BrandForm>(emptyBrandForm);
  const [brandLogoFile, setBrandLogoFile] = useState<File | null>(null);
  const [brandLogoPreview, setBrandLogoPreview] = useState("");
  const [removeBrandLogo, setRemoveBrandLogo] = useState(false);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<LookupRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lookupHistory, setLookupHistory] = useState<LookupAuditRow[]>([]);
  const [lookupHistoryLoading, setLookupHistoryLoading] = useState(false);
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  // Bölüm filtresi tek yerden yönetilir; bölüm kapsamlı tüm listelere uygulanır.
  const [lookupDivisionId, setLookupDivisionId] = usePersistedSettingsDivision();

  const divisions = user?.divisions ?? [];
  const isBrandLookup = selectedLookup === "brands";
  const isDivisionScoped = DIVISION_SCOPED_LOOKUPS.has(selectedLookup);
  const divisionLabel = (id?: string | null) => (id ? divisions.find((d) => d.id === id)?.name ?? "Bölüm" : "Tümü");
  const selectedLookupLabel = lookupLabels[selectedLookup] ?? selectedLookup;
  const selectedFlowIndex = PRODUCT_FLOW_STEPS.findIndex((step) => step.lookupName === selectedLookup);
  const selectedFlowStep = selectedFlowIndex >= 0 ? PRODUCT_FLOW_STEPS[selectedFlowIndex] : undefined;
  const selectedDivisionLabel = lookupDivisionId === ALL_DIVISIONS ? "Tümü" : divisionLabel(lookupDivisionId);
  const selectedDivisionIncludesShared = isCncDivision(divisions, lookupDivisionId);
  // Üniversal / Sac İşleme için tek tıkla önerilen taksonomi kurulumu.
  const selectedDivisionCatalogCode = divisionCatalogGroupCode(divisions, lookupDivisionId);
  const canSeedDivisionSetup = lookupDivisionId !== ALL_DIVISIONS && (selectedDivisionCatalogCode === "UNIVERSAL" || selectedDivisionCatalogCode === "SAC_ISLEME");
  const selectedLookupUsage = lookupUsage[selectedLookup] ?? ["İlgili CRM formları"];
  const brandCompanyOptions = useMemo<ComboboxOption[]>(() => {
    const eligible = customers
      .filter((company) => company.status === "active" && (company.firmType === "supplier" || company.firmType === "supplier_customer"))
      .sort((a, b) => a.name.localeCompare(b.name, "tr-TR"));
    return [
      {
        value: OWN_COMPANY_VALUE,
        label: "Haksan Makina",
        hint: "Kendi firmamız · listenin en üstünde",
      },
      ...eligible.map((company) => ({
        value: company.id,
        label: company.name,
        hint: [
          company.companyNo ? `Firma No: ${company.companyNo}` : "",
          company.firmType === "supplier_customer" ? "Müşteri + Tedarikçi" : "Tedarikçi",
        ].filter(Boolean).join(" · "),
      })),
    ];
  }, [customers]);
  const brandDivisionOptions = useMemo(
    () => [
      { value: "", label: "Tümü (tüm bölümlerde kullanılır)" },
      ...divisions.map((division) => ({ value: division.id, label: division.name })),
    ],
    [divisions],
  );
  // Yeni kayıtlar seçili bölüme yazılır; "Tümü" seçiliyken ortak kayıt olur.
  const newRecordDivisionId = isDivisionScoped ? (lookupDivisionId === ALL_DIVISIONS ? null : lookupDivisionId) : undefined;
  // Seçili listenin üst bağ tanımı (kategori→grup, alt kategori→kategori, tip→alt kategori).
  const parentConfig = LOOKUP_PARENTS[selectedLookup];
  const isSpecGroupLookup = selectedLookup === SPEC_GROUP_LOOKUP;
  const parentNameById = useMemo(() => new Map(parentRows.map((row) => [row.id, row.name])), [parentRows]);
  const productTypeNameById = useMemo(() => new Map(productTypeRows.map((row) => [row.id, row.name])), [productTypeRows]);
  const parentValueOf = (row: LookupRow) => (parentConfig ? row[parentConfig.field] ?? null : null);
  const parentOptionList = (emptyLabel: string) => [
    { value: "", label: emptyLabel },
    ...parentRows.map((row) => ({ value: row.id, label: row.name })),
  ];
  const specGroupTypeSummary = (row: LookupRow) => {
    const ids = row.productTypeIds ?? [];
    if (!ids.length) return "Tüm tipler";
    const names = ids.map((id) => productTypeNameById.get(id) ?? "?");
    return names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
  };

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
      // Üst bağ filtresi: seçilen üste bağlı kayıtlar + "Tümü" (bağsız) kayıtlar.
      if (parentConfig && parentFilterId !== "all") {
        const parentId = row[parentConfig.field] ?? null;
        if (parentId != null && parentId !== parentFilterId) return false;
      }
      if (!query) return true;
      return [row.name, row.description ?? "", row.province ?? "", row.code, row.companyName ?? "", row.companyNo ?? ""]
        .some((value) => String(value).toLocaleLowerCase("tr-TR").includes(query));
    });
  }, [lookupRows, lookupRowSearch, lookupStatusFilter, parentConfig, parentFilterId]);

  const reorderLookupRows = async (sourceId: string, targetId: string) => {
    if (sourceId === targetId || lookupBusy) return;
    const visibleRows = filteredLookupRows;
    const sourceIndex = visibleRows.findIndex((row) => row.id === sourceId);
    const targetIndex = visibleRows.findIndex((row) => row.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const reorderedVisible = [...visibleRows];
    const [moved] = reorderedVisible.splice(sourceIndex, 1);
    reorderedVisible.splice(targetIndex, 0, moved);

    // Arama/durum/üst kayıt filtresi açıkken yalnızca görünen satırların kendi
    // aralarındaki yerini değiştir; gizli satırlar mevcut konumlarını korur.
    const visibleIds = new Set(reorderedVisible.map((row) => row.id));
    let visibleIndex = 0;
    const reorderedAll = lookupRows.map((row) =>
      visibleIds.has(row.id) ? reorderedVisible[visibleIndex++] : row
    );
    const normalizedRows = reorderedAll.map((row, index) => ({ ...row, sortOrder: (index + 1) * 10 }));
    const previousRows = lookupRows;
    setLookupRows(normalizedRows);
    setLookupBusy(true);
    try {
      await adminService.reorderLookup(
        selectedLookup,
        normalizedRows.map((row) => ({ id: row.id, sortOrder: row.sortOrder ?? 0 }))
      );
      toast.success("Sıralama kaydedildi");
      if (historyOpen) await loadLookupHistory(selectedLookup);
    } catch (err: any) {
      setLookupRows(previousRows);
      toast.error("Sıralama kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setLookupBusy(false);
      setDraggedRowId(null);
      setDragOverRowId(null);
    }
  };

  const moveLookupRowWithKeyboard = (rowId: string, direction: -1 | 1) => {
    const index = filteredLookupRows.findIndex((row) => row.id === rowId);
    const target = filteredLookupRows[index + direction];
    if (index < 0 || !target) return;
    void reorderLookupRows(rowId, target.id);
  };

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

  const refreshAfterMutation = async () => {
    await loadLookupRows(selectedLookup);
    if (historyOpen) await loadLookupHistory(selectedLookup);
  };

  // Seçili bölüm (Üniversal / Sac İşleme) için önerilen ürün taksonomisini kurar.
  // Bölümde veya Tümü'nde aynı kod/ad zaten varsa o kayıt atlanır; hiçbir mevcut kayda dokunulmaz.
  // Kayıtlar zincire bağlı kurulur: kategori→grup, alt kategori→kategori, tip→alt kategori;
  // teknik bilgi grupları da katalog şablonuna göre ilgili tezgah tiplerine atanır.
  const seedDivisionSetup = async () => {
    const groupCode = selectedDivisionCatalogCode;
    if (!canSeedDivisionSetup || !groupCode || groupCode === "CNC") return;
    const divisionName = divisionLabel(lookupDivisionId);
    const machineTypes = DIVISION_MACHINE_TYPES.filter((item) => item.productGroupCode === groupCode);
    const subcategoryByCode = new Map(machineTypes.map((item) => [item.subcategoryCode, item.subcategoryLabel]));
    const specGroupCodes = new Set(
      machineTypes.flatMap((item) => (MACHINE_SPEC_TEMPLATES[item.code] ?? []).map((entryItem) => entryItem.group)),
    );
    type SeedRow = { code: string; name: string; parentLookup?: string; parentCode?: string; specGroupTypeCodes?: string[] };
    const pack: Array<{ lookup: string; rows: SeedRow[] }> = [
      { lookup: "product-groups", rows: [{ code: groupCode, name: divisionName }] },
      {
        lookup: "product-categories",
        rows: [
          { code: "TEZGAH", name: "Tezgah" },
          { code: "YEDEK_PARCA", name: "Yedek Parça" },
          { code: "OPSIYONEL_DONANIM", name: "Opsiyonel Donanım" },
          { code: "AKSESUAR", name: "Aksesuar" },
          { code: "ISCILIK", name: "İşçilik" },
        ].map((row) => ({ ...row, parentLookup: "product-groups", parentCode: groupCode })),
      },
      {
        lookup: "product-subcategories",
        rows: Array.from(subcategoryByCode, ([code, name]) => ({ code, name, parentLookup: "product-categories", parentCode: "TEZGAH" })),
      },
      {
        lookup: "product-types",
        rows: machineTypes.map((item) => ({
          code: item.code,
          name: item.label,
          parentLookup: "product-subcategories",
          parentCode: item.subcategoryCode,
        })),
      },
      {
        lookup: "product-spec-groups",
        rows: PRODUCT_SPEC_GROUPS.filter((group) => specGroupCodes.has(group.code)).map((group) => ({
          code: group.code,
          name: group.label,
          specGroupTypeCodes: machineTypes
            .filter((item) => (MACHINE_SPEC_TEMPLATES[item.code] ?? []).some((entryItem) => entryItem.group === group.code))
            .map((item) => item.code),
        })),
      },
    ];

    setLookupBusy(true);
    let created = 0;
    let skipped = 0;
    const failures: string[] = [];
    // Zincir bağlantısı için kod → id haritası (mevcut + yeni eklenen kayıtlar).
    const idsByLookup = new Map<string, Map<string, string>>();
    try {
      for (const { lookup, rows } of pack) {
        if (!rows.length) continue;
        // Bölüm + Tümü kapsamındaki mevcut kayıtlarla karşılaştır (kod veya ad eşleşirse atla)
        // ki ürün formlarında aynı ad iki kez görünmesin.
        let existingKeys = new Set<string>();
        const idByCode = new Map<string, string>();
        idsByLookup.set(lookup, idByCode);
        try {
          const existing = await adminService.lookupRows(lookup, { divisionId: lookupDivisionId });
          existingKeys = new Set(
            (existing ?? []).flatMap((row: any) => [normalizeHeader(String(row.code ?? "")), normalizeHeader(String(row.name ?? ""))]),
          );
          for (const row of existing ?? []) {
            if (row?.code && row?.id) idByCode.set(normalizeHeader(String(row.code)), String(row.id));
          }
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
          const parentId =
            row.parentLookup && row.parentCode
              ? idsByLookup.get(row.parentLookup)?.get(normalizeHeader(row.parentCode)) ?? null
              : undefined;
          const productTypeIds = row.specGroupTypeCodes
            ?.map((typeCode) => idsByLookup.get("product-types")?.get(normalizeHeader(typeCode)))
            .filter((id): id is string => Boolean(id));
          try {
            const createdRow = await adminService.createLookup(lookup, {
              code: row.code,
              name: row.name,
              divisionId: lookupDivisionId,
              parentId,
              productTypeIds,
              sortOrder: order,
              isActive: true,
            });
            if (createdRow?.id) idByCode.set(normalizeHeader(row.code), String(createdRow.id));
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
      await refreshAfterMutation();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageLookups]);

  useEffect(() => {
    void loadLookupRows(selectedLookup);
    setQuickName("");
    setQuickProvince("");
    setQuickParentId("");
    setParentFilterId("all");
    setEditRow(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLookup, canManageLookups, lookupDivisionId]);

  // Düzenleme sırasında bölüm değişirse üst kayıt ve ürün tipi seçenekleri de
  // yeni bölüm + ortak kayıtlar üzerinden yeniden yüklenir.
  useEffect(() => {
    let cancelled = false;
    if (!editRow || !canManageLookups) {
      setEditParentRows([]);
      setEditProductTypeRows([]);
      return () => {
        cancelled = true;
      };
    }
    const divisionId = editForm.divisionId || undefined;
    const params = divisionId ? { divisionId } : undefined;
    if (parentConfig) {
      adminService
        .lookupRows(parentConfig.lookup, params)
        .then((rows) => {
          if (cancelled) return;
          setEditParentRows(
            (rows ?? []).filter((row: LookupRow) =>
              row.isActive !== false && (divisionId ? !row.divisionId || row.divisionId === divisionId : !row.divisionId)
            ),
          );
        })
        .catch(() => !cancelled && setEditParentRows([]));
    } else {
      setEditParentRows([]);
    }
    if (isSpecGroupLookup) {
      adminService
        .lookupRows("product-types", params)
        .then((rows) => {
          if (cancelled) return;
          setEditProductTypeRows(
            (rows ?? []).filter((row: LookupRow) =>
              row.isActive !== false && (divisionId ? !row.divisionId || row.divisionId === divisionId : !row.divisionId)
            ),
          );
        })
        .catch(() => !cancelled && setEditProductTypeRows([]));
    } else {
      setEditProductTypeRows([]);
    }
    return () => {
      cancelled = true;
    };
  }, [editRow, editForm.divisionId, selectedLookup, canManageLookups, parentConfig, isSpecGroupLookup]);

  // Üst bağ seçenekleri ve (teknik bilgi gruplarında) atanabilir ürün tipleri.
  // Belirli bölüm seçiliyken o bölüm + ortak kayıtlar listelenir.
  useEffect(() => {
    if (!canManageLookups) return;
    let cancelled = false;
    const divisionParams = lookupDivisionId !== ALL_DIVISIONS ? { divisionId: lookupDivisionId } : undefined;
    const cfg = LOOKUP_PARENTS[selectedLookup];
    if (cfg) {
      adminService
        .lookupRows(cfg.lookup, divisionParams)
        .then((rows) => !cancelled && setParentRows((rows ?? []).filter((row: LookupRow) => row.isActive !== false)))
        .catch(() => !cancelled && setParentRows([]));
    } else {
      setParentRows([]);
    }
    if (selectedLookup === SPEC_GROUP_LOOKUP) {
      adminService
        .lookupRows("product-types", divisionParams)
        .then((rows) => !cancelled && setProductTypeRows((rows ?? []).filter((row: LookupRow) => row.isActive !== false)))
        .catch(() => !cancelled && setProductTypeRows([]));
    } else {
      setProductTypeRows([]);
    }
    return () => {
      cancelled = true;
    };
  }, [selectedLookup, canManageLookups, lookupDivisionId]);

  // Geçmiş yalnızca panel açıkken yüklenir.
  useEffect(() => {
    if (historyOpen) void loadLookupHistory(selectedLookup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen, selectedLookup]);

  useEffect(() => {
    if (!brandLogoFile) {
      setBrandLogoPreview(removeBrandLogo ? "" : resolveMediaUrl(brandForm.logoUrl));
      return;
    }
    const objectUrl = URL.createObjectURL(brandLogoFile);
    setBrandLogoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [brandLogoFile, brandForm.logoUrl, removeBrandLogo]);

  const resetBrandEditor = () => {
    setBrandCreateOpen(false);
    setEditRow(null);
    setBrandForm(emptyBrandForm);
    setBrandLogoFile(null);
    setBrandLogoPreview("");
    setRemoveBrandLogo(false);
  };

  const openBrandCreate = () => {
    setEditRow(null);
    setBrandForm({
      ...emptyBrandForm,
      divisionId: newRecordDivisionId ?? "",
      companyValue: OWN_COMPANY_VALUE,
    });
    setBrandLogoFile(null);
    setRemoveBrandLogo(false);
    setBrandCreateOpen(true);
  };

  const handleBrandLogoChange = (file: File | null) => {
    if (!file) return;
    const validationError = validateBrandLogo(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setBrandLogoFile(file);
    setRemoveBrandLogo(false);
  };

  const saveBrand = async () => {
    const name = brandForm.name.trim();
    if (!name) return toast.error("Marka adı zorunludur");
    if (!brandForm.companyValue) return toast.error("Markanın bağlı olduğu firmayı seçin");
    const isOwned = brandForm.companyValue === OWN_COMPANY_VALUE;
    const companyId = isOwned ? null : brandForm.companyValue;
    let createdBrandId: string | null = null;
    setLookupBusy(true);
    try {
      if (editRow) {
        let logoFileId: string | null | undefined;
        if (brandLogoFile) logoFileId = await uploadBrandLogo(editRow.id, brandLogoFile);
        else if (removeBrandLogo) logoFileId = null;
        await adminService.updateLookup("brands", editRow.id, {
          name,
          description: brandForm.description.trim() || undefined,
          divisionId: brandForm.divisionId || null,
          companyId,
          isOwned,
          logoFileId,
        });
        toast.success("Marka güncellendi");
      } else {
        const created = await adminService.createLookup("brands", {
          name,
          description: brandForm.description.trim() || undefined,
          divisionId: brandForm.divisionId || null,
          companyId,
          isOwned,
          isActive: true,
        });
        createdBrandId = created?.id ? String(created.id) : null;
        if (brandLogoFile && created?.id) {
          const logoFileId = await uploadBrandLogo(String(created.id), brandLogoFile);
          await adminService.updateLookup("brands", String(created.id), { logoFileId });
        }
        toast.success("Marka eklendi");
      }
      resetBrandEditor();
      await refreshAfterMutation();
    } catch (err: any) {
      if (!editRow && createdBrandId) {
        toast.warning("Marka oluşturuldu fakat logo yüklenemedi", {
          description: "Markayı düzenleyerek logoyu yeniden yükleyebilirsiniz.",
        });
        resetBrandEditor();
        await refreshAfterMutation();
        return;
      }
      toast.error(editRow ? "Marka güncellenemedi" : "Marka eklenemedi", {
        description: err?.message ?? "API isteği başarısız oldu.",
      });
    } finally {
      setLookupBusy(false);
    }
  };

  const quickAddLookup = async () => {
    const name = quickName.trim();
    if (!name) return toast.error("Ad alanı zorunludur");
    if (selectedLookup === "tax-offices" && !quickProvince.trim()) return toast.error("Vergi dairesi için il zorunludur");
    setLookupBusy(true);
    try {
      await adminService.createLookup(selectedLookup, {
        name,
        province: selectedLookup === "tax-offices" ? quickProvince.trim() : undefined,
        divisionId: newRecordDivisionId,
        // Tabloda belirli bir üst seçiliyken hızlı ekleme de o üste bağlanır.
        parentId: parentConfig ? quickParentId || (parentFilterId !== "all" ? parentFilterId : null) : undefined,
        isActive: true,
      });
      toast.success("Kayıt eklendi");
      setQuickName("");
      setQuickProvince("");
      await refreshAfterMutation();
    } catch (err: any) {
      toast.error("Kayıt kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setLookupBusy(false);
    }
  };

  const openEdit = (row: LookupRow) => {
    setEditRow(row);
    if (isBrandLookup) {
      setBrandCreateOpen(false);
      setBrandForm({
        name: row.name ?? "",
        description: row.description ?? "",
        divisionId: row.divisionId ?? "",
        companyValue: row.isOwned ? OWN_COMPANY_VALUE : row.companyId ?? "",
        logoFileId: row.logoFileId ?? null,
        logoUrl: row.logoUrl ?? "",
      });
      setBrandLogoFile(null);
      setRemoveBrandLogo(false);
      return;
    }
    setEditForm({
      name: row.name ?? "",
      description: row.description ?? "",
      province: row.province ?? "",
      isActive: row.isActive !== false,
      code: row.code ?? "",
      divisionId: row.divisionId ?? "",
      parentId: parentConfig ? row[parentConfig.field] ?? "" : "",
      productTypeIds: row.productTypeIds ?? [],
    });
  };

  const saveEdit = async () => {
    if (!editRow) return;
    if (!editForm.name.trim()) return toast.error("Ad alanı zorunludur");
    if (selectedLookup === "tax-offices" && !editForm.province.trim()) return toast.error("Vergi dairesi için il zorunludur");
    setLookupBusy(true);
    try {
      await adminService.updateLookup(selectedLookup, editRow.id, {
        name: editForm.name,
        description: editForm.description,
        province: selectedLookup === "tax-offices" ? editForm.province : undefined,
        divisionId: isDivisionScoped ? editForm.divisionId || null : undefined,
        parentId: parentConfig ? editForm.parentId || null : undefined,
        productTypeIds: isSpecGroupLookup ? editForm.productTypeIds : undefined,
        isActive: editForm.isActive,
      });
      toast.success("Kayıt güncellendi");
      setEditRow(null);
      await refreshAfterMutation();
    } catch (err: any) {
      toast.error("Kayıt kaydedilemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setLookupBusy(false);
    }
  };

  const toggleActive = async (row: LookupRow, next: boolean) => {
    setLookupBusy(true);
    try {
      await adminService.updateLookup(selectedLookup, row.id, { isActive: next });
      toast.success(next ? "Kayıt aktifleştirildi" : "Kayıt pasifleştirildi");
      await refreshAfterMutation();
    } catch (err: any) {
      toast.error("Durum güncellenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setLookupBusy(false);
    }
  };

  const deleteLookup = async (row: LookupRow) => {
    setLookupBusy(true);
    try {
      const result = await adminService.deleteLookup(selectedLookup, row.id);
      toast.success(
        result?.deactivated
          ? selectedLookup === "product-types"
            ? "Kullanımdaki ürün tipi pasifleştirilip listeden kaldırıldı"
            : "Kullanımdaki kayıt pasifleştirilip listeden kaldırıldı"
          : "Kayıt silindi",
      );
      setPendingDeleteRow(null);
      await refreshAfterMutation();
    } catch (err: any) {
      toast.error("Kayıt silinemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setLookupBusy(false);
    }
  };

  const exportLookupCsv = () => {
    const rows = filteredLookupRows;
    const headers = [
      "Ad",
      "Açıklama",
      ...(isBrandLookup ? ["Bağlı Firma", "Kendi Markamız", "Logo"] : []),
      "Durum",
      "Sıra",
      "İl",
      "Bölüm",
      ...(parentConfig ? [`Bağlı Olduğu ${parentConfig.label}`] : []),
      ...(isSpecGroupLookup ? ["Ürün Tipleri"] : []),
      "Sistem Kodu",
    ];
    const lines = [
      headers.join(";"),
      ...rows.map((row) =>
        [
          row.name,
          row.description ?? "",
          ...(isBrandLookup
            ? [
                row.isOwned ? "Haksan Makina" : row.companyName ?? "",
                row.isOwned ? "Evet" : "Hayır",
                row.logoUrl ?? "",
              ]
            : []),
          row.isActive === false ? "Pasif" : "Aktif",
          row.sortOrder ?? 0,
          row.province ?? "",
          row.divisionId ? divisionLabel(row.divisionId) : "",
          ...(parentConfig ? [parentValueOf(row) ? parentNameById.get(parentValueOf(row)!) ?? "" : "Tümü"] : []),
          ...(isSpecGroupLookup ? [(row.productTypeIds ?? []).map((id) => productTypeNameById.get(id) ?? id).join(", ") || "Tüm tipler"] : []),
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
        const parsedSortOrder = sortIdx >= 0 && row[sortIdx]?.trim() ? Number(row[sortIdx]) : undefined;
        try {
          await adminService.createLookup(selectedLookup, {
            code: row[codeIdx]?.trim() || undefined,
            name,
            description: row[descIdx]?.trim() || undefined,
            province: selectedLookup === "tax-offices" ? row[provinceIdx]?.trim() || undefined : undefined,
            divisionId: isDivisionScoped ? resolveImportDivisionId(row[divisionIdx] ?? "") : undefined,
            sortOrder: Number.isFinite(parsedSortOrder) ? parsedSortOrder : undefined,
            isActive,
          });
          created++;
        } catch {
          failed++;
        }
      }
      toast.success("İçe aktarım tamamlandı", { description: `${created} kayıt eklendi${failed ? `, ${failed} satır atlandı` : ""}` });
      await refreshAfterMutation();
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
          parentId: parentConfig ? old[parentConfig.field] ?? null : undefined,
          productTypeIds: isSpecGroupLookup ? old.productTypeIds ?? [] : undefined,
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

  return (
    <SettingsSection
      icon={<SlidersHorizontal />}
      tone="primary"
      title="CRM Alan Ayarları"
      description="Firma, satış, ürün ve finans formlarındaki seçim listelerini yönetin."
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <SettingsSelect
            label="Bölüm"
            value={lookupDivisionId}
            onChange={setLookupDivisionId}
            options={[{ value: ALL_DIVISIONS, label: "Tümü" }, ...divisions.map((d) => ({ value: d.id, label: d.name }))]}
          />
        </div>
        {canSeedDivisionSetup && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="gap-1 whitespace-nowrap"
                disabled={lookupBusy}
                onClick={() => void seedDivisionSetup()}
              >
                <Sparkles className="size-4" /> Önerilen {selectedDivisionLabel} kurulumunu yükle
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Tezgah tiplerini, kategori/alt kategori yapısını ve teknik bilgi gruplarını hazır ekler. Mevcut kayıtlara dokunulmaz;
              aynı ad/kod varsa atlanır.
            </TooltipContent>
          </Tooltip>
        )}
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
                  {group.label === "Ürün" && (
                    <span className="ml-1 normal-case font-normal tracking-normal text-muted-foreground">· 1→7 sırayla kurulur</span>
                  )}
                </div>
                {group.names.map((name) => {
                  const stepIndex = PRODUCT_FLOW_STEPS.findIndex((step) => step.lookupName === name);
                  return (
                    <button
                      key={name}
                      type="button"
                      title={stepIndex >= 0 ? PRODUCT_FLOW_STEPS[stepIndex].helper : undefined}
                      onClick={() => setSelectedLookup(name)}
                      className={`flex w-full items-center gap-2 border-t border-l-2 border-border/60 px-3 py-2 text-left text-sm transition-colors ${selectedLookup === name ? "border-l-primary bg-primary/10 font-medium text-primary" : "border-l-transparent hover:bg-muted/50"}`}
                    >
                      {stepIndex >= 0 && (
                        <span
                          className={`flex size-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold ${
                            selectedLookup === name ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {stepIndex + 1}
                        </span>
                      )}
                      <span className="truncate">{lookupLabels[name] ?? name}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {!lookupMenuGroups.length && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">Eşleşen alan yok.</div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold">
                {selectedFlowStep ? `${selectedFlowIndex + 1}. ` : ""}
                {selectedLookupLabel}
              </h4>
              {isDivisionScoped && <Badge variant="secondary">{selectedDivisionLabel}</Badge>}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground transition-colors hover:text-foreground" aria-label="Kullanım bilgisi">
                    <Info className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Kullanıldığı yerler: {selectedLookupUsage.join(", ")}.</p>
                  {isDivisionScoped && selectedDivisionIncludesShared && (
                    <p className="mt-1">CNC seçiliyken Tümü altındaki ortak kayıtlar da listelenir.</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedFlowStep?.helper ?? "Bu listedeki değerler ilgili CRM formlarındaki seçim alanlarında kullanılır."}
              {isDivisionScoped && lookupDivisionId !== ALL_DIVISIONS && ` Yeni kayıtlar ${selectedDivisionLabel} bölümüne eklenir.`}
            </p>
            {isBrandLookup ? (
              <div className="mt-3 flex flex-col gap-3 rounded-xl border border-primary/15 bg-primary/[0.035] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="size-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">Marka kimliği oluşturun</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Firma, bölüm ve logo bağlantısı ürünlere ve teklif PDF'lerine otomatik taşınır.
                    </p>
                  </div>
                </div>
                <Button type="button" onClick={openBrandCreate} disabled={lookupBusy} className="shrink-0 gap-1">
                  <Plus className="size-4" /> Yeni Ürün Markası
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void quickAddLookup();
                  }}
                  placeholder="Yeni değer adı…"
                  className="sm:flex-1"
                />
                {selectedLookup === "tax-offices" && (
                  <Input
                    value={quickProvince}
                    onChange={(e) => setQuickProvince(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void quickAddLookup();
                    }}
                    placeholder="İl"
                    className="sm:max-w-[160px]"
                  />
                )}
                {parentConfig && (
                  <div className="sm:w-56">
                    <SettingsSelect
                      label={`Bağlı olduğu ${parentConfig.label}`}
                      value={quickParentId || (parentFilterId !== "all" ? parentFilterId : "")}
                      onChange={setQuickParentId}
                      options={parentOptionList(`Tümü (${parentConfig.label.toLocaleLowerCase("tr-TR")} bağımsız)`)}
                    />
                  </div>
                )}
                <Button type="button" onClick={() => void quickAddLookup()} disabled={lookupBusy} className="gap-1">
                  <Plus className="size-4" /> Ekle
                </Button>
              </div>
            )}
            {isSpecGroupLookup && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Teknik bilgi grupları ürün tiplerine atanabilir; atama yapmak için kaydı düzenleyin. Ataması olmayan grup tüm tiplerde geçerlidir.
              </p>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
            <div className="flex flex-col gap-2 border-b border-border/60 bg-muted/20 p-3 lg:flex-row lg:items-end lg:justify-between">
              <div className={`grid flex-1 gap-2 ${parentConfig ? "sm:grid-cols-[minmax(160px,1fr)_140px_200px]" : "sm:grid-cols-[minmax(180px,1fr)_160px]"}`}>
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
                {parentConfig && (
                  <SettingsSelect
                    label={parentConfig.label}
                    value={parentFilterId}
                    onChange={setParentFilterId}
                    options={[{ value: "all", label: "Tümü" }, ...parentRows.map((row) => ({ value: row.id, label: row.name }))]}
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="hidden self-center text-[11px] text-muted-foreground xl:inline">
                  Sıralamak için satır tutamacını sürükleyin.
                </span>
                {!isBrandLookup && (
                  <>
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(event) => void importLookupCsv(event.target.files?.[0])}
                    />
                    <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => importInputRef.current?.click()} disabled={lookupBusy}>
                      <Upload className="size-4" /> İçe Aktar
                    </Button>
                  </>
                )}
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={exportLookupCsv} disabled={lookupBusy || filteredLookupRows.length === 0}>
                  <Download className="size-4" /> Dışa Aktar
                </Button>
                <Button
                  type="button"
                  variant={historyOpen ? "secondary" : "outline"}
                  size="sm"
                  className="gap-1"
                  onClick={() => setHistoryOpen((open) => !open)}
                >
                  <History className="size-4" /> Geçmiş
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/20 text-left text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="w-10 px-2 py-2"><span className="sr-only">Sırala</span></th>
                    <th className="px-3 py-2">{isBrandLookup ? "Marka" : "Ad"}</th>
                    <th className="px-3 py-2">{isBrandLookup ? "Bağlı Firma" : "Açıklama"}</th>
                    {selectedLookup === "tax-offices" && <th className="px-3 py-2">İl</th>}
                    {isDivisionScoped && <th className="px-3 py-2">Bölüm</th>}
                    {parentConfig && <th className="px-3 py-2">{parentConfig.label}</th>}
                    {isSpecGroupLookup && <th className="px-3 py-2">Ürün Tipleri</th>}
                    <th className="px-3 py-2">Sıra</th>
                    {!isBrandLookup && <th className="px-3 py-2">Aktif</th>}
                    <th className="px-3 py-2 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLookupRows.map((row, rowIndex) => (
                    <tr
                      key={row.id}
                      onDragOver={(event) => {
                        if (!draggedRowId || draggedRowId === row.id) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragOverRowId(row.id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const sourceId = draggedRowId || event.dataTransfer.getData("text/plain");
                        if (sourceId) void reorderLookupRows(sourceId, row.id);
                      }}
                      className={`border-t border-border/60 transition-colors ${
                        dragOverRowId === row.id && draggedRowId !== row.id
                          ? "bg-primary/5 shadow-[inset_0_2px_0_var(--primary)]"
                          : ""
                      }`}
                    >
                      <td className="px-2 py-2 align-middle">
                        <button
                          type="button"
                          draggable={!lookupBusy && filteredLookupRows.length > 1}
                          disabled={lookupBusy || filteredLookupRows.length < 2}
                          onDragStart={(event) => {
                            setDraggedRowId(row.id);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", row.id);
                          }}
                          onDragEnd={() => {
                            setDraggedRowId(null);
                            setDragOverRowId(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowUp") {
                              event.preventDefault();
                              moveLookupRowWithKeyboard(row.id, -1);
                            }
                            if (event.key === "ArrowDown") {
                              event.preventDefault();
                              moveLookupRowWithKeyboard(row.id, 1);
                            }
                          }}
                          className="grid size-7 cursor-grab place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={`${row.name} sırasını değiştir; sürükleyin veya yukarı aşağı ok tuşlarını kullanın`}
                          title="Sürükleyerek sırala"
                        >
                          <GripVertical className="size-4" />
                        </button>
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {isBrandLookup ? (
                          <div className="flex min-w-[190px] items-center gap-3">
                            <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-border/60 bg-white p-1.5">
                              {row.logoUrl ? (
                                <img src={resolveMediaUrl(row.logoUrl)} alt={`${row.name} logosu`} className="max-h-full max-w-full object-contain" />
                              ) : (
                                <ImageIcon className="size-5 text-muted-foreground/50" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{row.name}</p>
                              <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                                {row.logoUrl ? "Logo bağlı" : "Logo yüklenmemiş"}
                              </p>
                            </div>
                          </div>
                        ) : row.name}
                      </td>
                      <td className="max-w-[250px] px-3 py-2 text-xs text-muted-foreground" title={isBrandLookup ? row.companyName ?? undefined : row.description ?? undefined}>
                        {isBrandLookup ? (
                          <div>
                            <p className="font-medium text-foreground">{row.companyName || "Firma belirtilmemiş"}</p>
                            <p className="mt-0.5">
                              {row.isOwned ? "Kendi firmamız" : row.companyNo ? `Firma No: ${row.companyNo}` : "Müşteri firma"}
                            </p>
                          </div>
                        ) : row.description || "-"}
                      </td>
                      {selectedLookup === "tax-offices" && <td className="px-3 py-2">{row.province || "-"}</td>}
                      {isDivisionScoped && (
                        <td className="px-3 py-2">
                          <Badge variant={row.divisionId ? "secondary" : "outline"} className={row.divisionId ? "" : "text-muted-foreground"}>
                            {divisionLabel(row.divisionId)}
                          </Badge>
                        </td>
                      )}
                      {parentConfig && (
                        <td className="px-3 py-2">
                          <Badge variant={parentValueOf(row) ? "secondary" : "outline"} className={parentValueOf(row) ? "" : "text-muted-foreground"}>
                            {parentValueOf(row) ? parentNameById.get(parentValueOf(row)!) ?? "Üst kayıt" : "Tümü"}
                          </Badge>
                        </td>
                      )}
                      {isSpecGroupLookup && (
                        <td className="px-3 py-2 text-xs text-muted-foreground" title={(row.productTypeIds ?? []).map((id) => productTypeNameById.get(id) ?? id).join(", ") || undefined}>
                          {specGroupTypeSummary(row)}
                        </td>
                      )}
                      <td className="px-3 py-2 tabular-nums">{rowIndex + 1}</td>
                      {!isBrandLookup && (
                        <td className="px-3 py-2">
                          <Switch
                            checked={row.isActive !== false}
                            disabled={lookupBusy}
                            onCheckedChange={(next) => void toggleActive(row, next)}
                            aria-label={row.isActive !== false ? "Pasifleştir" : "Aktifleştir"}
                          />
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => openEdit(row)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="size-8 text-destructive" aria-label={`${row.name} kaydını kaldır`} onClick={() => setPendingDeleteRow(row)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filteredLookupRows.length && (
                    <tr>
                      <td className="px-3 py-6 text-center text-muted-foreground" colSpan={(isBrandLookup ? 5 : 6) + (selectedLookup === "tax-offices" ? 1 : 0) + (isDivisionScoped ? 1 : 0) + (parentConfig ? 1 : 0) + (isSpecGroupLookup ? 1 : 0)}>
                        Kayıt yok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {historyOpen && (
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
                {!lookupHistory.length && !lookupHistoryLoading && (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    Bu liste için kayıtlı değişiklik geçmişi yok.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(editRow) || brandCreateOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (isBrandLookup) resetBrandEditor();
            else setEditRow(null);
          }
        }}
      >
        <DialogContent className={isBrandLookup ? "max-w-3xl" : undefined}>
          {isBrandLookup ? (
            <>
              <DialogHeader>
                <DialogTitle>{editRow ? "Ürün Markasını Düzenle" : "Yeni Ürün Markası"}</DialogTitle>
                <DialogDescription>
                  Marka adı, sahibi, kullanılacağı bölüm ve görsel kimliğini tek kayıtta yönetin.
                </DialogDescription>
              </DialogHeader>
              <BrandEditorFields
                form={brandForm}
                onChange={(patch) => setBrandForm((current) => ({ ...current, ...patch }))}
                companyOptions={brandCompanyOptions}
                divisionOptions={brandDivisionOptions}
                logoPreview={brandLogoPreview}
                onLogoChange={handleBrandLogoChange}
                onLogoRemove={() => {
                  setBrandLogoFile(null);
                  setRemoveBrandLogo(true);
                }}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetBrandEditor}>Vazgeç</Button>
                <Button type="button" onClick={() => void saveBrand()} disabled={lookupBusy}>
                  {lookupBusy ? "Kaydediliyor…" : editRow ? "Değişiklikleri Kaydet" : "Markayı Oluştur"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
          <DialogHeader>
            <DialogTitle>{selectedLookupLabel} — Düzenle</DialogTitle>
            <DialogDescription>
              {editForm.divisionId ? `Bu kayıt ${divisionLabel(editForm.divisionId)} bölümüne bağlıdır.` : isDivisionScoped ? "Bu kayıt tüm bölümlerde ortaktır." : "Kayıt bilgilerini güncelleyin."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <SettingsField label="Ad" value={editForm.name} onChange={(v) => setEditForm({ ...editForm, name: v })} />
            {selectedLookup === "tax-offices" && (
              <SettingsField label="İl" value={editForm.province} onChange={(v) => setEditForm({ ...editForm, province: v })} />
            )}
            {isDivisionScoped && (
              <div>
                <SettingsSelect
                  label="Bağlı olduğu bölüm"
                  value={editForm.divisionId}
                  onChange={(divisionId) =>
                    setEditForm((current) => ({
                      ...current,
                      divisionId,
                      // Eski bölüme ait ilişkiler yeni bölüme yanlışlıkla taşınmaz.
                      parentId: divisionId === current.divisionId ? current.parentId : "",
                      productTypeIds: divisionId === current.divisionId ? current.productTypeIds : [],
                    }))
                  }
                  options={[
                    { value: "", label: "Tümü (ortak kayıt)" },
                    ...divisions.map((division) => ({ value: division.id, label: division.name })),
                  ]}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Bölümü değiştirirseniz üst kayıt ve ürün tipi bağlantılarını yeni bölüme göre yeniden seçin.
                </p>
              </div>
            )}
            {parentConfig && (
              <SettingsSelect
                label={`Bağlı olduğu ${parentConfig.label}`}
                value={editForm.parentId}
                onChange={(v) => setEditForm({ ...editForm, parentId: v })}
                options={[
                  { value: "", label: "Tümü (bağımsız)" },
                  ...editParentRows.map((row) => ({ value: row.id, label: row.name })),
                  // Farklı bölümdeki üst kayıt listede yoksa mevcut değeri koru.
                  ...(editForm.parentId && !editParentRows.some((row) => row.id === editForm.parentId)
                    ? [{ value: editForm.parentId, label: "Mevcut üst kayıt (başka bölümde)" }]
                    : []),
                ]}
              />
            )}
            {isSpecGroupLookup && (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Atandığı Ürün Tipleri</label>
                <MultiSelect
                  options={editProductTypeRows.map((row) => ({ value: row.id, label: row.name }))}
                  selected={editForm.productTypeIds}
                  onChange={(next) => setEditForm({ ...editForm, productTypeIds: next })}
                  placeholder="Ürün tipi seçin"
                  emptyText="Ürün tipi yok"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Bu grup yalnızca seçilen ürün tiplerinin teknik bilgi ekranlarında önerilir. Boş bırakılırsa tüm tiplerde geçerlidir.
                </p>
              </div>
            )}
            <div className="sm:col-span-2">
              <SettingsField label="Açıklama" value={editForm.description} onChange={(v) => setEditForm({ ...editForm, description: v })} />
            </div>
            <SettingsField label="Sistem kodu" value={editForm.code} disabled onChange={() => undefined} />
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Switch checked={editForm.isActive} onCheckedChange={(v) => setEditForm({ ...editForm, isActive: v })} />
              Aktif
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditRow(null)}>
              Vazgeç
            </Button>
            <Button type="button" onClick={() => void saveEdit()} disabled={lookupBusy}>
              Kaydet
            </Button>
          </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(pendingDeleteRow)} onOpenChange={(open) => !open && !lookupBusy && setPendingDeleteRow(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{isBrandLookup ? "Ürün markası silinsin mi?" : "Alan değeri kaldırılsın mı?"}</AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-foreground">{pendingDeleteRow?.name}</strong> {isBrandLookup ? "markası ve logo bağlantısı marka listesinden kaldırılacak." : `değeri ${selectedLookupLabel.toLocaleLowerCase("tr-TR")} listesinden kaldırılacak.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg border border-warning/20 bg-warning-soft/50 p-3 text-xs leading-relaxed text-muted-foreground">
            {isBrandLookup
              ? "Mevcut ürün ve teklif geçmişi korunur; marka yeni ürünlerde seçilemez ve bağlı logo artık yayınlanmaz."
              : "Bu değer mevcut firma, ürün veya işlem kayıtlarında kullanılıyorsa veri bütünlüğünü korumak için silinmek yerine pasifleştirilir. Yeni formlarda seçilemez, geçmiş kayıtlarda görünmeye devam eder."}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={lookupBusy} onClick={(event) => { event.preventDefault(); if (pendingDeleteRow) void deleteLookup(pendingDeleteRow); }}>
              {lookupBusy ? "İşleniyor…" : isBrandLookup ? "Markayı sil" : "Kaldır / pasifleştir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
