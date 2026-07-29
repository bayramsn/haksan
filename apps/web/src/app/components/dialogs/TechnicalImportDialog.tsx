import { useMemo, useRef, useState } from "react";
import type { TechnicalImportAvailableField, TechnicalImportMode, TechnicalImportRowInput } from "@haksan/shared";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { adminService, type TechnicalImportPreview } from "../../../lib/services";
import { exportService } from "../../../lib/downloadExport";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { cn } from "../ui/utils";

type MachineOption = { id: string; label: string; modelCode?: string; productTypeCode?: string | null };

type TechnicalImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productTypeCode: string;
  productTypeLabel: string;
  hierarchyLabel: string;
  divisionId?: string;
  availableFields: TechnicalImportAvailableField[];
  machines: MachineOption[];
  onImported: (mode: TechnicalImportMode) => Promise<void> | void;
};

const STATUS_META = {
  exact: { label: "Tam eşleşme", dot: "bg-emerald-500", className: "text-emerald-700" },
  normalized: { label: "İsimle eşleşti", dot: "bg-blue-500", className: "text-blue-700" },
  review: { label: "Onay gerekli", dot: "bg-amber-500", className: "text-amber-700" },
  unmatched: { label: "Eşleşmedi", dot: "bg-rose-500", className: "text-rose-700" },
} as const;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",").pop() ?? "" : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function groupedRows(rows: TechnicalImportRowInput[]) {
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    if (previous?.section === row.section) return { row, rowSpan: 0 };
    let rowSpan = 1;
    while (rows[index + rowSpan]?.section === row.section) rowSpan += 1;
    return { row, rowSpan };
  });
}

