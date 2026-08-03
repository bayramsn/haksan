import { useEffect, useMemo, useRef, useState } from "react";
import { FileCheck2, Upload, FileText, Link as LinkIcon, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Label } from "../ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import { useStore } from "../../lib/store";
import type { DocumentItem } from "../../lib/mock";
import { documentService, fileService } from "../../../lib/services";

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
    | "external_quote"
    | "proforma_pdf"
    | "contract_pdf"
    | "commercial_invoice_pdf"
    | "accounting_invoice_pdf"
    | "service_document"
    | "delivery_form"
    | "installation_form"
    | "other";
}> = [
  { value: "ExternalQuote", label: "Dış teklif", bucket: "erp-quote-documents", documentTypeCode: "external_quote" },
  { value: "Proforma", label: "Proforma", bucket: "erp-proforma-documents", documentTypeCode: "proforma_pdf" },
  { value: "Contract", label: "Sözleşme", bucket: "erp-contract-documents", documentTypeCode: "contract_pdf" },
  { value: "CommercialInvoice", label: "Ticari fatura", bucket: "erp-invoice-documents", documentTypeCode: "commercial_invoice_pdf" },
  { value: "AccountingInvoice", label: "Muhasebe faturası", bucket: "erp-invoice-documents", documentTypeCode: "accounting_invoice_pdf" },
  { value: "DeliveryForm", label: "Teslim formu", bucket: "erp-service-documents", documentTypeCode: "delivery_form" },
  { value: "InstallationForm", label: "Kurulum formu", bucket: "erp-service-documents", documentTypeCode: "installation_form" },
  { value: "Other", label: "Diğer", bucket: "erp-quote-documents", documentTypeCode: "other" },
];

const EXT_TO_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
} as const;
type UploadExt = keyof typeof EXT_TO_MIME;

