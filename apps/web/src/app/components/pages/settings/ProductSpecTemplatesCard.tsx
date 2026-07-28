import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Download,
  EyeOff,
  Grid3X3,
  ListFilter,
  Plus,
  Redo2,
  Save,
  Search,
  Settings2,
  Sheet,
  Trash2,
  Undo2,
  Upload,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { adminService } from "../../../../lib/services";
import { exportService } from "../../../../lib/downloadExport";
import { useAuth } from "../../../../lib/auth";
import { useStore } from "../../../lib/store";
import {
  DIVISION_MACHINE_TYPES,
  PRODUCT_SPEC_GROUPS,
  foldProductTypeCode,
  machineSpecTemplateEntries,
  normalizeProductSpecKey,
  productSpecGroupForTypeKey,
} from "../../../lib/productSpecTemplates";
import { TechnicalImportDialog } from "../../dialogs/TechnicalImportDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../ui/alert-dialog";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Switch } from "../../ui/switch";
import { cn } from "../../ui/utils";

type FamilyCode = "CNC" | "SAC_ISLEME" | "UNIVERSAL";
type WorkspaceView = "library" | "editor";

type MachineTypeOption = {
  code: string;
  label: string;
  familyCode: FamilyCode;
  categoryCode: "TEZGAH";
  categoryLabel: "Tezgah";
  subcategoryCode: string;
  subcategoryLabel: string;
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
  updatedAt?: string;
};

type DraftRow = {
  clientId: string;
  id?: string;
  divisionId?: string | null;
  specKey: string;
  groupCode: string;
  defaultValue: string;
  unit: string;
  isActive: boolean;
  catalogOnly: boolean;
  /**
   * Alan, makine tipinin katalog şablonunda tanımlı mı. Katalog alanları silinse
   * bile çalışma sayfası yeniden kurulduğunda öneri olarak geri gelir; bu yüzden
   * kalıcı silme yalnız katalog dışı (kullanıcı/aktarım kaynaklı) alanlarda açıktır.
   */
  inCatalog: boolean;
};

const FAMILIES: Array<{ code: FamilyCode; label: string }> = [
  { code: "CNC", label: "CNC" },
  { code: "SAC_ISLEME", label: "Sac İşleme" },
  { code: "UNIVERSAL", label: "Üniversal" },
];

const CNC_MACHINE_TYPES: MachineTypeOption[] = [
  { code: "CNC_DIK_ISLEME_MERKEZ", label: "CNC Dik İşleme Merkezi", familyCode: "CNC", categoryCode: "TEZGAH", categoryLabel: "Tezgah", subcategoryCode: "ISLEME_MERKEZI", subcategoryLabel: "İşleme Merkezi" },
  { code: "CNC_KOPRU_TIPI_ISLEME_MERKEZI", label: "CNC Köprü Tipi İşleme Merkezi", familyCode: "CNC", categoryCode: "TEZGAH", categoryLabel: "Tezgah", subcategoryCode: "ISLEME_MERKEZI", subcategoryLabel: "İşleme Merkezi" },
  { code: "CNC_5_EKSEN_ISLEME_MERKEZI", label: "5 Eksen İşleme Merkezi", familyCode: "CNC", categoryCode: "TEZGAH", categoryLabel: "Tezgah", subcategoryCode: "ISLEME_MERKEZI", subcategoryLabel: "İşleme Merkezi" },
  { code: "CNC_TAPPING_CENTER", label: "CNC Tapping Center", familyCode: "CNC", categoryCode: "TEZGAH", categoryLabel: "Tezgah", subcategoryCode: "ISLEME_MERKEZI", subcategoryLabel: "İşleme Merkezi" },
  { code: "CNC_YATAY_TORNA_TEZGAHI", label: "CNC Yatay Torna", familyCode: "CNC", categoryCode: "TEZGAH", categoryLabel: "Tezgah", subcategoryCode: "TORNA", subcategoryLabel: "Torna" },
  { code: "CNC_DIK_TORNA_TEZGAHI", label: "CNC Dik Torna", familyCode: "CNC", categoryCode: "TEZGAH", categoryLabel: "Tezgah", subcategoryCode: "TORNA", subcategoryLabel: "Torna" },
];

const MACHINE_TYPES: MachineTypeOption[] = [
  ...CNC_MACHINE_TYPES,
  ...DIVISION_MACHINE_TYPES.map((type) => ({
    code: type.code,
    label: type.label,
    familyCode: type.productGroupCode as FamilyCode,
    categoryCode: "TEZGAH" as const,
    categoryLabel: "Tezgah" as const,
    subcategoryCode: type.subcategoryCode,
    subcategoryLabel: type.subcategoryLabel,
  })),
];

const LEGACY_TYPE_CODES: Record<string, string> = {
  DIK_ISLEME_MERKEZI: "CNC_DIK_ISLEME_MERKEZ",
  KOPRU_TIPI_ISLEME_MERKEZI: "CNC_KOPRU_TIPI_ISLEME_MERKEZI",
  CNC_TORNA: "CNC_YATAY_TORNA_TEZGAHI",
};

const canonicalTypeCode = (code?: string | null) => {
  const folded = foldProductTypeCode(code);
  return LEGACY_TYPE_CODES[folded] ?? folded;
};

const sameType = (left?: string | null, right?: string | null) => canonicalTypeCode(left) === canonicalTypeCode(right);
const groupLabel = (code: string) => PRODUCT_SPEC_GROUPS.find((group) => group.code === code)?.label ?? code.replaceAll("_", " ");
const localDraftKey = (typeCode: string) => `haksan:technical-workbook:${canonicalTypeCode(typeCode)}`;