export function TechnicalImportDialog({
  open,
  onOpenChange,
  productTypeCode,
  productTypeLabel,
  hierarchyLabel,
  divisionId,
  availableFields,
  machines,
  onImported,
}: TechnicalImportDialogProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<TechnicalImportMode>("machine_data");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TechnicalImportPreview | null>(null);
  const [rows, setRows] = useState<TechnicalImportRowInput[]>([]);
  const [targetProductId, setTargetProductId] = useState("");
  const [confirmedTarget, setConfirmedTarget] = useState(false);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [filter, setFilter] = useState<"all" | "review" | "unmatched">("all");
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState(false);

  const downloadTemplate = async (format: "xlsx" | "csv") => {
    setDownloading(true);
    try {
      await exportService.technicalImportTemplate({
        productTypeCode,
        productTypeLabel,
        format,
        // Makine verisi aktarımında dosya tek bir makine için doldurulur; şablon
        // alanlarının kendi başlangıç değerleri hedefi yanıltmasın diye boş gelir.
        includeValues: mode === "template_fields",
        fields: availableFields.map((field) => ({ key: field.key, groupCode: field.groupCode, section: field.groupCode, unit: field.unit })),
      });
      toast.success(`${format.toLocaleUpperCase("tr-TR")} şablonu indirildi`, { description: `${productTypeLabel} · ${availableFields.length} alan` });
    } catch (error: any) {
      toast.error("Şablon indirilemedi", { description: error?.message ?? "Sunucu isteği başarısız oldu." });
    } finally {
      setDownloading(false);
    }
  };

  const resetPreview = () => {
    setPreview(null);
    setRows([]);
    setTargetProductId("");
    setConfirmedTarget(false);
    setFilter("all");
    setSearch("");
  };

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setFile(null);
      resetPreview();
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const changeMode = (nextMode: TechnicalImportMode) => {
    setMode(nextMode);
    resetPreview();
  };

  const selectFile = (selected?: File) => {
    if (!selected) return;
    const extension = selected.name.split(".").pop()?.toLocaleLowerCase("tr-TR");
    if (extension !== "xlsx" && extension !== "csv") {
      toast.error("Yalnızca XLSX veya CSV dosyası seçin");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      toast.error("Dosya boyutu 10 MB sınırını aşıyor");
      return;
    }
    setFile(selected);
    resetPreview();
  };

  const createPreview = async () => {
    if (!file) return toast.error("Önce bir Excel veya CSV dosyası seçin");
    setLoading(true);
    try {
      const result = await adminService.previewTechnicalImport({
        fileName: file.name,
        mimeType: file.type || undefined,
        fileBase64: await fileToBase64(file),
        mode,
        productTypeCode,
        divisionId: divisionId ?? null,
        availableFields,
      });
      setPreview(result);
      setRows(result.rows);
      const bestSuggestion = result.suggestedProducts[0];
      if (mode === "machine_data" && bestSuggestion?.score >= 0.55) setTargetProductId(bestSuggestion.id);
      toast.success("Dosya incelendi", {
        description: `${result.summary.ready} satır hazır, ${result.summary.review + result.summary.unmatched} satır inceleme bekliyor.`,
      });
    } catch (error: any) {
      resetPreview();
      toast.error("Dosya incelenemedi", { description: error?.message ?? "Teknik veri önizlemesi oluşturulamadı." });
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (rowNumber: number, sheetName: string, patch: Partial<TechnicalImportRowInput>) => {
    setRows((current) =>
      current.map((row) => (row.rowNumber === rowNumber && row.sheetName === sheetName ? { ...row, ...patch } : row))
    );
  };

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((row) => {
      if (filter === "review" && row.matchStatus !== "review") return false;
      if (filter === "unmatched" && row.matchStatus !== "unmatched") return false;
      if (!normalizedSearch) return true;
      return [row.section, row.sourceKey, row.sourceValue, row.targetKey]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(normalizedSearch);
    });
  }, [filter, rows, search]);

  const displayRows = useMemo(() => groupedRows(filteredRows), [filteredRows]);
  const readyRows = rows.filter((row) => row.include && row.targetKey);
  const needsReview = rows.filter((row) => row.matchStatus === "review").length;
  const unmatched = rows.filter((row) => row.matchStatus === "unmatched").length;

  const allMachines = useMemo(() => {
    const merged = new Map<string, MachineOption>();
    machines.forEach((machine) => merged.set(machine.id, machine));
    preview?.suggestedProducts.forEach((machine) => merged.set(machine.id, machine));
    return [...merged.values()].sort((a, b) => a.label.localeCompare(b.label, "tr-TR", { numeric: true }));
  }, [machines, preview]);

  const commit = async () => {
    if (!preview) return;
    if (mode === "machine_data" && (!targetProductId || !confirmedTarget)) {
      toast.error("Hedef makineyi seçip onaylayın");
      return;
    }
    if (!readyRows.length) return toast.error("İçe aktarılacak eşleşmiş satır bulunamadı");
    setCommitting(true);
    try {
      const result = await adminService.commitTechnicalImport({
        mode,
        productTypeCode,
        divisionId: divisionId ?? null,
        targetProductId: mode === "machine_data" ? targetProductId : null,
        confirmedTarget: mode === "machine_data" ? confirmedTarget : false,
        rows,
      });
      await onImported(mode);
      toast.success(`${result.imported} teknik satır içe aktarıldı`, {
        description: `${result.created} yeni alan, ${result.updated} güncellenen alan.`,
      });
      close(false);
    } catch (error: any) {
      toast.error("İçe aktarma tamamlanamadı", { description: error?.message ?? "Sunucu isteği başarısız oldu." });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex h-[min(92vh,920px)] w-[min(96vw,1560px)] max-w-none flex-col gap-0 overflow-hidden border-slate-300 p-0">
        <DialogHeader className="border-b border-slate-200 bg-[#071c54] px-5 py-3 text-white">
          <div className="flex items-center gap-3">
            <span className="font-display text-xl font-bold tracking-wide">HAKSAN</span>
            <span className="h-5 w-px bg-white/30" />
            <DialogTitle className="text-base font-medium text-white">Excel / CSV İçe Aktar</DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Teknik bilgi satırlarını eşleştirip hedef şablona veya makineye aktarın.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 border-b border-slate-200 bg-white px-6">
          {["Dosya", "Eşleştirme", "Önizleme", "Onay"].map((label, index) => {
            const activeIndex = preview ? 2 : file ? 1 : 0;
            const active = index === activeIndex;
            const complete = index < activeIndex;
            return (
              <div key={label} className={cn("relative flex h-14 items-center justify-center gap-2 text-xs", active ? "font-semibold text-blue-700" : "text-slate-500")}>
                <span className={cn("flex size-6 items-center justify-center rounded-full text-[11px]", active ? "bg-blue-600 text-white" : complete ? "bg-emerald-100 text-emerald-700" : "bg-slate-100")}>{complete ? <Check className="size-3.5" /> : index + 1}</span>
                {label}
                {active && <span className="absolute inset-x-6 bottom-0 h-0.5 bg-blue-600" />}
              </div>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f8fafc]">
          <div className="border-b border-slate-200 bg-white px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => changeMode("template_fields")} className={cn("h-9 rounded-md border px-4 text-xs font-medium", mode === "template_fields" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700")}>Şablon alanları</button>
                <button type="button" onClick={() => changeMode("machine_data")} className={cn("h-9 rounded-md border px-4 text-xs font-medium", mode === "machine_data" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700")}>Makine verileri</button>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                {hierarchyLabel.split("›").map((item, index) => (
                  <span key={`${item}-${index}`} className="inline-flex items-center gap-1.5">
                    {index > 0 && <ArrowRight className="size-3" />}
                    <span className="rounded bg-slate-100 px-2 py-1">{item.trim()}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(300px,1fr)_minmax(420px,1.35fr)]">
              <div className="flex min-h-[86px] items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-4">
                <span className="flex size-10 items-center justify-center rounded bg-emerald-600 text-white"><FileSpreadsheet className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{file?.name ?? "Excel veya CSV dosyası seçin"}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{file ? `${(file.size / 1024).toFixed(0)} KB` : "XLSX / CSV · en fazla 10 MB"}{preview ? ` · ${preview.file.sheetNames.length} çalışma sayfası · ${preview.file.rowCount} teknik satır` : ""}</p>
                </div>
                <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv" className="hidden" onChange={(event) => selectFile(event.target.files?.[0])} />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="mr-1.5 size-4" />{file ? "Değiştir" : "Dosya seç"}</Button>
                <Button size="sm" disabled={!file || loading} onClick={createPreview}>{loading ? <RefreshCw className="mr-1.5 size-4 animate-spin" /> : <Search className="mr-1.5 size-4" />}İncele</Button>
              </div>

              {mode === "machine_data" ? (
                <div className="rounded-md border border-slate-300 bg-white px-4 py-2.5">
                  <label className="text-xs font-semibold text-slate-800">Bu çalışma sayfası hangi makineye ait?</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="relative flex-1">
                      <select value={targetProductId} onChange={(event) => { setTargetProductId(event.target.value); setConfirmedTarget(false); }} className="h-9 w-full appearance-none rounded-md border border-slate-300 bg-white px-3 pr-9 text-xs outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100">
                        <option value="">Hedef makineyi seçin</option>
                        {allMachines.map((machine) => <option key={machine.id} value={machine.id}>{machine.label}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                    </div>
                    {targetProductId && <Badge className="border-blue-200 bg-blue-50 text-blue-700" variant="outline">Kullanıcı seçimi gerekli</Badge>}
                  </div>
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                    <Checkbox checked={confirmedTarget} onCheckedChange={(checked) => setConfirmedTarget(Boolean(checked))} disabled={!targetProductId} />
                    Seçilen makine hedefini onaylıyorum
                  </label>
                </div>
              ) : (
                <div className="flex items-center rounded-md border border-blue-200 bg-blue-50 px-4 text-xs text-blue-900">
                  Dosyadaki alanlar <strong className="mx-1">{productTypeLabel}</strong> şablonuna başlangıç değeri olarak yazılacak.
                </div>
              )}
            </div>
          </div>

          {!preview ? (
            <div className="grid flex-1 place-items-center p-8">
              <div className="max-w-lg text-center">
                <span className="mx-auto flex size-14 items-center justify-center rounded-xl border border-dashed border-blue-300 bg-blue-50 text-blue-700"><Upload className="size-6" /></span>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">Teknik föyü çalışma sayfasına dönüştürün</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">Bölüm, teknik bilgi, değer ve birim kolonlarını otomatik tanır. Hiçbir veri önizleme ve kullanıcı onayı olmadan kaydedilmez.</p>
                <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4 text-left">
                  <p className="text-xs font-semibold text-slate-800">Elinizde uygun dosya yok mu?</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    <strong>{productTypeLabel}</strong> alanlarıyla hazırlanmış şablonu indirin, Değer kolonunu doldurup geri yükleyin.
                    CSV'yi Excel'de açıp kaydederseniz noktalı virgül ayracı ve Türkçe karakterler korunur.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={downloading} onClick={() => void downloadTemplate("xlsx")}>
                      {downloading ? <RefreshCw className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}XLSX şablonu
                    </Button>
                    <Button variant="outline" size="sm" disabled={downloading} onClick={() => void downloadTemplate("csv")}>
                      <Download className="mr-1.5 size-4" />CSV şablonu
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200 bg-white px-5 py-2.5">
                <div className="grid gap-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_190px]">
                  {rows.slice(0, 3).map((row) => {
                    const meta = STATUS_META[row.matchStatus];
                    return (
                      <div key={`${row.sheetName}-${row.rowNumber}`} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded border border-slate-200 px-3 py-2 text-[11px]">
                        <span className="truncate text-slate-600">{row.sourceKey}</span><ArrowRight className="size-3 text-slate-400" /><span className="truncate font-medium text-slate-800">{row.targetKey || "Eşleşme seçin"}</span>
                        <span className={cn("col-span-3 flex items-center gap-1.5", meta.className)}><span className={cn("size-1.5 rounded-full", meta.dot)} />{meta.label}</span>
                      </div>
                    );
                  })}
                  <div className="rounded border border-slate-200 px-3 py-2 text-[11px] leading-5">
                    <div><span className="font-semibold text-emerald-600">{preview.summary.exact}</span> tam eşleşti</div>
                    <div><span className="font-semibold text-blue-600">{preview.summary.normalized}</span> isimle eşleşti</div>
                    <div><span className="font-semibold text-amber-600">{needsReview}</span> onay bekliyor</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-5 py-2">
                <div className="relative w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Alan veya değerde ara" className="h-8 border-slate-300 pl-9 text-xs" />
                </div>
                {(["all", "review", "unmatched"] as const).map((item) => {
                  const label = item === "all" ? `Tümü ${rows.length}` : item === "review" ? `İnceleme gerekli ${needsReview}` : `Eşleşmeyenler ${unmatched}`;
                  return <button key={item} type="button" onClick={() => setFilter(item)} className={cn("h-8 rounded border px-3 text-[11px]", filter === item ? "border-blue-500 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600")}>{label}</button>;
                })}
              </div>

              <div className="min-h-0 flex-1 overflow-auto bg-white">
                <table className="w-full min-w-[1120px] border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 shadow-[0_1px_0_#cbd5e1]">
                    <tr className="h-6 border-b border-slate-300 text-[10px]"><th className="w-12 border-r border-slate-300">#</th>{["A", "B", "C", "D", "E", "F"].map((letter) => <th key={letter} className="border-r border-slate-300 font-medium">{letter}</th>)}</tr>
                    <tr className="h-8"><th className="border-r border-slate-300">#</th><th className="w-28 border-r border-slate-300">Bölüm</th><th className="border-r border-slate-300">Dosyadaki Alan</th><th className="border-r border-slate-300">Sistem Alanı</th><th className="border-r border-slate-300">Dosyadan Gelen Değer</th><th className="w-28 border-r border-slate-300">Birim</th><th className="w-44">Sonuç</th></tr>
                  </thead>
                  <tbody>
                    {displayRows.map(({ row, rowSpan }, index) => {
                      const meta = STATUS_META[row.matchStatus];
                      return (
                        <tr key={`${row.sheetName}-${row.rowNumber}`} className={cn("h-8 border-b border-dotted border-slate-300", !row.include && "bg-slate-50 text-slate-400")}>
                          <td className="border-r border-slate-200 text-center tabular-nums text-slate-500">{index + 1}</td>
                          {rowSpan > 0 && <td rowSpan={rowSpan} className="border-r border-slate-300 bg-slate-50 p-0 text-center"><span className="inline-block -rotate-90 whitespace-nowrap font-display text-sm font-semibold tracking-wider text-slate-700">{row.section}</span></td>}
                          <td className="border-r border-slate-200 px-3">{row.sourceKey}</td>
                          <td className="border-r border-slate-200 p-0">
                            <select value={row.targetKey} onChange={(event) => { const field = availableFields.find((item) => item.key === event.target.value); updateRow(row.rowNumber, row.sheetName, { targetKey: event.target.value, targetGroupCode: field?.groupCode ?? "GENEL", targetUnit: field?.unit ?? row.sourceUnit, matchStatus: event.target.value ? "review" : "unmatched", include: Boolean(event.target.value) }); }} className="h-8 w-full border-0 bg-transparent px-3 text-xs outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500">
                              <option value="">Eşleşme seçin</option>
                              {availableFields.map((field) => <option key={field.key} value={field.key}>{field.key}</option>)}
                            </select>
                          </td>
                          <td className="border-r border-slate-200 p-0"><input value={row.sourceValue} onChange={(event) => updateRow(row.rowNumber, row.sheetName, { sourceValue: event.target.value })} className={cn("h-8 w-full border-0 bg-transparent px-3 outline-none focus:ring-2 focus:ring-inset", row.matchStatus === "review" ? "bg-amber-50 focus:ring-amber-500" : "focus:ring-blue-500")} /></td>
                          <td className="border-r border-slate-200 p-0"><input value={row.targetUnit || row.sourceUnit} onChange={(event) => updateRow(row.rowNumber, row.sheetName, { targetUnit: event.target.value })} className="h-8 w-full border-0 bg-transparent px-3 outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500" /></td>
                          <td className="px-3">
                            <label className={cn("flex cursor-pointer items-center gap-2", meta.className)}><Checkbox checked={row.include} onCheckedChange={(checked) => updateRow(row.rowNumber, row.sheetName, { include: Boolean(checked) })} /><span className={cn("size-1.5 rounded-full", meta.dot)} />{meta.label}</label>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-300 bg-white px-5 py-3">
          <div className="flex items-center gap-4 text-xs">
            <span>{rows.length} satır</span><span className="text-emerald-700">{readyRows.length} hazır</span>{needsReview > 0 && <span className="text-amber-700">{needsReview} inceleme gerekiyor</span>}
            {unmatched > 0 && <span className="flex items-center gap-1 text-slate-500"><AlertTriangle className="size-3.5" /> Eşleşmeyen satırlar içe aktarılmayacak.</span>}
          </div>
          <div className="flex items-center gap-2">
            {file && <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={loading || committing}><RefreshCw className="mr-1.5 size-4" />Dosyayı değiştir</Button>}
            <Button variant="outline" onClick={() => close(false)}>Vazgeç</Button>
            <Button onClick={commit} disabled={!preview || !readyRows.length || committing || (mode === "machine_data" && (!targetProductId || !confirmedTarget))} className="min-w-44 bg-blue-600 hover:bg-blue-700">
              {committing ? <RefreshCw className="mr-1.5 size-4 animate-spin" /> : readyRows.length ? <CheckCircle2 className="mr-1.5 size-4" /> : <XCircle className="mr-1.5 size-4" />}{readyRows.length} satırı içe aktar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
