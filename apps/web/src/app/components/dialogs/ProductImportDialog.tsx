import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Columns3, Download, FileCheck2, FileSpreadsheet, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { productService, type ProductImportPreview, type ProductImportRow, type ProductImportTemplateOption } from "../../../lib/services";
import { exportService } from "../../../lib/downloadExport";
import { useStore } from "../../lib/store";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";

const TEMPLATE_HEADERS = [
  "Marka",
  "Seri",
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
    "MT",
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

async function downloadTemplate(productTypeCode?: string) {
  try {
    await exportService.productImportTemplate(productTypeCode);
  } catch {
    const lines = [TEMPLATE_HEADERS, ...TEMPLATE_ROWS].map((row) => row.map(csvEscape).join(","));
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "urun-import-sablonu.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
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
  const [templateOptions, setTemplateOptions] = useState<ProductImportTemplateOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [categoryCode, setCategoryCode] = useState("");
  const [subcategoryCode, setSubcategoryCode] = useState("");
  const [productTypeCode, setProductTypeCode] = useState("");
  const [downloading, setDownloading] = useState(false);

  // Şablon yalnız ürünü olan tiplerden üretilebiliyor; listeyi sunucu veriyor.
  useEffect(() => {
    if (!open) return;
    setOptionsLoading(true);
    productService
      .importTemplateOptions()
      .then((rows) => setTemplateOptions(rows ?? []))
      .catch(() => setTemplateOptions([]))
      .finally(() => setOptionsLoading(false));
  }, [open]);

  const categories = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const option of templateOptions) byCode.set(option.categoryCode ?? "", option.categoryName);
    return [...byCode.entries()].map(([code, name]) => ({ code, name }));
  }, [templateOptions]);

  const subcategories = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const option of templateOptions) {
      if ((option.categoryCode ?? "") !== categoryCode) continue;
      byCode.set(option.subcategoryCode ?? "", option.subcategoryName);
    }
    return [...byCode.entries()].map(([code, name]) => ({ code, name }));
  }, [categoryCode, templateOptions]);

  const productTypes = useMemo(
    () => templateOptions.filter(
      (option) => (option.categoryCode ?? "") === categoryCode && (option.subcategoryCode ?? "") === subcategoryCode,
    ),
    [categoryCode, subcategoryCode, templateOptions],
  );

  const runTemplateDownload = async () => {
    setDownloading(true);
    try {
      await downloadTemplate(productTypeCode || undefined);
      toast.success(productTypeCode ? "Şablon indirildi" : "Genel şablon indirildi", {
        description: productTypeCode
          ? "Örnek satır, seçilen tipteki mevcut bir üründen dolduruldu."
          : "Ürün tipi seçerseniz şablon o tipin teknik kolonlarıyla gelir.",
      });
    } catch (error: any) {
      toast.error("Şablon indirilemedi", { description: error?.message ?? "Bu tipte kayıtlı ürün olmayabilir." });
    } finally {
      setDownloading(false);
    }
  };

  const validRows = useMemo(
    () => preview?.rows.filter((row) => row.status !== "error" && row.status !== "skip") ?? [],
    [preview]
  );

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCategoryCode("");
    setSubcategoryCode("");
    setProductTypeCode("");
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
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              [FileSpreadsheet, "Dosya gereksinimi", "XLSX veya CSV · İlk satır kolon başlığı"],
              [Columns3, "Otomatik eşleme", "Şablon başlıkları güvenli alanlarla eşleşir"],
              [ShieldCheck, "Önce önizleme", "Onay vermeden hiçbir kayıt yazılmaz"],
            ].map(([Icon, title, text]) => (
              <div key={String(title)} className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>
                <span className="min-w-0"><span className="block text-xs font-semibold">{String(title)}</span><span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{String(text)}</span></span>
              </div>
            ))}
          </div>
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div>
              <p className="text-xs font-semibold">Şablonu ürün tipine göre indirin</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                Seçtiğiniz tipte kayıtlı bir üründen — markası, modeli, fiyatları, GTİP'i, teknik özellikleri ve
                standart donanımıyla — doldurulmuş örnek satır “Örnek Kayıt” sayfasında gelir. Yeni ürünleri
                “Ürünler” sayfasına ona bakarak yazın. Listede yalnız daha önce ürün eklenmiş tipler görünür.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-[11px]">Ürün Kategorisi</Label>
                <Select
                  value={categoryCode}
                  onValueChange={(value) => { setCategoryCode(value); setSubcategoryCode(""); setProductTypeCode(""); }}
                  disabled={optionsLoading || categories.length === 0}
                >
                  <SelectTrigger size="sm"><SelectValue placeholder={optionsLoading ? "Yükleniyor…" : "Kategori seçin"} /></SelectTrigger>
                  <SelectContent>
                    {categories.map((item) => <SelectItem key={item.code || "none"} value={item.code}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Ürün Alt Kategorisi</Label>
                <Select
                  value={subcategoryCode}
                  onValueChange={(value) => { setSubcategoryCode(value); setProductTypeCode(""); }}
                  disabled={!categoryCode || subcategories.length === 0}
                >
                  <SelectTrigger size="sm"><SelectValue placeholder="Alt kategori seçin" /></SelectTrigger>
                  <SelectContent>
                    {subcategories.map((item) => <SelectItem key={item.code || "none"} value={item.code}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Ürün Tipi</Label>
                <Select value={productTypeCode} onValueChange={setProductTypeCode} disabled={!subcategoryCode || productTypes.length === 0}>
                  <SelectTrigger size="sm"><SelectValue placeholder="Tip seçin" /></SelectTrigger>
                  <SelectContent>
                    {productTypes.map((item) => (
                      <SelectItem key={item.productTypeCode} value={item.productTypeCode}>
                        {item.productTypeName} ({item.productCount})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {!optionsLoading && templateOptions.length === 0 && (
              <p className="text-[11px] text-amber-700">
                Henüz hiçbir ürün tipinde kayıtlı ürün yok. Şablon örnek satırı mevcut üründen üretildiği için önce
                tek ürün ekleyin; o zamana kadar genel şablonu indirebilirsiniz.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm tracking-tight">{file?.name ?? "Dosya seçilmedi"}</div>
              <div className="text-xs text-muted-foreground">{file ? `${(file.size / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} KB · ${file.name.split(".").pop()?.toLocaleUpperCase("tr-TR")}` : ".xlsx veya .csv"}</div>
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
              <Button type="button" variant="outline" size="sm" className="gap-1" disabled={downloading} onClick={() => void runTemplateDownload()}>
                <Download className="size-4" /> {productTypeCode ? "Seçili tip için şablon" : "Şablon"}
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
              <div className="flex flex-col gap-3 rounded-lg border border-primary/15 bg-primary/[0.035] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2.5">
                  <FileCheck2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div><p className="text-xs font-semibold">Kolon eşlemesi tamamlandı</p><p className="mt-0.5 text-[11px] text-muted-foreground">Dosya şablonu ürün kimliği, fiyat ve teknik alanlarla eşleştirildi.</p></div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {["Marka", "Model", "Ürün", "Fiyat", "Teknik"].map((label) => <Badge key={label} variant="outline" className="bg-white text-[10px]">{label}</Badge>)}
                </div>
              </div>
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
