import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookmarkPlus, CheckCircle2, Loader2, LockKeyhole, Mail, Paperclip, Pencil, Send, Settings2, Trash2, Upload, X } from "lucide-react";
import { MAIL_MAX_ATTACHMENTS, MAIL_MAX_ATTACHMENT_BYTES, MAIL_MAX_QUOTES, PRINT_DOCUMENT_MAX_CHARS, type MailRecipients } from "@haksan/shared";
import type { UserMailAccountStatus } from "@haksan/shared";
import { toast } from "sonner";
import { companyService, fileService, mailService } from "../../../lib/services";
import { normalizeCompany } from "../../lib/companyNormalizer";
import { loadAllCompanyContacts } from "../../lib/contactServerData";
import { buildMailDocumentHtml, loadQuotePrintData, printAssetBase, quoteDoc, quoteFilename } from "../../lib/print";
import { useStore } from "../../lib/store";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { MultiSelect, type MultiSelectOption } from "../ui/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { CatalogLibraryDialog, type CatalogAttachment } from './CatalogLibraryDialog';
import { MailBodyEditor } from './MailBodyEditor';

/** Mail gövdesi şablonları not şablonlarıyla aynı tabloda, bu kapsam altında tutulur. */
export const MAIL_TEMPLATE_SCOPE = "mail";

export type MailRecipient = {
  email: string;
  name?: string;
  companyId?: string;
  contactId?: string;
  subject?: string;
  body?: string;
  /**
   * Verilirse bu teklif ekte seçili gelir. Firmanın diğer teklifleri de pencerede
   * listelenir; seçilenlerin hepsi aynı maile PDF olarak eklenir.
   */
  quoteId?: string;
  /**
   * Verilirse pencerede dosya ekleme alanı açılır. Yüklenen dosya normal
   * yükleme yolundan geçip bu fırsata bağlanır — maile eklenen belge kayıtta
   * da durur, "ne gönderdik" sorusu sonradan cevaplanabilsin.
   */
  opportunityId?: string;
  /** Ek satırında gösterilecek etiket (ör. teklif numarası). */
  attachmentLabel?: string;
  /**
   * Verilirse ek, "Yazdır / PDF Kaydet" belgesinin aynısı olur: istemci HTML'i üretir,
   * sunucu Chromium ile PDF'e çevirir. Yoksa sunucunun sade şablonu kullanılır.
   */
  document?: () => Promise<{ html: string; filename: string }>;
  /**
   * Teklif yerine bir rapor ekleniyorsa: yine "Yazdır / PDF Kaydet" belgesi, ama
   * CRM kaydına bağlanmaz ve sunucuda `reports.export` yetkisi ister.
   */
  reportDocument?: () => Promise<{ html: string; filename: string }>;
  productDocument?: { id: string; pdf: () => Promise<{ html: string; filename: string }> };
  initialAttachments?: CatalogAttachment[];
  /**
   * Proforma / sözleşme kaydının "Yazdır / PDF Kaydet" belgesi. Sunucu kaydı görebildiğini
   * doğrulayıp HTML'i PDF'e çevirir ve ek olarak gönderir.
   */
  recordDocument?: {
    id: string;
    kind: "proforma" | "contract";
    pdf: () => Promise<{ html: string; filename: string }>;
  };
};

const RECORD_DOCUMENT_LABELS = { proforma: "Proforma", contract: "Sözleşme" } as const;

const emptyRecipients: MailRecipients = { contacts: [], colleagues: [] };

/** Sunucunun kabul ettiği tiplerin ek olarak anlamlı olan alt kümesi. */
const ATTACHMENT_EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_EXT_TO_MIME).map((ext) => `.${ext}`).join(",");
const formatAttachmentSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

type MailAttachment = { fileId: string; name: string; size: number };

