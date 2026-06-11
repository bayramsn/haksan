import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, FileText, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import { useStore } from "../../lib/store";
import type { DocumentItem } from "../../lib/mock";
import { fileService } from "../../../lib/services";

type DocumentTypeValue = DocumentItem["type"];

const DOCUMENT_TYPE_OPTIONS: Array<{
  value: DocumentTypeValue;
  label: string;
  bucket:
    | "erp-quote-documents"
    | "erp-proforma-documents"
    | "erp-contract-documents"
    | "erp-invoice-documents"
    | "erp-service-documents";
  documentTypeCode:
    | "quote_pdf"
    | "proforma_pdf"
    | "contract_pdf"
    | "commercial_invoice_pdf"
    | "service_document"
    | "other";
}> = [
  { value: "Proforma", label: "Proforma", bucket: "erp-proforma-documents", documentTypeCode: "proforma_pdf" },
  { value: "Contract", label: "Sözleşme", bucket: "erp-contract-documents", documentTypeCode: "contract_pdf" },
  { value: "CommercialInvoice", label: "Ticari fatura", bucket: "erp-invoice-documents", documentTypeCode: "commercial_invoice_pdf" },
  { value: "AccountingInvoice", label: "Muhasebe faturası", bucket: "erp-invoice-documents", documentTypeCode: "commercial_invoice_pdf" },
  { value: "DeliveryForm", label: "Teslim formu", bucket: "erp-service-documents", documentTypeCode: "service_document" },
  { value: "InstallationForm", label: "Kurulum formu", bucket: "erp-service-documents", documentTypeCode: "service_document" },
  { value: "Other", label: "Diğer", bucket: "erp-quote-documents", documentTypeCode: "other" },
];

const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const ALLOWED_EXTENSIONS = Object.keys(EXT_TO_MIME);
const ACCEPT = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",");

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const extensionFromName = (name: string) => name.split(".").pop()?.toLocaleLowerCase("tr-TR") ?? "";