function buildDraftRows(typeCode: string, specRows: SpecTemplateRow[]): DraftRow[] {
  const dbRows = specRows.filter((row) => sameType(row.productTypeCode, typeCode));
  const dbByKey = new Map(dbRows.map((row) => [normalizeProductSpecKey(row.specKey), row]));
  const used = new Set<string>();
  const draft: DraftRow[] = [];

  machineSpecTemplateEntries(typeCode).forEach((entry) => {
    const key = normalizeProductSpecKey(entry.key);
    const row = dbByKey.get(key);
    used.add(key);
    draft.push({
      clientId: row?.id ?? `catalog-${entry.group}-${key}`,
      id: row?.id,
      divisionId: row?.divisionId,
      specKey: row?.specKey ?? entry.key,
      groupCode: row?.specGroupCode ?? entry.group,
      defaultValue: row?.defaultValue ?? (entry.value === "-" ? "" : entry.value),
      unit: row?.specUnit ?? entry.unit,
      isActive: row?.isActive !== false,
      catalogOnly: !row,
      inCatalog: true,
    });
  });

  dbRows
    .filter((row) => !used.has(normalizeProductSpecKey(row.specKey)))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .forEach((row) => {
      const inferred = productSpecGroupForTypeKey(typeCode, { key: row.specKey, value: row.defaultValue ?? "" }).code;
      draft.push({
        clientId: row.id,
        id: row.id,
        divisionId: row.divisionId,
        specKey: row.specKey,
        groupCode: row.specGroupCode ?? inferred,
        defaultValue: row.defaultValue ?? "",
        unit: row.specUnit ?? "",
        isActive: row.isActive !== false,
        catalogOnly: false,
        inCatalog: false,
      });
    });

  return draft;
}

function groupRows(rows: DraftRow[]) {
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    if (previous?.groupCode === row.groupCode) return { row, rowSpan: 0 };
    let rowSpan = 1;
    while (rows[index + rowSpan]?.groupCode === row.groupCode) rowSpan += 1;
    return { row, rowSpan };
  });
}

function completionFor(typeCode: string, rows: SpecTemplateRow[]) {
  const registered = rows.filter((row) => sameType(row.productTypeCode, typeCode) && row.isActive !== false);
  const expected = machineSpecTemplateEntries(typeCode).length;
  const percent = expected ? Math.min(100, Math.round((registered.length / expected) * 100)) : registered.length ? 100 : 0;
  return { registered: registered.length, expected, percent, missing: Math.max(0, expected - registered.length) };
}