const ALLOWED_EXTENSIONS = Object.keys(EXT_TO_MIME);
const ACCEPT = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",");
const EXTERNAL_QUOTE_EXTENSIONS: UploadExt[] = ["pdf", "docx", "xlsx"];
const EXTERNAL_QUOTE_ACCEPT = EXTERNAL_QUOTE_EXTENSIONS.map((ext) => `.${ext}`).join(",");

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
  defaultType,
  open: controlledOpen,
  onOpenChange,
  onUploaded,
}: {
  trigger?: React.ReactNode;
  defaultSalesCaseId?: string;
  defaultCompanyId?: string;
  defaultType?: DocumentTypeValue;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onUploaded?: (document: DocumentItem) => void | Promise<void>;
}) {
  const { cases, customers, offers, addDocument, refresh } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const initialScope = defaultSalesCaseId ? "case" : "company";
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [scope, setScope] = useState<"case" | "company">(initialScope);
  const [type, setType] = useState<DocumentTypeValue>(defaultType ?? "Other");
  const [selectedCaseId, setSelectedCaseId] = useState(defaultSalesCaseId ?? "");
  const [selectedCompanyId, setSelectedCompanyId] = useState(defaultCompanyId ?? "");
  const [quoteId, setQuoteId] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScope(initialScope);
    setType(defaultType ?? "Other");
    setSelectedCaseId(defaultSalesCaseId ?? "");
    setSelectedCompanyId(defaultCompanyId ?? "");
    setQuoteId("");
    setDescription("");
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [defaultCompanyId, defaultSalesCaseId, defaultType, initialScope, open]);

  const selectedCase = useMemo(
    () => cases.find((item) => item.id === selectedCaseId),
    [cases, selectedCaseId]
  );
  const commercialRecordMode = type === "Proforma" || type === "Contract" || type === "CommercialInvoice";
  const eligibleOffers = useMemo(() => [...offers]
    .filter((offer) => scope === "case"
      ? offer.salesCaseId === selectedCaseId
      : offer.companyId === selectedCompanyId || cases.find((item) => item.id === offer.salesCaseId)?.customerId === selectedCompanyId)
    .sort((left, right) => right.revision - left.revision || right.date.localeCompare(left.date)), [cases, offers, scope, selectedCaseId, selectedCompanyId]);
  const selectedOffer = offers.find((offer) => offer.id === quoteId);
  const effectiveSalesCaseId = commercialRecordMode ? selectedOffer?.salesCaseId ?? selectedCaseId : selectedCaseId;
  const effectiveCase = cases.find((item) => item.id === effectiveSalesCaseId) ?? selectedCase;
  const entityType = commercialRecordMode || scope === "case" ? "opportunity" : "company";
  const entityId = commercialRecordMode ? effectiveSalesCaseId : scope === "case" ? selectedCaseId : selectedCompanyId;
  const companyId = commercialRecordMode
    ? selectedOffer?.companyId || effectiveCase?.customerId || defaultCompanyId
    : scope === "case" ? selectedCase?.customerId ?? defaultCompanyId : selectedCompanyId;
  const selectedCompany = customers.find((c) => c.id === companyId);
  const meta = DOCUMENT_TYPE_OPTIONS.find((item) => item.value === type) ?? DOCUMENT_TYPE_OPTIONS[DOCUMENT_TYPE_OPTIONS.length - 1];
  const lockedRelation = Boolean(defaultSalesCaseId || defaultCompanyId);
  const lockedType = defaultType === "ExternalQuote";
  const externalQuoteMode = type === "ExternalQuote";
  const dialogTitle = externalQuoteMode ? "Dış Teklif Yükle" : "Doküman Yükle";
  const allowedExtensions = externalQuoteMode ? EXTERNAL_QUOTE_EXTENSIONS : ALLOWED_EXTENSIONS;

  useEffect(() => {
    if (!open || !commercialRecordMode) return;
    if (!eligibleOffers.some((offer) => offer.id === quoteId)) setQuoteId(eligibleOffers[0]?.id ?? "");
  }, [commercialRecordMode, eligibleOffers, open, quoteId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      toast.error("Dosya seçin");
      return;
    }
    if (!entityId) {
      toast.error(scope === "company" ? "Firma seçin" : "Satış kartı seçin", {
        description: scope === "company"
          ? "Doküman eklemek için satış kartı gerekmez; yalnızca ilgili firmayı seçin."
          : "Satış kartı bağlantısı isteğe bağlıdır; dilerseniz Firma sekmesini kullanın.",
      });
      return;
    }
    if (commercialRecordMode && !quoteId) {
      toast.error("Bağlı teklif seçin", { description: "Proforma, sözleşme ve ticari fatura PDF'leri bir teklif revizyonuna bağlı olmalıdır." });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Dosya boyutu 25 MB'ı aşamaz");
      return;
    }
    const rawExtension = extensionFromName(file.name);
    const extension = rawExtension in EXT_TO_MIME ? (rawExtension as UploadExt) : null;
    if (!extension || !allowedExtensions.includes(extension)) {
      toast.error("Desteklenmeyen dosya tipi", {
        description: externalQuoteMode
          ? "Dış teklif için PDF, DOCX veya XLSX yükleyebilirsiniz."
          : "PDF, DOCX, XLSX, PNG, JPG veya WEBP yükleyebilirsiniz.",
      });
      return;
    }
    const mimeType = EXT_TO_MIME[extension];

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
      await fileService.uploadBinary(upload, file, mimeType);

      await fileService.link({
        fileId: upload.fileId,
        entityType,
        entityId,
        documentTypeCode: meta.documentTypeCode,
        description: description.trim() || undefined,
      });
      let row: DocumentItem;
      if (commercialRecordMode) {
        const today = new Date();
        const created = type === "Proforma"
          ? await documentService.createProforma({ quoteId, issueDate: today, statusCode: "draft", fileId: upload.fileId })
          : type === "Contract"
            ? await documentService.createContract({ quoteId, signedDate: today, statusCode: "draft", fileId: upload.fileId })
            : await documentService.createCommercialInvoice({ quoteId, invoiceDate: today, statusCode: "draft", fileId: upload.fileId });
        row = {
          id: created.id,
          source: "commercial_record",
          quoteId,
          salesCaseId: effectiveSalesCaseId,
          companyId,
          type,
          fileName: created.documentNo ?? created.contractNo ?? created.invoiceNo ?? file.name,
          uploadedBy: "",
          uploadedAt: new Date().toISOString().slice(0, 10),
          size: formatFileSize(file.size),
          fileId: upload.fileId,
          mimeType,
        };
        await refresh();
      } else {
        row = await addDocument({
          id: upload.fileId,
          fileId: upload.fileId,
          salesCaseId: scope === "case" ? selectedCaseId : "",
          companyId,
          type,
          fileName: file.name,
          size: formatFileSize(file.size),
          mimeType,
        });
      }
      toast.success(externalQuoteMode ? "Dış teklif yüklendi" : "Doküman yüklendi", { description: file.name });
      await onUploaded?.(row);
      setOpen(false);
    } catch (err: any) {
      toast.error(externalQuoteMode ? "Dış teklif yüklenemedi" : "Doküman yüklenemedi", {
        description: err?.message ?? "İstek başarısız oldu.",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="w-[min(620px,calc(100vw-2rem))] max-w-none sm:max-w-none max-h-[90dvh] overflow-hidden p-0 gap-0">
        <DialogHeader className="border-b border-border/60 px-5 pt-5 pb-4 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-5 text-primary" />
            {dialogTitle}
          </DialogTitle>
          <DialogDescription>
            {externalQuoteMode
              ? "Teklif dosyasını firmaya veya satış kartına bağlayın; kart seçildiğinde firma otomatik eşleşir."
              : commercialRecordMode
                ? "PDF'yi kaynak teklif revizyonuna bağlayın; belge, fırsat ve firma ilişkisi otomatik korunur."
                : "Dosyayı doğrudan firmaya ekleyin; satış kartı isteğe bağlıdır."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <div className="max-h-[calc(90dvh-150px)] overflow-y-auto px-5 py-4 space-y-4">
            {!lockedRelation && (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={scope === "company" ? "default" : "outline"} onClick={() => setScope("company")}>
                  Firma
                </Button>
                <Button type="button" variant={scope === "case" ? "default" : "outline"} onClick={() => setScope("case")}>
                  Satış kartı (firma otomatik)
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Doküman Tipi</Label>
                <Select value={type} onValueChange={(value) => setType(value as DocumentTypeValue)} disabled={lockedType}>
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

            {commercialRecordMode && (
              <div className="rounded-lg border border-primary/15 bg-primary/[0.035] p-3">
                <Label>Kaynak Teklif *</Label>
                <Select value={quoteId || undefined} onValueChange={setQuoteId}>
                  <SelectTrigger className="mt-1 bg-white">
                    <SelectValue placeholder="Teklif revizyonu seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleOffers.map((offer) => (
                      <SelectItem key={offer.id} value={offer.id}>
                        {offer.quoteNo} · R{offer.revision} · {offer.amount.toLocaleString("tr-TR")} {offer.currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="mt-2 flex items-start gap-2 text-[11px] text-muted-foreground">
                  <LinkIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span>{selectedOffer ? `${selectedOffer.quoteNo} revizyonu kaynak alınacak; firma ve fırsat bu tekliften çözülecek.` : "Seçilen firma/fırsat için teklif yok. Önce Teklifler ekranından teklif oluşturun."}</span>
                </div>
              </div>
            )}

            <button
              type="button"
              className="w-full rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-5 text-left transition hover:bg-muted/40"
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept={externalQuoteMode ? EXTERNAL_QUOTE_ACCEPT : ACCEPT}
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
                    {file
                      ? `${formatFileSize(file.size)} · ${file.type || extensionFromName(file.name).toLocaleUpperCase("tr-TR")}`
                      : `${externalQuoteMode ? "PDF, DOCX, XLSX" : "PDF, DOCX, XLSX, PNG, JPG, WEBP"} · en fazla 25 MB`}
                  </div>
                  {file && <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700"><FileCheck2 className="size-3.5" /> Güvenli yükleme için hazır</div>}
                </div>
              </div>
            </button>

            {uploading && (
              <div className="rounded-lg border border-primary/15 bg-primary/[0.035] p-3" aria-live="polite">
                <div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium">Dosya güvenli depoya aktarılıyor</span><span className="font-data text-primary">İşleniyor</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/10"><div className="h-full w-2/3 animate-pulse rounded-full bg-primary" /></div>
              </div>
            )}

            <div>
              <Label htmlFor="document-upload-description">Açıklama</Label>
              <Textarea
                id="document-upload-description"
                className="mt-1 min-h-20 resize-none"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="İsteğe bağlı not"
              />
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <LinkIcon className="size-4 shrink-0" />
              <span className="min-w-0 break-words">
                {entityId
                  ? scope === "case"
                    ? `Satış kartı bağlantısı · Firma: ${selectedCompany?.name ?? "Karttan otomatik eşleşecek"}`
                    : `Firma bağlantısı: ${selectedCompany?.name ?? entityId}`
                  : "Henüz bağlantı seçilmedi."}
              </span>
            </div>
            <div className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" /> Dosya tipi ve boyutu gönderimden önce doğrulanır; kayıt seçtiğiniz firma veya satış kartıyla güvenli biçimde ilişkilendirilir.
            </div>
          </div>

          <DialogFooter className="border-t border-border/60 bg-muted/20 px-5 py-4 gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={uploading}>İptal</Button>
            <Button type="submit" className="gap-1" disabled={uploading}>
              <Upload className="size-4" />
              {uploading ? "Yükleniyor..." : externalQuoteMode ? "Dış Teklifi Yükle" : "Yükle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
