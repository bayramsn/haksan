import { useRef, useState } from "react";
import type { CompanyContactImportPreview } from "@haksan/shared";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { companyService } from "../../../lib/services";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

function validateFile(file?: File) {
  if (!file) return null;
  if (!file.name.toLocaleLowerCase("tr-TR").endsWith(".xlsx")) {
    toast.error("Yalnızca XLSX dosyası seçebilirsiniz");
    return null;
  }
  if (file.size > MAX_FILE_SIZE) {
    toast.error("Dosya boyutu 10 MB sınırını aşıyor");
    return null;
  }
  return file;
}

export function CompanyContactImportDialog({
  divisionId,
  onImported,
}: {
  divisionId?: string | null;
  onImported: () => Promise<void> | void;
}) {
  const companyInputRef = useRef<HTMLInputElement | null>(null);
  const contactInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [companiesFile, setCompaniesFile] = useState<File | null>(null);
  const [contactsFile, setContactsFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CompanyContactImportPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);

  const reset = () => {
    setCompaniesFile(null);
    setContactsFile(null);
    setPreview(null);
    setConfirmed(false);
    if (companyInputRef.current) companyInputRef.current.value = "";
    if (contactInputRef.current) contactInputRef.current.value = "";
  };

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen && !committing) reset();
  };

  const buildPayload = async () => {
    if (!companiesFile || !contactsFile) throw new Error("Firma ve kontak XLSX dosyalarının ikisini de seçin.");
    return {
      companiesFile: {
        fileName: companiesFile.name,
        mimeType: companiesFile.type || undefined,
        fileBase64: await fileToBase64(companiesFile),
      },
      contactsFile: {
        fileName: contactsFile.name,
        mimeType: contactsFile.type || undefined,
        fileBase64: await fileToBase64(contactsFile),
      },
      divisionId: divisionId && divisionId !== "all" ? divisionId : null,
    };
  };

  const createPreview = async () => {
    setLoading(true);
    try {
      const result = await companyService.previewCompanyContactImport(await buildPayload());
      setPreview(result);
      setConfirmed(false);
      toast.success("Excel dosyaları incelendi", {
        description: `${result.summary.companyRows} firma, ${result.summary.contactRows} kontak satırı bulundu.`,
      });
    } catch (error: any) {
      setPreview(null);
      toast.error("Dosyalar incelenemedi", { description: error?.message ?? "Önizleme oluşturulamadı." });
    } finally {
      setLoading(false);
    }
  };

  const commit = async () => {
    if (!preview || !confirmed) return;
    setCommitting(true);
    try {
      const result = await companyService.commitCompanyContactImport({ ...(await buildPayload()), confirmed: true });
      await onImported();
      toast.success("Firma ve kontak aktarımı tamamlandı", {
        description: `${result.companies.created} firma ve ${result.contacts.created} kontak oluşturuldu; ${result.companies.updated + result.contacts.updated} kayıt güncellendi.`,
      });
      setOpen(false);
      reset();
    } catch (error: any) {
      toast.error("İçe aktarma tamamlanamadı", { description: error?.message ?? "Sunucu isteği başarısız oldu." });
    } finally {
      setCommitting(false);
    }
  };

  const summary = preview?.summary;

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9 gap-2">
          <FileSpreadsheet className="size-4" /> Excel İçe Aktar
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border/70 bg-[linear-gradient(135deg,#07142b,#102652)] px-6 py-5 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileSpreadsheet className="size-5 text-sky-300" /> Firma ve kontak içe aktarımı
          </DialogTitle>
          <DialogDescription className="text-slate-300">
            Firma NO ile kontakları doğru firmaya bağlar; var olan kayıtları boş alanlarla silmeden günceller.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-border/70 p-4">
              <Label htmlFor="company-import-file">Firma Listesi (.xlsx)</Label>
              <Input
                ref={companyInputRef}
                id="company-import-file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => {
                  setCompaniesFile(validateFile(event.target.files?.[0]));
                  setPreview(null);
                  setConfirmed(false);
                }}
              />
              <p className="text-xs text-muted-foreground">NO sütunu kalıcı firma numarası olarak kullanılır.</p>
            </div>
            <div className="space-y-2 rounded-lg border border-border/70 p-4">
              <Label htmlFor="contact-import-file">Kontak Listesi (.xlsx)</Label>
              <Input
                ref={contactInputRef}
                id="contact-import-file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => {
                  setContactsFile(validateFile(event.target.files?.[0]));
                  setPreview(null);
                  setConfirmed(false);
                }}
              />
              <p className="text-xs text-muted-foreground">FIRMA NO sütunu firma listesindeki NO ile eşleştirilir.</p>
            </div>
          </div>

          {!preview && (
            <div className="flex justify-end">
              <Button type="button" onClick={createPreview} disabled={!companiesFile || !contactsFile || loading} className="gap-2">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {loading ? "İnceleniyor…" : "Önizleme Oluştur"}
              </Button>
            </div>
          )}

          {summary && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard label="Yeni Firma" value={summary.companyCreates} tone="success" />
                <SummaryCard label="Güncellenecek Firma" value={summary.companyUpdates} tone="info" />
                <SummaryCard label="Yeni Kontak" value={summary.contactCreates} tone="success" />
                <SummaryCard label="Güncellenecek Kontak" value={summary.contactUpdates} tone="info" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Atlanan firma: {summary.companySkipped}</Badge>
                <Badge variant="secondary">Atlanan kontak: {summary.contactSkipped}</Badge>
                <Badge variant="outline" className="border-amber-300 text-amber-700">Uyarı: {summary.warnings}</Badge>
                <Badge variant="outline" className="border-red-300 text-red-700">Hata: {summary.errors}</Badge>
              </div>

              {preview.issues.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-border/70">
                  <div className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Kontrol listesi
                  </div>
                  <div className="max-h-64 divide-y overflow-y-auto">
                    {preview.issues.map((issue, index) => (
                      <div key={`${issue.kind}-${issue.rowNumber}-${index}`} className="flex gap-3 px-4 py-2.5 text-sm">
                        {issue.severity === "error"
                          ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
                          : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />}
                        <div>
                          <div className="font-medium">{issue.kind === "company" ? "Firma" : "Kontak"} · Satır {issue.rowNumber}</div>
                          <div className="text-xs text-muted-foreground">
                            {[issue.sourceNo && `No: ${issue.sourceNo}`, issue.companyNo && `Firma No: ${issue.companyNo}`, issue.message].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <Checkbox checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} />
                <span className="text-sm">
                  <span className="block font-medium">Önizlemeyi kontrol ettim, aktarımı onaylıyorum.</span>
                  <span className="text-xs text-muted-foreground">Aynı Firma No ve Kontak No ile yeniden yüklenen kayıtlar güncellenir.</span>
                </span>
              </label>
            </>
          )}
        </div>

        <DialogFooter className="border-t border-border/70 bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => changeOpen(false)} disabled={committing}>Vazgeç</Button>
          {preview && (
            <>
              <Button type="button" variant="outline" onClick={createPreview} disabled={loading || committing}>Yeniden İncele</Button>
              <Button type="button" onClick={commit} disabled={!confirmed || committing} className="gap-2">
                {committing ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                {committing ? "Aktarılıyor…" : "İçe Aktar"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "success" | "info" }) {
  return (
    <div className={`rounded-lg border p-3 ${tone === "success" ? "border-emerald-200 bg-emerald-50" : "border-blue-200 bg-blue-50"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