export function ProductSpecTemplatesCard() {
  const { user } = useAuth();
  const { products } = useStore();
  const [view, setView] = useState<WorkspaceView>("library");
  const [familyCode, setFamilyCode] = useState<FamilyCode>("CNC");
  const [subcategoryCode, setSubcategoryCode] = useState("ISLEME_MERKEZI");
  const [typeCode, setTypeCode] = useState("CNC_DIK_ISLEME_MERKEZ");
  const [specRows, setSpecRows] = useState<SpecTemplateRow[]>([]);
  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);
  const [baseline, setBaseline] = useState("[]");
  const [undoStack, setUndoStack] = useState<DraftRow[][]>([]);
  const [redoStack, setRedoStack] = useState<DraftRow[][]>([]);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [lastDraftSave, setLastDraftSave] = useState<Date | null>(null);

  const divisions = user?.divisions ?? [];
  const familyDivisionId = useMemo(() => {
    const wanted = familyCode === "SAC_ISLEME" ? "SAC_ISLEME" : familyCode;
    return divisions.find((division) => foldProductTypeCode(division.code) === wanted)?.id;
  }, [divisions, familyCode]);

  const familyTypes = useMemo(() => MACHINE_TYPES.filter((type) => type.familyCode === familyCode), [familyCode]);
  const subcategories = useMemo(() => {
    const map = new Map<string, string>();
    familyTypes.forEach((type) => map.set(type.subcategoryCode, type.subcategoryLabel));
    return [...map.entries()].map(([code, label]) => ({ code, label }));
  }, [familyTypes]);
  const scopedTypes = useMemo(() => familyTypes.filter((type) => type.subcategoryCode === subcategoryCode), [familyTypes, subcategoryCode]);
  const selectedType = MACHINE_TYPES.find((type) => sameType(type.code, typeCode)) ?? scopedTypes[0] ?? familyTypes[0];

  useEffect(() => {
    const nextSubcategory = familyTypes.find((type) => type.subcategoryCode === subcategoryCode)?.subcategoryCode ?? familyTypes[0]?.subcategoryCode ?? "";
    const nextType = familyTypes.find((type) => type.subcategoryCode === nextSubcategory && sameType(type.code, typeCode)) ?? familyTypes.find((type) => type.subcategoryCode === nextSubcategory);
    setSubcategoryCode(nextSubcategory);
    if (nextType) setTypeCode(nextType.code);
    setSearch("");
  }, [familyCode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const nextType = familyTypes.find((type) => type.subcategoryCode === subcategoryCode && sameType(type.code, typeCode)) ?? familyTypes.find((type) => type.subcategoryCode === subcategoryCode);
    if (nextType) setTypeCode(nextType.code);
    setSearch("");
  }, [subcategoryCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSpecTemplates = async () => {
    setLoading(true);
    try {
      const rows = await adminService.productSpecTemplates(undefined, familyDivisionId);
      setSpecRows(rows ?? []);
      return rows ?? [];
    } catch (error: any) {
      toast.error("Teknik şablonlar yüklenemedi", { description: error?.message ?? "API isteği başarısız oldu." });
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSpecTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyDivisionId]);

  const prepareWorkbook = (nextTypeCode: string, sourceRows = specRows, allowLocalDraft = true) => {
    const serverDraft = buildDraftRows(nextTypeCode, sourceRows);
    let nextDraft = serverDraft;
    if (allowLocalDraft) {
      try {
        const cached = JSON.parse(localStorage.getItem(localDraftKey(nextTypeCode)) ?? "null");
        if (cached?.rows?.length && Array.isArray(cached.rows)) nextDraft = cached.rows;
      } catch {
        // Bozuk yerel taslak sessizce yok sayılır; sunucu verisi güvenli kaynaktır.
      }
    }
    setDraftRows(nextDraft);
    setBaseline(JSON.stringify(serverDraft));
    setUndoStack([]);
    setRedoStack([]);
    setSelectedRowId(nextDraft[0]?.clientId ?? null);
    setLastDraftSave(null);
  };

  useEffect(() => {
    if (view === "editor" && selectedType) prepareWorkbook(selectedType.code);
    // Only reset when the selected product type or server source changes deliberately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, typeCode]);

  const dirty = JSON.stringify(draftRows) !== baseline;
  useEffect(() => {
    if (view !== "editor" || !selectedType || !dirty) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(localDraftKey(selectedType.code), JSON.stringify({ savedAt: new Date().toISOString(), rows: draftRows }));
      setLastDraftSave(new Date());
    }, 500);
    return () => window.clearTimeout(timer);
  }, [dirty, draftRows, selectedType, view]);

  const applyDraft = (updater: DraftRow[] | ((current: DraftRow[]) => DraftRow[])) => {
    setDraftRows((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      if (JSON.stringify(next) === JSON.stringify(current)) return current;
      setUndoStack((stack) => [...stack.slice(-39), current]);
      setRedoStack([]);
      return next;
    });
  };

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack((stack) => [draftRows, ...stack].slice(0, 40));
    setDraftRows(previous);
    setUndoStack((stack) => stack.slice(0, -1));
  };

  const redo = () => {
    const next = redoStack[0];
    if (!next) return;
    setUndoStack((stack) => [...stack.slice(-39), draftRows]);
    setDraftRows(next);
    setRedoStack((stack) => stack.slice(1));
  };

  const updateDraftRow = (clientId: string, patch: Partial<DraftRow>) => {
    applyDraft((current) => current.map((row) => (row.clientId === clientId ? { ...row, ...patch, catalogOnly: row.catalogOnly && !row.id } : row)));
  };

  const addField = (groupCode?: string) => {
    const selected = draftRows.find((row) => row.clientId === selectedRowId);
    const targetGroup = groupCode ?? selected?.groupCode ?? draftRows.at(-1)?.groupCode ?? "GENEL";
    const existingNames = new Set(draftRows.map((row) => normalizeProductSpecKey(row.specKey)));
    let number = 1;
    while (existingNames.has(normalizeProductSpecKey(`Yeni Teknik Bilgi ${number}`))) number += 1;
    const row: DraftRow = {
      clientId: `new-${crypto.randomUUID()}`,
      specKey: `Yeni Teknik Bilgi ${number}`,
      groupCode: targetGroup,
      defaultValue: "",
      unit: "",
      isActive: true,
      catalogOnly: true,
      inCatalog: false,
    };
    const lastGroupIndex = draftRows.reduce((last, item, index) => (item.groupCode === targetGroup ? index : last), -1);
    applyDraft((current) => {
      const next = [...current];
      next.splice(lastGroupIndex >= 0 ? lastGroupIndex + 1 : next.length, 0, row);
      return next;
    });
    setSelectedRowId(row.clientId);
  };

  /**
   * Alanı çalışma sayfasından çıkarır. Sunucudaki karşılığı (varsa) Kaydet ile
   * birlikte silinir; böylece geri al (undo) ile karar değiştirilebilir.
   */
  const removeField = (clientId: string) => {
    const target = draftRows.find((row) => row.clientId === clientId);
    if (!target) return;
    if (target.inCatalog) {
      toast.error("Katalog alanı silinemez", { description: "Bu alan makine tipinin şablonunda tanımlı; gizlemek için pasifleştirin." });
      return;
    }
    applyDraft((current) => current.filter((row) => row.clientId !== clientId));
    setSelectedRowId((current) => (current === clientId ? null : current));
    toast.success("Alan çalışma sayfasından kaldırıldı", {
      description: target.id ? "Kaydet'e bastığınızda sunucudan da silinecek." : "Kaydedilmemiş alan olduğu için doğrudan kaldırıldı.",
    });
  };

  const addSection = () => {
    const used = new Set(draftRows.map((row) => row.groupCode));
    const nextGroup = PRODUCT_SPEC_GROUPS.find((group) => !used.has(group.code));
    if (!nextGroup) return toast.info("Tüm teknik bölümler çalışma sayfasında bulunuyor");
    addField(nextGroup.code);
    toast.success(`${nextGroup.label} bölümü eklendi`);
  };

  const moveRow = (clientId: string, direction: -1 | 1) => {
    applyDraft((current) => {
      const index = current.findIndex((row) => row.clientId === clientId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length || current[target].groupCode !== current[index].groupCode) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const pasteValues = (clientId: string, text: string) => {
    const matrix = text.replace(/\r/g, "").split("\n").filter(Boolean).map((line) => line.split("\t"));
    if (matrix.length <= 1 && matrix[0]?.length <= 1) return false;
    applyDraft((current) => {
      const start = current.findIndex((row) => row.clientId === clientId);
      if (start < 0) return current;
      return current.map((row, index) => {
        const values = matrix[index - start];
        if (!values) return row;
        return { ...row, defaultValue: values[0] ?? row.defaultValue, unit: values[1] ?? row.unit };
      });
    });
    toast.success(`${matrix.length} satıra değer yapıştırıldı`);
    return true;
  };

  const saveWorkbook = async () => {
    if (!selectedType || !draftRows.length) return;
    const activeNames = draftRows.filter((row) => row.isActive).map((row) => normalizeProductSpecKey(row.specKey.trim()));
    if (activeNames.some((name) => !name)) return toast.error("Teknik bilgi adı boş bırakılamaz");
    if (new Set(activeNames).size !== activeNames.length) return toast.error("Aynı teknik bilgi adı birden fazla kez kullanılamaz");
    // Çalışma sayfasından çıkarılan sunucu kayıtları önce silinir: aynı alan adı
    // silinen satırdan devralınıyorsa toplu kayıt teklik hatasına düşmesin.
    const keptIds = new Set(draftRows.map((row) => row.id).filter(Boolean) as string[]);
    const removedIds = specRows
      .filter((row) => sameType(row.productTypeCode, selectedType.code) && !keptIds.has(row.id))
      .map((row) => row.id);
    setBusy(true);
    try {
      for (const id of removedIds) await adminService.deleteProductSpecTemplate(id);
      const result = await adminService.batchSaveProductSpecTemplates(
        draftRows.map((row, index) => ({
          id: row.id,
          productTypeCode: selectedType.code,
          specKey: row.specKey.trim(),
          specGroupCode: row.groupCode,
          defaultValue: row.defaultValue || undefined,
          specUnit: row.unit || undefined,
          divisionId: row.divisionId ?? familyDivisionId ?? null,
          sortOrder: index,
          isActive: row.isActive,
        }))
      );
      const otherRows = specRows.filter((row) => !sameType(row.productTypeCode, selectedType.code));
      const nextRows = [...otherRows, ...(result.rows as SpecTemplateRow[])];
      setSpecRows(nextRows);
      localStorage.removeItem(localDraftKey(selectedType.code));
      prepareWorkbook(selectedType.code, nextRows, false);
      toast.success("Teknik çalışma sayfası kaydedildi", {
        description: [`${result.rows.length} alan güncellendi.`, removedIds.length ? `${removedIds.length} alan silindi.` : null]
          .filter(Boolean)
          .join(" "),
      });
    } catch (error: any) {
      toast.error("Değişiklikler kaydedilemedi", { description: error?.message ?? "API isteği başarısız oldu." });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (view !== "editor") return;
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase("tr-TR") === "s") {
        event.preventDefault();
        if (dirty && !busy) void saveWorkbook();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase("tr-TR") === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });

  const filteredDraftRows = useMemo(() => {
    const query = normalizeProductSpecKey(search);
    return query ? draftRows.filter((row) => normalizeProductSpecKey(`${row.specKey} ${groupLabel(row.groupCode)} ${row.defaultValue}`).includes(query)) : draftRows;
  }, [draftRows, search]);
  const displayDraftRows = useMemo(() => groupRows(filteredDraftRows), [filteredDraftRows]);
  const selectedDraftRow = draftRows.find((row) => row.clientId === selectedRowId) ?? null;
  const selectedCompletion = selectedType ? completionFor(selectedType.code, specRows) : { registered: 0, expected: 0, percent: 0, missing: 0 };
  const activeCount = draftRows.filter((row) => row.isActive).length;
  const uniqueGroupCount = new Set(draftRows.map((row) => row.groupCode)).size;

  const librarySearch = normalizeProductSpecKey(search);
  const libraryTypes = familyTypes.filter((type) => {
    if (subcategoryCode && type.subcategoryCode !== subcategoryCode) return false;
    return !librarySearch || normalizeProductSpecKey(`${type.label} ${type.code}`).includes(librarySearch);
  });

  const machines = useMemo(() => (products as any[])
    .filter((product) => sameType(product.productTypeCode, selectedType?.code))
    .map((product) => ({
      id: product.id,
      modelCode: product.modelCode ?? product.model ?? product.stockCode,
      productTypeCode: product.productTypeCode,
      label: [typeof product.brand === "string" ? product.brand : product.brand?.name, product.modelCode ?? product.model, product.fullName ?? product.shortDescription].filter(Boolean).join(" • "),
    })), [products, selectedType?.code]);

  const openWorkbook = (nextTypeCode: string) => {
    const type = MACHINE_TYPES.find((item) => sameType(item.code, nextTypeCode));
    if (type) {
      setFamilyCode(type.familyCode);
      setSubcategoryCode(type.subcategoryCode);
      setTypeCode(type.code);
    }
    setSearch("");
    setView("editor");
  };

  const hierarchyLabel = selectedType ? `${selectedType.familyCode === "SAC_ISLEME" ? "Sac İşleme" : selectedType.familyCode === "UNIVERSAL" ? "Üniversal" : "CNC"} › ${selectedType.categoryLabel} › ${selectedType.subcategoryLabel} › ${selectedType.label}` : "";

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <div className="flex min-h-14 items-center justify-between gap-4 bg-[#071c54] px-4 text-white sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-display text-xl font-bold tracking-[0.08em]">HAKSAN</span>
          <span className="h-6 w-px bg-white/25" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Teknik Bilgi Merkezi</p>
            <p className="truncate text-[10px] text-white/60">Şablon kütüphanesi ve makine çalışma sayfaları</p>
          </div>
        </div>
        {view === "editor" ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="border border-white/25 text-white hover:bg-white/10 hover:text-white" onClick={() => setView("library")}><ArrowLeft className="mr-1.5 size-4" />Kütüphaneye dön</Button>
            <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-500" disabled={!dirty || busy} onClick={() => void saveWorkbook()}><Save className="mr-1.5 size-4" />{busy ? "Kaydediliyor" : "Değişiklikleri kaydet"}</Button>
          </div>
        ) : (
          <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-500" onClick={() => selectedType && openWorkbook(selectedType.code)}><Plus className="mr-1.5 size-4" />Yeni şablon</Button>
        )}
      </div>

      <div className="flex border-b border-slate-300 bg-white">
        {FAMILIES.map((family) => (
          <button key={family.code} type="button" onClick={() => { setFamilyCode(family.code); setView("library"); }} className={cn("relative flex h-12 min-w-36 items-center justify-center gap-2 border-r border-slate-200 px-5 text-xs font-medium transition-colors", familyCode === family.code ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-50")}>
            {family.code === "CNC" ? <Settings2 className="size-4" /> : family.code === "SAC_ISLEME" ? <Sheet className="size-4" /> : <Wrench className="size-4" />}
            {family.label}
            {familyCode === family.code && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" />}
          </button>
        ))}
      </div>

      {view === "library" ? (
        <LibraryView
          familyCode={familyCode}
          subcategories={subcategories}
          subcategoryCode={subcategoryCode}
          setSubcategoryCode={setSubcategoryCode}
          scopedTypes={scopedTypes}
          typeCode={typeCode}
          setTypeCode={setTypeCode}
          search={search}
          setSearch={setSearch}
          types={libraryTypes}
          specRows={specRows}
          loading={loading}
          openWorkbook={openWorkbook}
          onImport={() => setImportOpen(true)}
        />
      ) : selectedType ? (
        <EditorView
          type={selectedType}
          search={search}
          setSearch={setSearch}
          rows={draftRows}
          displayRows={displayDraftRows}
          selectedRow={selectedDraftRow}
          selectedRowId={selectedRowId}
          setSelectedRowId={setSelectedRowId}
          updateRow={updateDraftRow}
          addField={addField}
          removeField={removeField}
          addSection={addSection}
          moveRow={moveRow}
          pasteValues={pasteValues}
          undo={undo}
          redo={redo}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          completion={selectedCompletion.percent}
          activeCount={activeCount}
          groupCount={uniqueGroupCount}
          dirty={dirty}
          lastDraftSave={lastDraftSave}
          busy={busy}
          save={() => void saveWorkbook()}
          openImport={() => setImportOpen(true)}
        />
      ) : null}

      {selectedType && (
        <TechnicalImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          productTypeCode={selectedType.code}
          productTypeLabel={selectedType.label}
          hierarchyLabel={hierarchyLabel}
          divisionId={familyDivisionId}
          availableFields={draftRows.length ? draftRows.map((row) => ({ key: row.specKey, groupCode: row.groupCode, unit: row.unit })) : buildDraftRows(selectedType.code, specRows).map((row) => ({ key: row.specKey, groupCode: row.groupCode, unit: row.unit }))}
          machines={machines}
          onImported={async (importMode) => {
            if (importMode === "machine_data") return;
            const nextRows = await loadSpecTemplates();
            if (view === "editor") prepareWorkbook(selectedType.code, nextRows, false);
          }}
        />
      )}
    </div>
  );
}

type LibraryViewProps = {
  familyCode: FamilyCode;
  subcategories: Array<{ code: string; label: string }>;
  subcategoryCode: string;
  setSubcategoryCode: (code: string) => void;
  scopedTypes: MachineTypeOption[];
  typeCode: string;
  setTypeCode: (code: string) => void;
  search: string;
  setSearch: (value: string) => void;
  types: MachineTypeOption[];
  specRows: SpecTemplateRow[];
  loading: boolean;
  openWorkbook: (typeCode: string) => void;
  onImport: () => void;
};

function LibraryView({ familyCode, subcategories, subcategoryCode, setSubcategoryCode, scopedTypes, typeCode, setTypeCode, search, setSearch, types, specRows, loading, openWorkbook, onImport }: LibraryViewProps) {
  const familyLabel = FAMILIES.find((family) => family.code === familyCode)?.label ?? familyCode;
  const recent = [...specRows].filter((row) => MACHINE_TYPES.some((type) => type.familyCode === familyCode && sameType(type.code, row.productTypeCode))).sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))).slice(0, 4);
  return (
    <div className="bg-[#f8fafc]">
      <div className="border-b border-slate-200 bg-white p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_minmax(240px,.9fr)]">
          <HierarchySelect index="01" label="Ürün Kategorisi" value="TEZGAH" options={[{ code: "TEZGAH", label: "Tezgah" }]} onChange={() => undefined} />
          <HierarchySelect index="02" label="Ürün Alt Kategorisi" value={subcategoryCode} options={subcategories} onChange={setSubcategoryCode} />
          <HierarchySelect index="03" label="Ürün Tipi" value={typeCode} options={scopedTypes.map((type) => ({ code: type.code, label: type.label }))} onChange={setTypeCode} />
          <div className="relative self-end">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Makine veya şablon ara" className="h-10 border-slate-300 bg-white pl-9 text-xs" />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-500"><span className="font-semibold text-blue-700">{familyLabel}</span><ArrowRight className="size-3" /><span>Tezgah</span><ArrowRight className="size-3" /><span>{subcategories.find((item) => item.code === subcategoryCode)?.label}</span></div>
      </div>

      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div><h3 className="text-sm font-semibold text-slate-900">Makine şablonları</h3><p className="mt-0.5 text-[11px] text-slate-500">Teknik alan kapsamını kontrol edin veya çalışma sayfasını açın.</p></div>
          <Button variant="outline" size="sm" onClick={onImport}><Upload className="mr-1.5 size-4" />Excel / CSV ile aktar</Button>
        </div>
        {loading ? (
          <div className="grid min-h-64 place-items-center text-xs text-slate-500">Teknik şablonlar yükleniyor…</div>
        ) : types.length ? (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {types.map((type) => <TemplateCard key={type.code} type={type} specRows={specRows} selected={sameType(type.code, typeCode)} onSelect={() => setTypeCode(type.code)} onOpen={() => openWorkbook(type.code)} />)}
          </div>
        ) : (
          <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-slate-300 bg-white text-center"><div><ListFilter className="mx-auto size-7 text-slate-400" /><p className="mt-2 text-sm font-medium">Bu filtrede şablon bulunamadı</p><button type="button" className="mt-1 text-xs text-blue-700" onClick={() => setSearch("")}>Aramayı temizle</button></div></div>
        )}

        <div className="mt-4 rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5"><h4 className="text-xs font-semibold text-slate-800">Son teknik hareketler</h4><span className="text-[10px] text-slate-500">{specRows.length} toplam kayıt</span></div>
          <div className="grid divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
            {recent.length ? recent.map((row) => <div key={row.id} className="flex items-start gap-2 px-4 py-3"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /><div className="min-w-0"><p className="truncate text-[11px] font-medium text-slate-800">{row.specKey}</p><p className="mt-0.5 truncate text-[10px] text-slate-500">{MACHINE_TYPES.find((type) => sameType(type.code, row.productTypeCode))?.label ?? row.productTypeCode}</p></div></div>) : <div className="col-span-full px-4 py-5 text-center text-xs text-slate-500">Henüz kayıtlı teknik hareket yok.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function HierarchySelect({ index, label, value, options, onChange }: { index: string; label: string; value: string; options: Array<{ code: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <label className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500"><span className="font-mono text-blue-700">{index}</span>{label}</label>
      <div className="relative">
        <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full appearance-none rounded-md border border-slate-300 bg-white px-3 pr-9 text-xs font-medium text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100">{options.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}</select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
      </div>
    </div>
  );
}

function TemplateCard({ type, specRows, selected, onSelect, onOpen }: { type: MachineTypeOption; specRows: SpecTemplateRow[]; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const completion = completionFor(type.code, specRows);
  const modelCode = type.code.replace(/^CNC_/, "HKM-").replaceAll("_", "-").slice(0, 18);
  return (
    <article onClick={onSelect} className={cn("group relative grid min-h-56 cursor-pointer grid-cols-[74px_minmax(0,1fr)] overflow-hidden rounded-lg border bg-white transition-all", selected ? "border-blue-600 shadow-[0_0_0_1px_#2563eb]" : "border-slate-300 hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md")}>
      <div className="relative flex flex-col items-center bg-[linear-gradient(180deg,#071c54,#0a2b59)] px-2 py-3 text-white">
        <span className="text-[8px] font-semibold tracking-[0.1em] text-white/60">TAMAMLIK</span><strong className="mt-1 font-display text-2xl">{completion.percent}%</strong>
        <div className="mt-2 flex h-24 w-3 flex-col-reverse gap-0.5">{Array.from({ length: 10 }).map((_, index) => <span key={index} className={cn("flex-1 border border-white/10", index < Math.round(completion.percent / 10) ? "bg-blue-500" : "bg-white/25")} />)}</div>
        <span className="mt-auto grid size-7 place-items-center rounded-full border border-white/40"><Grid3X3 className="size-3.5" /></span>
      </div>
      <div className="relative flex min-w-0 flex-col p-4">
        <span className="absolute left-2 top-2 size-2 rounded-full border border-slate-400 bg-slate-200" /><span className="absolute right-2 top-2 size-2 rounded-full border border-slate-400 bg-slate-200" />
        <p className="pl-2 font-mono text-[9px] tracking-[0.22em] text-slate-500">{modelCode}</p>
        <h3 className="mt-3 max-w-[18rem] font-display text-[25px] font-bold uppercase leading-[0.96] tracking-tight text-[#0b1f44]">{type.label}</h3>
        <div className="mt-4 border-t border-slate-200 pt-3 text-[11px]">
          <div className="flex items-center justify-between text-slate-600"><span>{completion.registered} teknik alan</span><span>{new Set(machineSpecTemplateEntries(type.code).map((entry) => entry.group)).size} bölüm</span></div>
          <div className={cn("mt-2 flex items-center gap-1.5", completion.missing ? "text-rose-600" : "text-emerald-700")}>{completion.missing ? <CircleAlert className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}{completion.missing ? `${completion.missing} alan eksik` : "Şablon hazır"}</div>
        </div>
        <Button size="sm" className="mt-auto self-end bg-blue-600 text-white hover:bg-blue-700" onClick={(event) => { event.stopPropagation(); onOpen(); }}>Çalışma sayfasını aç<ArrowRight className="ml-1.5 size-4" /></Button>
      </div>
    </article>
  );
}

type EditorViewProps = {
  type: MachineTypeOption;
  search: string;
  setSearch: (value: string) => void;
  rows: DraftRow[];
  displayRows: Array<{ row: DraftRow; rowSpan: number }>;
  selectedRow: DraftRow | null;
  selectedRowId: string | null;
  setSelectedRowId: (id: string) => void;
  updateRow: (id: string, patch: Partial<DraftRow>) => void;
  addField: (groupCode?: string) => void;
  removeField: (id: string) => void;
  addSection: () => void;
  moveRow: (id: string, direction: -1 | 1) => void;
  pasteValues: (id: string, text: string) => boolean;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  completion: number;
  activeCount: number;
  groupCount: number;
  dirty: boolean;
  lastDraftSave: Date | null;
  busy: boolean;
  save: () => void;
  openImport: () => void;
};

function EditorView({ type, search, setSearch, rows, displayRows, selectedRow, selectedRowId, setSelectedRowId, updateRow, addField, removeField, addSection, moveRow, pasteValues, undo, redo, canUndo, canRedo, completion, activeCount, groupCount, dirty, lastDraftSave, busy, save, openImport }: EditorViewProps) {
  const [pendingDelete, setPendingDelete] = useState<DraftRow | null>(null);
  return (
    <div className="bg-[#f8fafc]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0"><h2 className="truncate font-display text-2xl font-bold text-[#0b1f44]">{type.label}</h2><p className="font-mono text-[9px] tracking-[0.22em] text-slate-500">{type.code}</p></div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500"><Badge variant="outline" className="border-slate-300 bg-white">{type.familyCode === "SAC_ISLEME" ? "Sac İşleme" : type.familyCode === "UNIVERSAL" ? "Üniversal" : "CNC"}</Badge><ArrowRight className="size-3" /><span>Tezgah</span><ArrowRight className="size-3" /><span>{type.subcategoryLabel}</span></div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-300 bg-white px-3 py-2">
        <Button variant="outline" size="sm" onClick={() => addField()}><Plus className="mr-1.5 size-4" />Alan ekle</Button>
        <Button variant="outline" size="sm" onClick={addSection}><Plus className="mr-1.5 size-4" />Bölüm ekle</Button>
        <Button variant="outline" size="sm" onClick={openImport}><Upload className="mr-1.5 size-4" />Excel / CSV yükle</Button>
        <Button variant="outline" size="sm" onClick={() => void exportService.technicalImportTemplate()}><Download className="mr-1.5 size-4" />Şablon indir</Button>
        <div className="ml-auto flex min-w-64 flex-1 items-center justify-end gap-2">
          <div className="relative w-full max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Teknik bilgide ara" className="h-8 border-slate-300 pl-9 text-xs" /></div>
          <Button variant="outline" size="icon" className="size-8" disabled={!canUndo} onClick={undo}><Undo2 className="size-4" /></Button>
          <Button variant="outline" size="icon" className="size-8" disabled={!canRedo} onClick={redo}><Redo2 className="size-4" /></Button>
          <Button size="sm" disabled={!dirty || busy} onClick={save} className="bg-blue-600 hover:bg-blue-700"><Save className="mr-1.5 size-4" />Kaydet</Button>
        </div>
      </div>

      <div className="grid min-h-[620px] xl:grid-cols-[104px_minmax(680px,1fr)_264px]">
        <aside className="hidden border-r border-slate-300 bg-white p-3 xl:flex xl:flex-col">
          <p className="font-display text-[11px] font-bold tracking-wide text-slate-700">ŞABLON TAMLIĞI</p><strong className="mt-1 font-display text-3xl text-blue-700">{completion}%</strong>
          <div className="mt-3 flex h-44 w-5 flex-col-reverse gap-0.5">{Array.from({ length: 12 }).map((_, index) => <span key={index} className={cn("flex-1 border border-slate-200", index < Math.round((completion / 100) * 12) ? "bg-blue-600" : "bg-slate-200")} />)}</div>
          <div className="mt-5 border-t border-slate-200 pt-4"><p className="font-mono text-[8px] tracking-[0.14em] text-slate-500">MODEL KODU</p><p className="mt-1 break-words font-display text-base font-bold text-[#0b1f44]">{type.code.replaceAll("_", "-")}</p></div>
          <div className="mt-4 space-y-2 text-[10px] text-slate-600"><div>{activeCount} teknik alan</div><div>{groupCount} bölüm</div><div className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="size-3" />Aktif</div></div>
          <Grid3X3 className="mt-auto size-7 text-slate-400" />
        </aside>

        <div className="min-w-0 overflow-auto bg-white">
          <table className="w-full min-w-[760px] border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 shadow-[0_1px_0_#cbd5e1]">
              <tr className="h-6 border-b border-slate-300 text-[10px]"><th className="w-11 border-r border-slate-300">#</th>{["A", "B", "C", "D", "E"].map((letter) => <th key={letter} className="border-r border-slate-300 font-medium">{letter}</th>)}<th className="w-10" /></tr>
              <tr className="h-8"><th className="border-r border-slate-300">#</th><th className="w-24 border-r border-slate-300">Bölüm</th><th className="border-r border-slate-300">Teknik Bilgi</th><th className="border-r border-slate-300">Başlangıç Değeri</th><th className="w-28 border-r border-slate-300">Birim</th><th className="w-32 border-r border-slate-300">Durum</th><th className="w-10"><span className="sr-only">Sil</span></th></tr>
            </thead>
            <tbody>
              {displayRows.map(({ row, rowSpan }, index) => {
                const selected = selectedRowId === row.clientId;
                return (
                  <tr key={row.clientId} onClick={() => setSelectedRowId(row.clientId)} className={cn("h-8 border-b border-dotted border-slate-300", selected && "bg-blue-50/60", !row.isActive && "text-slate-400")}>
                    <td className="border-r border-slate-200 text-center tabular-nums text-slate-500">{index + 1}</td>
                    {rowSpan > 0 && <td rowSpan={rowSpan} className="border-r border-slate-300 bg-slate-50 p-0 text-center"><span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }} className="inline-block py-2 font-display text-sm font-bold tracking-[0.08em] text-slate-700">{groupLabel(row.groupCode)}</span></td>}
                    <td className="border-r border-slate-200 p-0"><input value={row.specKey} onFocus={() => setSelectedRowId(row.clientId)} onChange={(event) => updateRow(row.clientId, { specKey: event.target.value })} className="h-8 w-full border-0 bg-transparent px-3 outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-500" /></td>
                    <td className="border-r border-slate-200 p-0"><input value={row.defaultValue} onFocus={() => setSelectedRowId(row.clientId)} onPaste={(event) => { if (pasteValues(row.clientId, event.clipboardData.getData("text"))) event.preventDefault(); }} onChange={(event) => updateRow(row.clientId, { defaultValue: event.target.value })} className="h-8 w-full border-0 bg-transparent px-3 font-medium outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-500" /></td>
                    <td className="border-r border-slate-200 p-0"><input value={row.unit} onFocus={() => setSelectedRowId(row.clientId)} onChange={(event) => updateRow(row.clientId, { unit: event.target.value })} className="h-8 w-full border-0 bg-transparent px-3 outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-500" /></td>
                    <td className="border-r border-slate-200 p-0"><select value={row.isActive ? "active" : "inactive"} onChange={(event) => updateRow(row.clientId, { isActive: event.target.value === "active" })} className="h-8 w-full border-0 bg-transparent px-2 text-[11px] outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"><option value="active">● Aktif</option><option value="inactive">○ Pasif</option></select></td>
                    <td className="p-0 text-center">
                      <button
                        type="button"
                        disabled={row.inCatalog}
                        title={row.inCatalog ? "Katalog alanı silinemez; pasifleştirin." : "Alanı sil"}
                        aria-label={`${row.specKey} alanını sil`}
                        onClick={(event) => { event.stopPropagation(); setPendingDelete(row); }}
                        className="grid size-8 place-items-center text-slate-400 transition-colors hover:text-rose-600 disabled:cursor-not-allowed disabled:text-slate-200"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside className="border-l border-slate-300 bg-white">
          <div className="flex h-11 items-center justify-between border-b border-slate-200 px-4"><h3 className="text-xs font-semibold text-slate-800">Alan ayarları</h3><Settings2 className="size-4 text-slate-400" /></div>
          {selectedRow ? (
            <div className="space-y-4 p-4">
              <InspectorField label="Teknik bilgi adı" value={selectedRow.specKey} onChange={(value) => updateRow(selectedRow.clientId, { specKey: value })} />
              <InspectorField label="Başlangıç değeri" value={selectedRow.defaultValue} onChange={(value) => updateRow(selectedRow.clientId, { defaultValue: value })} />
              <div><label className="text-[10px] font-medium text-slate-500">Bölüm</label><select value={selectedRow.groupCode} onChange={(event) => updateRow(selectedRow.clientId, { groupCode: event.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs outline-none focus:border-blue-600">{PRODUCT_SPEC_GROUPS.map((group) => <option key={group.code} value={group.code}>{group.label}</option>)}</select></div>
              <InspectorField label="Birim" value={selectedRow.unit} onChange={(value) => updateRow(selectedRow.clientId, { unit: value })} />
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5"><div><p className="text-xs font-medium text-slate-800">Aktif alan</p><p className="text-[10px] text-slate-500">Yeni makinelerde gösterilir</p></div><Switch checked={selectedRow.isActive} onCheckedChange={(checked) => updateRow(selectedRow.clientId, { isActive: checked })} /></div>
              <div className="grid grid-cols-2 gap-2"><Button variant="outline" size="sm" onClick={() => moveRow(selectedRow.clientId, -1)}>Yukarı</Button><Button variant="outline" size="sm" onClick={() => moveRow(selectedRow.clientId, 1)}>Aşağı</Button></div>
              <Button variant="outline" size="sm" className="w-full border-amber-200 text-amber-700 hover:bg-amber-50" disabled={!selectedRow.isActive} onClick={() => updateRow(selectedRow.clientId, { isActive: false })}><EyeOff className="mr-1.5 size-4" />Alanı pasifleştir</Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full border-rose-200 text-rose-700 hover:bg-rose-50 disabled:text-slate-400"
                disabled={selectedRow.inCatalog}
                title={selectedRow.inCatalog ? "Katalog şablonundaki alan silinemez; gizlemek için pasifleştirin." : "Alanı kalıcı olarak sil"}
                onClick={() => setPendingDelete(selectedRow)}
              >
                <Trash2 className="mr-1.5 size-4" />Alanı sil
              </Button>
              <p className="text-[10px] leading-relaxed text-slate-500">
                {selectedRow.inCatalog
                  ? "Bu alan makine tipinin katalog şablonunda tanımlı. Silinse bile şablon yeniden kurulduğunda öneri olarak geri gelir; kullanım dışı bırakmak için pasifleştirin."
                  : "Pasifleştirme alanı listede tutar, yeni makinelerde göstermez. Silme kaydı kalıcı kaldırır ve aynı alan adı yeniden kullanılabilir."}
              </p>
            </div>
          ) : <div className="p-6 text-center text-xs text-slate-500">Ayarlarını düzenlemek için bir satır seçin.</div>}
        </aside>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-300 bg-white px-4 py-2.5 text-[11px]">
        <div className="flex items-center gap-4"><span>{rows.length} teknik alan</span><span>{groupCount} bölüm</span><span className={cn("flex items-center gap-1", dirty ? "text-amber-700" : "text-emerald-700")}>{dirty ? <CircleAlert className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}{dirty ? lastDraftSave ? `Taslak kaydedildi ${lastDraftSave.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}` : "Kaydedilmemiş değişiklikler" : "Tüm değişiklikler kayıtlı"}</span></div>
        <div className="flex items-center"><button type="button" className="border-b-2 border-blue-600 px-5 py-2 font-medium text-blue-700">Şablon Alanları</button><button type="button" onClick={openImport} className="border-b-2 border-transparent px-5 py-2 text-slate-600 hover:text-slate-900">Makine Verileri</button><button type="button" onClick={() => addField()} className="ml-2 grid size-8 place-items-center rounded border border-slate-200 hover:bg-slate-50"><Plus className="size-4" /></button></div>
      </div>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Teknik alan silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              <b>{pendingDelete?.specKey}</b> alanı {type.label} şablonundan kaldırılacak.
              {pendingDelete?.id
                ? " Kaydet'e bastığınızda sunucudan da kalıcı olarak silinir; mevcut makinelerin girilmiş değerleri korunur."
                : " Alan henüz kaydedilmediği için doğrudan kaldırılır."}
              {" "}Yalnızca gizlemek istiyorsanız pasifleştirmeyi kullanın.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={(event) => {
                event.preventDefault();
                if (pendingDelete) removeField(pendingDelete.clientId);
                setPendingDelete(null);
              }}
            >
              Alanı sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InspectorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div><label className="text-[10px] font-medium text-slate-500">{label}</label><Input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 border-slate-300 text-xs" /></div>;
}
