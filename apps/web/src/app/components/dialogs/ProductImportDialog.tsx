import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { productService, type ProductImportPreview, type ProductImportRow } from "../../../lib/services";
import { useStore } from "../../lib/store";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";

const TEMPLATE_HEADERS = [
  "Marka",
  "Model",
  "Ürün Adı",
  "Ürün Tipi",
  "Para Birimi",
  "Liste Fiyatı",
  "KDV",
  "Menşei",
  "GTIP",
  "Stok Kodu",
  "Açıklama",
  "Kontrol Ünitesi",
  "Standart Donanım",
  "Opsiyonel Donanım",
  "Ayna Ölçüsü",
  "Fener Mili Devri",
];

const TEMPLATE_ROWS = [
  [
    "Ecoca",
    "MT-208/500",
    "Ecoca MT-208/500 CNC Torna Tezgahı",
    "CNC Torna Tezgahı",
    "USD",
    "68300",
    "20",
    "Tayvan",
    "845811",
    "ECOCA-MT208",
    "8 inç aynalı CNC torna",
    "FANUC 0i-TF Plus",
    "Hidrolik 10 İstasyon Taret; Talaş konveyörü",
    "Takım ölçme kolu; Çubuk sürücü",
    "8\"",
    "4800 dv/dk",
  ],
];

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadTemplate() {
  const lines = [TEMPLATE_HEADERS, ...TEMPLATE_ROWS].map((row) => row.map(csvEscape).join(","));
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "urun-import-sablonu.csv";
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

function statusLabel(row: ProductImportRow) {
  if (row.status === "create") return { label: "Yeni", tone: "default" as const };
  if (row.status === "update") return { label: "Güncelle", tone: "secondary" as const };
  if (row.status === "skip") return { label: "Atla", tone: "outline" as const };
  return { label: "Hata", tone: "destructive" as const };
}

export function ProductImportDialog({ trigger }: { trigger: React.ReactNode }) {
  const { refresh } = useStore();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ProductImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);

  const validRows = useMemo(
    () => preview?.rows.filter((row) => row.status !== "error" && row.status !== "skip") ?? [],
    [preview]
  );

  const reset = () => {
    setFile(null);
    setPreview(null);
    setLoading(false);
    setCommitting(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleOpen = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const previewFile = async (selectedFile = file) => {
    if (!selectedFile) {
      toast.error("Dosya seçilmedi");
      return;
    }
    setLoading(true);
    try {
      const fileBase64 = await fileToBase64(selectedFile);
      const result = await productService.previewImport({ fileName: selectedFile.name, fileBase64 });
      setPreview(result);
      toast.success("Dosya okundu", {
        description: `${result.summary.create} yeni, ${result.summary.update} güncelleme, ${result.summary.error} hata`,
      });
    } catch (err: any) {
      setPreview(null);
      toast.error("Dosya okunamadı", { description: err?.message ?? "Import ön izlemesi oluşturulamadı." });
    } finally {
      setLoading(false);
    }
  };

  const commit = async () => {
    if (!preview || validRows.length === 0) return;
    setCommitting(true);
    try {
      const result = await productService.commitImport({ rows: validRows, mode: "upsert", replaceDetails: true });
      await refresh();
      toast.success("Ürünler aktarıldı", {
        description: `${result.summary.create} yeni, ${result.summary.update} güncellendi, ${result.summary.error} hata`,
      });
      handleOpen(false);
    } catch (err: any) {
      toast.error("Aktarım tamamlanamadı", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ürün İçe Aktar</DialogTitle>
          <DialogDescription>
            Excel veya CSV dosyasındaki ürünleri okuyup veritabanına yazmadan önce ön izleme oluşturur.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm tracking-tight">{file?.name ?? "Dosya seçilmedi"}</div>
              <div className="text-xs text-muted-foreground">.xlsx veya .csv</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                ref={fileRef}
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setFile(selected);
                  setPreview(null);
                  if (selected) void previewFile(selected);
                }}
              />
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={downloadTemplate}>
                <Download className="size-4" /> Şablon
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => fileRef.current?.click()}>
                <FileSpreadsheet className="size-4" /> Dosya Seç
              </Button>
              <Button type="button" size="sm" className="gap-1" disabled={!file || loading} onClick={() => previewFile()}>
                {loading ? <RefreshCw className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Oku
              </Button>
            </div>
          </div>

          {preview && (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                <Summary label="Satır" value={preview.summary.total} />
                <Summary label="Yeni" value={preview.summary.create} />
                <Summary label="Güncelleme" value={preview.summary.update} />
                <Summary label="Atlanan" value={preview.summary.skip} />
                <Summary label="Hata" value={preview.summary.error} tone={preview.summary.error ? "destructive" : "default"} />
              </div>

              {preview.summary.error > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  Hatalı satırlar aktarılmayacak. Gerekirse dosyayı düzeltip tekrar yükleyin.
                </div>
              )}

              <div className="rounded-lg border border-border/60 overflow-hidden">
                <div className="max-h-[420px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="w-16">Satır</TableHead>
                        <TableHead>Durum</TableHead>
                        <TableHead>Marka</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Ürün</TableHead>
                        <TableHead className="text-right">Fiyat</TableHead>
                        <TableHead>Not</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.map((row) => {
                        const status = statusLabel(row);
                        return (
                          <TableRow key={`${row.rowNumber}-${row.modelCode}`}>
                            <TableCell className="tabular-nums text-muted-foreground">{row.rowNumber}</TableCell>
                            <TableCell>
                              <Badge variant={status.tone}>{status.label}</Badge>
                            </TableCell>
                            <TableCell>{row.brandName}</TableCell>
                            <TableCell className="font-medium">{row.modelCode}</TableCell>
                            <TableCell className="max-w-[260px] truncate">{row.fullName}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.listPrice ? `${row.listPrice.toLocaleString()} ${row.currencyCode}` : "—"}
                            </TableCell>
                            <TableCell className="max-w-[320px]">
                              {row.errors.length ? (
                                <span className="text-xs text-destructive">{row.errors.join(", ")}</span>
                              ) : row.warnings.length ? (
                                <span className="text-xs text-amber-700">{row.warnings.join(", ")}</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                                  <CheckCircle2 className="size-3.5" /> Uygun
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpen(false)}>Kapat</Button>
          <Button type="button" disabled={!preview || validRows.length === 0 || committing} onClick={commit}>
            {committing ? "Aktarılıyor..." : `${validRows.length} Satırı Aktar`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Summary({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "destructive" }) {
  return (
    <div className={`rounded-lg border p-3 ${tone === "destructive" ? "border-destructive/30 bg-destructive/5" : "border-border/60 bg-white"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg tabular-nums tracking-tight">{value}</div>
    </div>
  );
}