export function ComposeMailDialog({
  recipient,
  onOpenChange,
  onSent,
}: {
  recipient: MailRecipient | null;
  onOpenChange: (open: boolean) => void;
  onSent?: () => Promise<void> | void;
}) {
  const { noteTemplates, addNoteTemplate, updateNoteTemplate, deleteNoteTemplate, offers, cases, closedCases, customers, users, contacts, products } = useStore();
  const [account, setAccount] = useState<UserMailAccountStatus | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState("");
  const [contactId, setContactId] = useState<string | undefined>(undefined);
  const [cc, setCc] = useState<string[]>([]);
  const [ccManual, setCcManual] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [options, setOptions] = useState<MailRecipients>(emptyRecipients);
  const [attachments, setAttachments] = useState<MailAttachment[]>([]);
  const [quoteIds, setQuoteIds] = useState<string[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateMode, setTemplateMode] = useState<"create" | "update">("create");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [deleteTemplateOpen, setDeleteTemplateOpen] = useState(false);

  useEffect(() => {
    if (!recipient) return;
    setTo(recipient.email);
    setContactId(recipient.contactId);
    setCc([]);
    setCcManual("");
    setSubject(recipient.subject ?? "");
    setTemplateName(null);
    setSelectedTemplateId("");
    setDeleteTemplateOpen(false);
    setBody(recipient.body ?? (recipient.name ? `Merhaba ${recipient.name},\n\n` : "Merhaba,\n\n"));
    // Başka bir alıcıya geçilince önceki mailin ekleri taşınmamalı.
    setAttachments(recipient.initialAttachments ?? []);
    setQuoteIds(recipient.quoteId ? [recipient.quoteId] : []);
    setCatalogOpen(false);
    setAccountLoading(true);
    mailService.account()
      .then(setAccount)
      .catch((error: any) => toast.error("Gönderici hesabı kontrol edilemedi", { description: error?.message }))
      .finally(() => setAccountLoading(false));
    mailService.recipients(recipient.companyId)
      .then(setOptions)
      .catch(() => setOptions(emptyRecipients));
  }, [recipient]);

  const mailTemplates = useMemo(
    () => noteTemplates.filter((template) => template.scope === MAIL_TEMPLATE_SCOPE),
    [noteTemplates],
  );

  const selectedTemplate = mailTemplates.find((template) => template.id === selectedTemplateId);

  // Rapor / belge / teknik föy ekleri teklifle aynı maile giremez (sunucu şeması da reddeder).
  const quotePicker = Boolean(recipient?.companyId && !recipient.reportDocument && !recipient.recordDocument && !recipient.productDocument);
  const salesCaseById = useMemo(() => new Map([...cases, ...closedCases].map((item) => [item.id, item])), [cases, closedCases]);
  const companyQuotes = useMemo(() => {
    if (!quotePicker) return [];
    return offers
      .filter((offer) => offer.id === recipient?.quoteId
        || (offer.status !== "Cancelled" && (offer.companyId || salesCaseById.get(offer.salesCaseId)?.customerId) === recipient?.companyId))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [offers, quotePicker, recipient, salesCaseById]);

  const toggleQuote = (id: string) => {
    if (quoteIds.includes(id)) setQuoteIds(quoteIds.filter((item) => item !== id));
    else if (quoteIds.length >= MAIL_MAX_QUOTES) toast.error(`Bir maile en fazla ${MAIL_MAX_QUOTES} teklif eklenebilir`);
    else setQuoteIds([...quoteIds, id]);
  };

  /**
   * Ek = teklifin "Yazdır / PDF Kaydet" belgesi. Açılan teklifin kendi üreticisi (logo seçimiyle)
   * önceliklidir; diğerleri teklif ekranının yaptığı gibi güncel firma ve kontak verisiyle basılır.
   */
  const buildQuoteDocuments = async (ids: string[]) => {
    if (!recipient?.companyId) return ids.map((id) => ({ id }));
    let context: Promise<{ customer: (typeof customers)[number] | null; contacts: typeof contacts }> | undefined;
    const loadContext = () => (context ??= (async () => {
      const [detail, remote] = await Promise.all([
        companyService.get(recipient.companyId!),
        loadAllCompanyContacts(recipient.companyId!),
      ]);
      const remoteIds = new Set(remote.data.map((contact) => contact.id));
      return {
        customer: normalizeCompany(detail, customers.find((item) => item.id === recipient.companyId)),
        contacts: [...remote.data, ...contacts.filter((contact) => !remoteIds.has(contact.id))],
      };
    })());
    return Promise.all(ids.map(async (id) => {
      if (id === recipient.quoteId && recipient.document) return { id, document: await recipient.document() };
      const offer = offers.find((item) => item.id === id);
      if (!offer) return { id };
      const { customer, contacts: printContacts } = await loadContext();
      const data = await loadQuotePrintData({
        offer,
        customer,
        salesCase: salesCaseById.get(offer.salesCaseId) ?? null,
        users,
        contacts: printContacts,
        products,
      });
      const html = await buildMailDocumentHtml(quoteDoc(data, printAssetBase()));
      // Gömülü görseller belgeyi şema sınırının üstüne çıkarırsa tüm mail reddedilmesin: sunucu şablonu.
      if (html.length > PRINT_DOCUMENT_MAX_CHARS) return { id };
      return {
        id,
        document: {
          html,
          filename: `${quoteFilename(data, { division: offer.businessLine ?? offer.divisionCode ?? offer.divisionName, company: data.firma || customer?.name })}.pdf`,
        },
      };
    }));
  };

  // Kendi ekibimiz ve müşteri kontakları tek listede; hangisi olduğu etikette yazar.
  const ccOptions: MultiSelectOption[] = useMemo(() => {
    const manual = cc
      .filter((email) => ![...options.contacts, ...options.colleagues].some((option) => option.email === email))
      .map((email) => ({ value: email, label: email }));
    return [
      ...options.contacts.map((option) => ({
        value: option.email,
        label: `${option.name}${option.detail ? ` · ${option.detail}` : ""} — ${option.email}`,
      })),
      ...options.colleagues.map((option) => ({
        value: option.email,
        label: `${option.name} (ekibimiz) — ${option.email}`,
      })),
      ...manual,
    ];
  }, [cc, options]);

  const close = () => {
    if (sending || uploading || templateBusy || catalogOpen) return;
    onOpenChange(false);
  };

  const pickContact = (email: string) => {
    setTo(email);
    setContactId(options.contacts.find((option) => option.email === email)?.contactId ?? undefined);
  };

  const addManualCc = () => {
    const email = ccManual.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Geçerli bir e-posta adresi girin");
      return;
    }
    if (!cc.includes(email)) setCc([...cc, email]);
    setCcManual("");
  };

  const saveTemplate = async () => {
    if (templateBusy) return;
    const text = body.trim();
    const title = (templateName ?? "").trim();
    if (!text) return toast.error("Şablon olarak kaydedilecek bir mesaj yok");
    if (!title) return toast.error("Şablona bir ad verin");
    if (text.length > 10_000) return toast.error("Mesaj en fazla 10.000 karakter olabilir");
    if (templateMode === "update" && !selectedTemplate) return toast.error("Düzenlenecek şablonu seçin");
    setTemplateBusy(true);
    try {
      const saved = templateMode === "update"
        ? await updateNoteTemplate(selectedTemplate!.id, { title, body: text })
        : await addNoteTemplate({ title, body: text, scope: MAIL_TEMPLATE_SCOPE });
      setSelectedTemplateId(saved.id);
      toast.success(templateMode === "update" ? "Mail şablonu güncellendi" : "Mail şablonu kaydedildi", { description: title });
      setTemplateName(null);
    } catch (error: any) {
      toast.error("Şablon kaydedilemedi", { description: error?.message ?? "API isteği başarısız oldu." });
    } finally {
      setTemplateBusy(false);
    }
  };

  const removeTemplate = async () => {
    if (!selectedTemplate || templateBusy) return;
    setTemplateBusy(true);
    try {
      await deleteNoteTemplate(selectedTemplate.id);
      toast.success("Mail şablonu silindi", { description: selectedTemplate.title });
      setSelectedTemplateId("");
      setTemplateName(null);
      setDeleteTemplateOpen(false);
    } catch (error: any) {
      toast.error("Şablon silinemedi", { description: error?.message ?? "API isteği başarısız oldu." });
    } finally {
      setTemplateBusy(false);
    }
  };

  // Yüklenen dosya kayıtta da durur: fırsattan açıldıysa fırsata, yoksa firmaya bağlanır.
  const uploadTarget = recipient?.opportunityId
    ? { entityType: "opportunity" as const, entityId: recipient.opportunityId }
    : recipient?.companyId ? { entityType: "company" as const, entityId: recipient.companyId } : null;

  const pickAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file || !uploadTarget) return;
    const extension = file.name.split(".").pop()?.toLocaleLowerCase("tr-TR") ?? "";
    const mimeType = ATTACHMENT_EXT_TO_MIME[extension];
    if (!mimeType) {
      toast.error("Desteklenmeyen dosya tipi", { description: "PDF, DOCX, XLSX, PNG, JPG veya WEBP ekleyebilirsiniz." });
      return;
    }
    if (attachments.length >= MAIL_MAX_ATTACHMENTS) {
      toast.error(`En fazla ${MAIL_MAX_ATTACHMENTS} dosya eklenebilir`);
      return;
    }
    const total = attachments.reduce((sum, item) => sum + item.size, 0) + file.size;
    if (total > MAIL_MAX_ATTACHMENT_BYTES) {
      toast.error(`Eklerin toplamı ${Math.round(MAIL_MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB'ı aşamaz`);
      return;
    }
    setUploading(true);
    try {
      const upload = await fileService.signedUpload({
        // "Diğer" fırsat belgeleriyle aynı kova (bkz. DocumentUploadDialog).
        bucket: "erp-quote-documents",
        ...uploadTarget,
        filename: file.name,
        mimeType: mimeType as never,
        extension: extension as never,
        sizeBytes: file.size,
      });
      await fileService.uploadBinary(upload, file, mimeType);
      await fileService.link({ fileId: upload.fileId, ...uploadTarget, documentTypeCode: "other" });
      setAttachments((current) => [...current, { fileId: upload.fileId, name: file.name, size: file.size }]);
    } catch (error: any) {
      toast.error("Dosya eklenemedi", { description: error?.message ?? "Yükleme başarısız oldu." });
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    if (sending || uploading || templateBusy) return;
    if (!recipient || !to.trim() || !subject.trim() || !body.trim()) {
      toast.error("Alıcı, konu ve mesaj zorunludur");
      return;
    }
    setSending(true);
    try {
      const quotes = quoteIds.length ? await buildQuoteDocuments(quoteIds) : undefined;
      const reportDocument = recipient.reportDocument ? await recipient.reportDocument() : undefined;
      const recordDocument = recipient.recordDocument
        ? { id: recipient.recordDocument.id, kind: recipient.recordDocument.kind, pdf: await recipient.recordDocument.pdf() }
        : undefined;
      const productDocument = recipient.productDocument
        ? { id: recipient.productDocument.id, pdf: await recipient.productDocument.pdf() }
        : undefined;
      await mailService.send({
        to: to.trim(),
        cc: cc.length ? cc : undefined,
        subject: subject.trim(),
        body: body.trim(),
        companyId: recipient.companyId,
        contactId,
        quotes,
        reportDocument,
        document: recordDocument,
        productDocument,
        fileIds: attachments.length ? attachments.map((item) => item.fileId) : undefined,
      });
      await onSent?.();
      toast.success("E-posta gönderildi", { description: `${account?.email ?? "Webmail hesabınız"} üzerinden teslim edildi.` });
      onOpenChange(false);
    } catch (error: any) {
      toast.error("E-posta gönderilemedi", { description: error?.message ?? "Webmail bağlantınızı kontrol edin." });
    } finally {
      setSending(false);
    }
  };

  const ready = account?.featureEnabled && account.configured && account.status === "active";
  // Sunucu maile bunu ekler: kayıtlı imza, yoksa profilden üretilen varsayılan ('' = imzasız).
  const signature = account ? (account.signature ?? account.defaultSignature) : "";
  // Açılan teklif listede yoksa (mağazada değil) seçimi kaldırılamaz olurdu; o durumda tek teklif satırı gösterilir.
  const showQuotePicker = quotePicker && companyQuotes.length > 0
    && (!recipient?.quoteId || companyQuotes.some((offer) => offer.id === recipient.quoteId));
  const attachmentKind = recipient?.quoteId && !showQuotePicker
    ? "Teklif"
    : recipient?.recordDocument
      ? RECORD_DOCUMENT_LABELS[recipient.recordDocument.kind]
      : recipient?.productDocument ? "Ürün Teknik Bilgisi" : recipient?.reportDocument ? "Rapor" : null;

  return (
    <>
    <Dialog open={Boolean(recipient)} onOpenChange={(open) => !open && close()}>
      <CatalogLibraryDialog open={catalogOpen} onOpenChange={setCatalogOpen} onSelect={file => {
        if (attachments.some(item => item.fileId === file.fileId)) { toast.message('Bu katalog zaten eklendi'); return; }
        if (attachments.length >= MAIL_MAX_ATTACHMENTS || attachments.reduce((sum, item) => sum + item.size, 0) + file.size > MAIL_MAX_ATTACHMENT_BYTES) { toast.error(`Ek sayısı veya toplam ${MAIL_MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB sınırı aşılıyor`); return; }
        setAttachments(current => [...current, file]);
      }} />
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto p-0">
        <div className="border-b border-border/70 bg-[linear-gradient(135deg,#07142b,#102652)] px-6 py-5 text-white">
          <DialogHeader>
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.17em] text-sky-300">
              <Mail className="size-3.5" /> CRM WEBMAIL
            </div>
            <DialogTitle className="text-white">Yeni e-posta</DialogTitle>
            <DialogDescription className="text-white/60">
              Mesaj CRM’den çıkar, gönderilmiş ileti firma zaman çizelgesine kaydedilir.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 pb-2">
          {accountLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Gönderici hesabı kontrol ediliyor
            </div>
          ) : ready ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-2.5">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-success"><CheckCircle2 className="size-4" />{account.displayName} &lt;{account.email}&gt;</span>
              <span className="text-[11px] text-muted-foreground">Kişisel webmail üzerinden</span>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning/5 px-3 py-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p className="text-xs font-medium">Gönderici hesabı hazır değil</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Ayarlar &gt; Webmail bölümünden kurumsal adresinizi ve webmail şifrenizi doğrulayın.
                </p>
              </div>
              <Settings2 className="ml-auto size-4 shrink-0 text-muted-foreground" />
            </div>
          )}

          <div>
            <Label htmlFor="compose-mail-to" className="text-xs text-muted-foreground">Alıcı</Label>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <Input id="compose-mail-to" className="sm:flex-1" type="email" value={to} maxLength={255} onChange={(event) => setTo(event.target.value)} disabled={sending} />
              <Select value={undefined} onValueChange={pickContact} disabled={sending || options.contacts.length === 0}>
                <SelectTrigger className="sm:w-64" aria-label="Firma kontaklarından seç">
                  <SelectValue placeholder={options.contacts.length ? "Firma kontaklarından seç" : "Kontak e-postası yok"} />
                </SelectTrigger>
                <SelectContent>
                  {options.contacts.map((option) => (
                    <SelectItem key={option.email} value={option.email}>
                      {option.name}{option.detail ? ` · ${option.detail}` : ""} — {option.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">CC (bilgi)</Label>
            <div className="mt-1 space-y-2">
              <MultiSelect
                options={ccOptions}
                selected={cc}
                onChange={setCc}
                placeholder="Ekibimizden veya müşteri kontaklarından seç"
                emptyText="Seçilebilecek adres yok"
              />
              <div className="flex gap-2">
                <Input
                  aria-label="CC için e-posta adresi yaz"
                  className="flex-1"
                  type="email"
                  placeholder="Listede olmayan adres..."
                  value={ccManual}
                  maxLength={255}
                  disabled={sending}
                  onChange={(event) => setCcManual(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addManualCc(); } }}
                />
                <Button type="button" variant="outline" onClick={addManualCc} disabled={sending || !ccManual.trim()}>Ekle</Button>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="compose-mail-subject" className="text-xs text-muted-foreground">Konu</Label>
            <Input id="compose-mail-subject" className="mt-1" value={subject} maxLength={255} onChange={(event) => setSubject(event.target.value)} disabled={sending} placeholder="E-postanın konusu" />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="compose-mail-body" className="text-xs text-muted-foreground">Mesaj</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={selectedTemplateId}
                  onValueChange={(id) => {
                    const template = mailTemplates.find((item) => item.id === id);
                    if (template) {
                      setSelectedTemplateId(id);
                      setBody(template.body);
                      setTemplateName(null);
                    }
                  }}
                  disabled={sending || templateBusy || mailTemplates.length === 0}
                >
                  <SelectTrigger className="h-8 w-56" aria-label="Mail şablonu seç">
                    <SelectValue placeholder={mailTemplates.length ? "Şablon seç" : "Kayıtlı şablon yok"} />
                  </SelectTrigger>
                  <SelectContent>
                    {mailTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>{template.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => { setTemplateMode("create"); setTemplateName(subject.trim()); }}
                  disabled={sending || templateBusy}
                >
                  <BookmarkPlus className="size-3.5" /> Şablon ekle
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={sending || templateBusy || !selectedTemplate} onClick={() => { setTemplateMode("update"); setTemplateName(selectedTemplate!.title); }}>
                  <Pencil className="size-3.5" /> Düzenle
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={sending || templateBusy || !selectedTemplate} onClick={() => setDeleteTemplateOpen(true)}>
                  <Trash2 className="size-3.5" /> Sil
                </Button>
              </div>
            </div>
            {templateName !== null && (
              <div className="mt-1.5 flex gap-2 rounded-lg border border-border/60 bg-muted/30 p-2">
                <Input
                  aria-label="Şablon adı"
                  className="h-8 flex-1 bg-white"
                  placeholder="Şablon adı (ör. Standart teklif maili)"
                  maxLength={200}
                  value={templateName}
                  disabled={templateBusy || sending}
                  onChange={(event) => setTemplateName(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveTemplate(); } }}
                />
                <Button type="button" size="sm" className="h-8" disabled={templateBusy || sending} onClick={() => void saveTemplate()}>{templateBusy ? "Kaydediliyor…" : templateMode === "update" ? "Güncelle" : "Kaydet"}</Button>
                <Button type="button" size="sm" variant="ghost" className="h-8" disabled={templateBusy} onClick={() => setTemplateName(null)}>Vazgeç</Button>
              </div>
            )}
            <MailBodyEditor value={body} onChange={setBody} disabled={sending || templateBusy} />
            <div className="mt-1 text-right font-mono text-[10px] text-muted-foreground">{body.length.toLocaleString("tr-TR")} / 10.000</div>
          </div>

          {account?.signatureImage && <div className="border-t pt-3"><p className="mb-2 text-xs text-muted-foreground">İmzanız gönderime otomatik eklenir.</p><img src={account.signatureImage} alt="E-posta imzanız" className="h-auto w-[480px] max-w-full" /></div>}

          {ready && signature && !account?.signatureImage && (
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="font-medium">İmza · mesajın altına otomatik eklenir</span>
                <span>Ayarlar &gt; Webmail'den değiştirilebilir</span>
              </div>
              <p className="whitespace-pre-line text-xs leading-relaxed text-foreground/80">{signature}</p>
            </div>
          )}

          {recipient && attachmentKind && (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs">
              <Paperclip className="size-3.5 text-muted-foreground" />
              <span className="font-medium">{recipient.attachmentLabel ?? attachmentKind}.pdf</span>
              <span className="text-muted-foreground">{attachmentKind.toLocaleLowerCase("tr-TR")} PDF'i ek olarak gönderilir</span>
            </div>
          )}

          {showQuotePicker && (
            <fieldset className="space-y-2">
              <legend className="flex w-full flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-medium">Teklifler</span>
                <span className="text-[11px] text-muted-foreground">{quoteIds.length} seçili · en fazla {MAIL_MAX_QUOTES} · her biri PDF olarak eklenir</span>
              </legend>
              <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                {companyQuotes.map((offer) => (
                  <li key={offer.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
                      <input
                        type="checkbox" className="size-4 shrink-0 accent-primary"
                        checked={quoteIds.includes(offer.id)} disabled={sending}
                        onChange={() => toggleQuote(offer.id)}
                      />
                      <span className="shrink-0 font-mono font-semibold">{offer.quoteNo}</span>
                      <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">R{offer.revision}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{offer.productName || "Ürün bilgisi yok"}</span>
                      <span className="shrink-0 tabular-nums">{offer.amount.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} {offer.currency}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          {recipient && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs">Dosya ekle</Label>
                <input
                  ref={fileInputRef} type="file" className="sr-only" accept={ATTACHMENT_ACCEPT}
                  id="compose-mail-attachment" disabled={sending || uploading}
                  onChange={(event) => void pickAttachment(event)}
                />
                {uploadTarget && <Button
                  type="button" variant="outline" size="sm" className="gap-1.5"
                  disabled={sending || uploading || attachments.length >= MAIL_MAX_ATTACHMENTS}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : <Upload className="size-3.5" />}
                  {uploading ? "Yükleniyor…" : "Dosya seç"}
                </Button>}
                <Button type="button" variant="outline" size="sm" disabled={sending || uploading || attachments.length >= MAIL_MAX_ATTACHMENTS} onClick={() => setCatalogOpen(true)}><Paperclip className="mr-1 size-3.5" />Katalog Ekle</Button>
              </div>
              {attachments.length > 0 && (
                <ul className="space-y-1.5">
                  {attachments.map((item) => (
                    <li key={item.fileId} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                      <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                      <span className="shrink-0 text-muted-foreground">{formatAttachmentSize(item.size)}</span>
                      <Button
                        type="button" variant="ghost" size="icon" className="size-7 shrink-0"
                        aria-label={`${item.name} ekini kaldır`} disabled={sending || uploading}
                        onClick={() => setAttachments((current) => current.filter((entry) => entry.fileId !== item.fileId))}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-muted-foreground">
                PDF, DOCX, XLSX, PNG, JPG veya WEBP · en fazla {MAIL_MAX_ATTACHMENTS} dosya ·
                toplam {Math.round(MAIL_MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB.{recipient.opportunityId ? " Yüklenen dosya fırsatın belgelerine de kaydedilir." : recipient.companyId ? " Yüklenen dosya firmanın belgelerine de kaydedilir." : " Kataloglar ortak kütüphaneden seçilir."}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="mx-6 mb-5">
          <div className="mr-auto hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex"><LockKeyhole className="size-3.5" />TLS ile güvenli gönderim</div>
          <Button variant="outline" onClick={close} disabled={sending || templateBusy}>Vazgeç</Button>
          <Button className="gap-2" disabled={!ready || sending || uploading || templateBusy || !to.trim() || !subject.trim() || !body.trim() || body.length > 10_000} onClick={() => void send()}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {sending ? "Gönderiliyor" : "E-postayı gönder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={deleteTemplateOpen} onOpenChange={(open) => { if (!templateBusy) setDeleteTemplateOpen(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mail şablonu silinsin mi?</AlertDialogTitle>
          <AlertDialogDescription>“{selectedTemplate?.title}” kayıtlı şablonlardan kaldırılacak. Yazdığınız mesaj korunur.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={templateBusy}>Vazgeç</AlertDialogCancel>
          <AlertDialogAction disabled={templateBusy} onClick={(event) => { event.preventDefault(); void removeTemplate(); }}>{templateBusy ? "Siliniyor…" : "Şablonu sil"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