export function DocumentUploadDialog({
  trigger,
  defaultSalesCaseId,
  defaultCompanyId,
  onUploaded,
}: {
  trigger: React.ReactNode;
  defaultSalesCaseId?: string;
  defaultCompanyId?: string;
  onUploaded?: (document: DocumentItem) => void;
}) {
  const { cases, customers, addDocument } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const initialScope = defaultSalesCaseId ? "case" : defaultCompanyId ? "company" : "case";
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"case" | "company">(initialScope);
  const [type, setType] = useState<DocumentTypeValue>("Other");
  const [selectedCaseId, setSelectedCaseId] = useState(defaultSalesCaseId ?? "");
  const [selectedCompanyId, setSelectedCompanyId] = useState(defaultCompanyId ?? "");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScope(initialScope);
    setType("Other");
    setSelectedCaseId(defaultSalesCaseId ?? "");
    setSelectedCompanyId(defaultCompanyId ?? "");
    setDescription("");
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [defaultCompanyId, defaultSalesCaseId, initialScope, open]);

  const selectedCase = useMemo(
    () => cases.find((item) => item.id === selectedCaseId),
    [cases, selectedCaseId]
  );
  const entityType = scope === "case" ? "opportunity" : "company";
  const entityId = scope === "case" ? selectedCaseId : selectedCompanyId;
  const companyId = scope === "case" ? selectedCase?.customerId ?? defaultCompanyId : selectedCompanyId;
  const selectedCompany = customers.find((c) => c.id === companyId);
  const meta = DOCUMENT_TYPE_OPTIONS.find((item) => item.value === type) ?? DOCUMENT_TYPE_OPTIONS[DOCUMENT_TYPE_OPTIONS.length - 1];
  const lockedRelation = Boolean(defaultSalesCaseId || defaultCompanyId);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      toast.error("Dosya seçin");
      return;
    }
    if (!entityId) {
      toast.error("Bağlantı seçin", { description: "Dokümanı bir satış kartına veya firmaya bağlayın." });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Dosya boyutu 25 MB'ı aşamaz");
      return;
    }
    const extension = extensionFromName(file.name);
    const mimeType = file.type || EXT_TO_MIME[extension];
    if (!ALLOWED_EXTENSIONS.includes(extension) || !mimeType || !Object.values(EXT_TO_MIME).includes(mimeType)) {
      toast.error("Desteklenmeyen dosya tipi", { description: "PDF, DOCX, XLSX, PNG, JPG veya WEBP yükleyebilirsiniz." });
      return;
    }

    setUploading(true);
    try {
      const upload = await fileService.signedUpload({
        bucket: meta.bucket,
        entityType,
        entityId,
        filename: file.name,
        mimeType,
        extension,
        sizeBytes: file.size,
      });
      const res = await fetch(upload.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": mimeType },
      });
      if (!res.ok) throw new Error(`Depoya yükleme başarısız (${res.status})`);

      await fileService.link({
        fileId: upload.fileId,
        entityType,
        entityId,
        documentTypeCode: meta.documentTypeCode,
        description: description.trim() || undefined,
      });

      const row = await addDocument({
        id: upload.fileId,
        fileId: upload.fileId,
        salesCaseId: scope === "case" ? selectedCaseId : "",
        companyId,
        type,
        fileName: file.name,
        size: formatFileSize(file.size),
        mimeType,
      });
      toast.success("Doküman yüklendi", { description: file.name });
      onUploaded?.(row);
      setOpen(false);
    } catch (err: any) {
      toast.error("Doküman yüklenemedi", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[min(620px,calc(100vw-2rem))] max-w-none sm:max-w-none max-h-[90dvh] overflow-hidden p-0 gap-0">
        <DialogHeader className="border-b border-border/60 px-5 pt-5 pb-4 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-5 text-primary" />
            Doküman Yükle
          </DialogTitle>
          <DialogDescription>Dosyayı satış kartına veya firmaya bağlayın.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <div className="max-h-[calc(90dvh-150px)] overflow-y-auto px-5 py-4 space-y-4">
            {!lockedRelation && (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={scope === "case" ? "default" : "outline"} onClick={() => setScope("case")}>
                  Satış kartı
                </Button>
                <Button type="button" variant={scope === "company" ? "default" : "outline"} onClick={() => setScope("company")}>
                  Firma
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Doküman Tipi</Label>
                <Select value={type} onValueChange={(value) => setType(value as DocumentTypeValue)}>
                  <SelectTrigger className="mt-1 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPE_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{scope === "case" ? "Satış Kartı" : "Firma"}</Label>
                {scope === "case" ? (
                  <Select value={selectedCaseId || undefined} onValueChange={setSelectedCaseId} disabled={Boolean(defaultSalesCaseId)}>
                    <SelectTrigger className="mt-1 bg-white">
                      <SelectValue placeholder="Satış kartı seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {cases.map((item) => {
                        const customer = customers.find((c) => c.id === item.customerId);
                        return (
                          <SelectItem key={item.id} value={item.id}>
                            {(customer?.name ?? "Firma") + " · " + item.requestedModel}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={selectedCompanyId || undefined} onValueChange={setSelectedCompanyId} disabled={Boolean(defaultCompanyId)}>
                    <SelectTrigger className="mt-1 bg-white">
                      <SelectValue placeholder="Firma seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <button
              type="button"
              className="w-full rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-5 text-left transition hover:bg-muted/40"
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                  <FileText className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium break-words">{file?.name ?? "Dosya seç"}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {file ? `${formatFileSize(file.size)} · ${file.type || extensionFromName(file.name).toLocaleUpperCase("tr-TR")}` : "PDF, DOCX, XLSX, PNG, JPG, WEBP"}
                  </div>
                </div>
              </div>
            </button>

            <div>
              <Label>Açıklama</Label>
              <Textarea
                className="mt-1 min-h-20 resize-none"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="İsteğe bağlı not"
              />
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <LinkIcon className="size-4 shrink-0" />
              <span className="min-w-0 break-words">
                {entityId ? `${scope === "case" ? "Satış kartı" : "Firma"} bağlantısı: ${selectedCompany?.name ?? entityId}` : "Henüz bağlantı seçilmedi."}
              </span>
            </div>
          </div>

          <DialogFooter className="border-t border-border/60 bg-muted/20 px-5 py-4 gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={uploading}>İptal</Button>
            <Button type="submit" className="gap-1" disabled={uploading}>
              <Upload className="size-4" />
              {uploading ? "Yükleniyor..." : "Yükle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
