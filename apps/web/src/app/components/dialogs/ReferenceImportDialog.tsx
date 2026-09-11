import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { referenceService } from "../../../lib/services";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

const TEMPLATE_HEADERS = ["Firma", "İlgili", "İlçe", "İl", "Tezgah Markası", "Tezgah Modeli", "Teslim Tarihi", "Not"];
const TEMPLATE_ROW = ["Örnek Makina San. Ltd. Şti.", "Ahmet Yılmaz", "Nilüfer", "Bursa", "AORE", "PG3015", "11.09.2026", ""];

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

function downloadTemplate() {
  const lines = [TEMPLATE_HEADERS, TEMPLATE_ROW].map((row) => row.map(csvEscape).join(";"));
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "referans-sablonu.csv";
  a.click();
  URL.revokeObjectURL(url);
}

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

type ImportResult = Awaited<ReturnType<typeof referenceService.importFile>>;

/** Referansları Excel/CSV ile toplu yükler; başlıklar şablondaki gibi olmalı. */
export function ReferenceImportDialog({ open, onOpenChange, onImported }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => { setFile(null); setResult(null); if (inputRef.current) inputRef.current.value = ""; };

  const upload = async () => {
    if (!file) return toast.error("Önce bir .xlsx veya .csv dosyası seçin");
    setBusy(true);
    try {
      const summary = await referenceService.importFile({ fileName: file.name, fileBase64: await fileToBase64(file) });
      setResult(summary);
      if (summary.created) {
        toast.success(`${summary.created} referans yüklendi`, summary.skipped.length ? { description: `${summary.skipped.length} satır atlandı.` } : undefined);
        await onImported();
      } else {
        toast.error("Hiç referans yüklenmedi", { description: summary.skipped[0]?.reason });
      }
    } catch (error: unknown) {
      toast.error("Yükleme başarısız", { description: error instanceof Error ? error.message : "Dosya okunamadı." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Referansları Excel ile Yükle</DialogTitle>
          <DialogDescription>
            Sütunlar: {TEMPLATE_HEADERS.join(", ")}. Yalnızca "Firma" zorunludur; aynı firma/model/tarih tekrar yüklenmez.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={downloadTemplate}>
            <Download className="size-4" /> Şablonu indir (.csv)
          </Button>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border/80 bg-muted/30 p-4 hover:bg-muted/50">
            <FileSpreadsheet className="size-6 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{file ? file.name : "Dosya seç"}</div>
              <div className="text-xs text-muted-foreground">
                {file ? `${(file.size / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} KB` : ".xlsx veya .csv · en fazla 2.000 satır"}
              </div>
            </div>
            <input ref={inputRef} type="file" accept=".xlsx,.csv" className="sr-only" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setResult(null); }} />
          </label>

          {result && (
            <div className="rounded-lg border border-border/70 bg-white p-3 text-sm">
              <div><span className="font-semibold">{result.created}</span> referans yüklendi · başlık satırı {result.headerRow} ({result.sheetName})</div>
              {result.skipped.length > 0 && (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {result.skipped.map((item) => <li key={item.row}>Satır {item.row}: {item.reason}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Kapat</Button>
          <Button type="button" className="gap-1.5" disabled={!file || busy} onClick={() => void upload()}>
            <Upload className="size-4" /> {busy ? "Yükleniyor…" : "Yükle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
