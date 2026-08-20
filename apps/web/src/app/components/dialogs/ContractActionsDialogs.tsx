import { useMemo, useRef, useState } from "react";
import { FileSignature, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import type { DocumentItem, SalesCase } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { documentService, fileService } from "../../../lib/services";
import { Button } from "../ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import {
  DocumentTermsTemplateEditor, matchSavedTermsTemplate, useTermsTemplates,
} from "./DocumentTermsTemplateEditor";
import { CONTRACT_NOTE_VARIANTS, contractTermsFillContext } from "../../lib/print";

const CONTRACT_TERMS_TEMPLATE_SCOPE = "contract_terms";

/** İmzalı sözleşme yalnız PDF olarak kabul edilir (API: assertContractFile). */
const MAX_SIGNED_CONTRACT_BYTES = 25 * 1024 * 1024;

/**
 * Yükleme öncesi dosya kontrolü — kurallar API'deki `assertContractFile` ile
 * aynıdır; amaç hatayı sunucuya gitmeden göstermek.
 *
 * Tip kontrolü uzantıyı da kabul eder: bazı kaynaklarda tarayıcı `file.type`
 * alanını boş bırakıyor ve geçerli bir PDF reddediliyordu. İsteğe giden MIME
 * tipi zaten sabit `application/pdf`.
 */
export function signedContractFileError(file: { name: string; type: string; size: number }): string | null {
  const isPdf = file.type === "application/pdf" || file.name.toLocaleLowerCase("tr-TR").endsWith(".pdf");
  if (!isPdf) return "İmzalı sözleşme PDF formatında olmalıdır";
  if (file.size > MAX_SIGNED_CONTRACT_BYTES) return "Dosya boyutu 25 MB'ı aşamaz";
  return null;
}

export function SignedContractUploadDialog({
  document,
  salesCase,
  trigger,
}: {
  document: DocumentItem;
  salesCase: SalesCase;
  trigger: React.ReactNode;
}) {
  const { refresh } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [signedDate, setSignedDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return toast.error("İmzalı PDF dosyasını seçin");
    const fileError = signedContractFileError(file);
    if (fileError) return toast.error(fileError);
    setBusy(true);
    try {
      const upload = await fileService.signedUpload({
        bucket: "erp-contract-documents",
        entityType: "opportunity",
        entityId: salesCase.id,
        filename: file.name,
        mimeType: "application/pdf",
        extension: "pdf",
        sizeBytes: file.size,
      });
      await fileService.uploadBinary(upload, file, "application/pdf");
      await fileService.link({
        fileId: upload.fileId,
        entityType: "opportunity",
        entityId: salesCase.id,
        documentTypeCode: "contract_pdf",
        description: `${document.fileName} imzalı nüsha`,
      });
      await documentService.updateContract(document.id, {
        fileId: upload.fileId,
        signedDate: new Date(`${signedDate}T12:00:00`),
        statusCode: "signed",
      });
      await refresh();
      toast.success("İmzalı sözleşme fırsata bağlandı", { description: file.name });
      setOpen(false);
      setFile(null);
    } catch (error: unknown) {
      toast.error("İmzalı sözleşme yüklenemedi", {
        description: error instanceof Error ? error.message : "İstek başarısız oldu.",
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="size-5 text-primary" /> İmzalı Sözleşme Yükle</DialogTitle>
          <DialogDescription>{document.fileName} kaydına imzalı PDF nüshasını bağlayın.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`signed-contract-${document.id}`}>İmzalı PDF *</Label>
            <Input ref={inputRef} id={`signed-contract-${document.id}`} type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`signed-date-${document.id}`}>İmza tarihi *</Label>
            <Input id={`signed-date-${document.id}`} type="date" value={signedDate} onChange={(event) => setSignedDate(event.target.value)} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Vazgeç</Button>
            <Button type="submit" disabled={busy || !file || !signedDate}>{busy ? "Yükleniyor…" : "Yükle ve İmzalı Yap"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditContractTermsDialog({ document, trigger }: { document: DocumentItem; trigger: React.ReactNode }) {
  const { products, noteTemplates, addNoteTemplate, updateNoteTemplate, deleteNoteTemplate, refresh } = useStore();
  const snapshotTerms = useMemo(() => document.documentSnapshot?.terms ?? {}, [document.documentSnapshot]);
  /**
   * Belgenin kendi şartı yoksa `documentSnapshot.terms` ham `quote_terms` satırına
   * düşer ve NULL sütunlar taşır. Bunları olduğu gibi geri göndermek iki şekilde
   * patlıyordu: `deliveryLocation: null` zod'un `.optional()` alanını reddedip
   * kaydı 400'lüyor, `estimatedDeliveryDays*: null` ise 0'a coerce olup sözleşmeye
   * kimsenin girmediği bir teslim ayı taahhüdü ekliyordu.
   */
  const carriedTerms = useMemo(
    () => Object.fromEntries(Object.entries(snapshotTerms).filter(([, value]) => value !== null)),
    [snapshotTerms],
  );
  const savedTermsTemplates = useTermsTemplates(noteTemplates, CONTRACT_TERMS_TEMPLATE_SCOPE);
  const termsFillContext = useMemo(
    () => contractTermsFillContext(document.documentSnapshot, products),
    [document.documentSnapshot, products],
  );
  const [open, setOpen] = useState(false);
  const [payment, setPayment] = useState(() => String(snapshotTerms.paymentTermsText ?? ""));
  const [delivery, setDelivery] = useState(() => String(snapshotTerms.deliveryTermsText ?? ""));
  const [warranty, setWarranty] = useState(() => String(snapshotTerms.warrantyTermsText ?? ""));
  const [termsTemplateKey, setTermsTemplateKey] = useState(() => matchSavedTermsTemplate(
    String(snapshotTerms.paymentTermsText ?? ""),
    String(snapshotTerms.deliveryTermsText ?? ""),
    String(snapshotTerms.warrantyTermsText ?? ""),
    savedTermsTemplates,
  ));
  // Sözleşme çıktısındaki 2.6 / 3.3 maddelerinin yönü — metin değil, seçim.
  const [vatIncluded, setVatIncluded] = useState(() => Boolean(snapshotTerms.vatIncluded));
  const [freightPaidBySeller, setFreightPaidBySeller] = useState(() => Boolean(snapshotTerms.freightPaidBySeller));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await documentService.updateContract(document.id, {
        terms: {
          // Şartların tamamı tek alanda saklanır: yalnız üç metni göndermek
          // teslim yeri, teslim süresi ve ithalat masrafı seçimini siliyordu.
          ...carriedTerms,
          paymentTermsText: payment.trim(),
          deliveryTermsText: delivery.trim(),
          warrantyTermsText: warranty.trim(),
          vatIncluded,
          freightPaidBySeller,
        },
      });
      await refresh();
      toast.success("Sözleşme şartları güncellendi");
      setOpen(false);
    } catch (error: unknown) {
      toast.error("Sözleşme şartları güncellenemedi", {
        description: error instanceof Error ? error.message : "İstek başarısız oldu.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSignature className="size-5 text-primary" /> Sözleşme Şartlarını Düzenle</DialogTitle>
          <DialogDescription>Değişiklik yalnız bu sözleşmeye ve onun baskı anlık görüntüsüne işlenir.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          {/* Teklif ve belge oluşturma ekranlarındaki şart editörünün aynısı:
              kayıtlı şablonlar, madde sayacı ve şablon kaydetme burada da çalışır. */}
          <DocumentTermsTemplateEditor
            markerStyle="none"
            builtInVariants={CONTRACT_NOTE_VARIANTS}
            fillContext={termsFillContext}
            title="Sözleşme Şartları"
            description="Şablon seçin veya metni düzenleyin. Değişiklik yalnız bu sözleşmeye işlenir; bağlı teklifin şartları olduğu gibi kalır."
            templateScope={CONTRACT_TERMS_TEMPLATE_SCOPE}
            noteTemplates={noteTemplates}
            selectedTemplateKey={termsTemplateKey}
            onSelectedTemplateKeyChange={setTermsTemplateKey}
            value={{ paymentTerms: payment, deliveryTerms: delivery, warrantyTerms: warranty }}
            onChange={(next) => {
              setPayment(next.paymentTerms);
              setDelivery(next.deliveryTerms);
              setWarranty(next.warrantyTerms);
            }}
            addNoteTemplate={addNoteTemplate}
            updateNoteTemplate={updateNoteTemplate}
            deleteNoteTemplate={deleteNoteTemplate}
          />
          <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/20 p-3">
            <p className="text-xs font-semibold">Sözleşme Maddeleri</p>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Switch checked={vatIncluded} onCheckedChange={setVatIncluded} disabled={busy} />
              K.D.V. fiyata dahil (madde 3.3 — yazılan tutar brüt basılır)
            </label>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Switch checked={freightPaidBySeller} onCheckedChange={setFreightPaidBySeller} disabled={busy} />
              Nakliye ve sigorta HAKSAN'a ait (madde 2.6)
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Vazgeç</Button>
          <Button onClick={() => void save()} disabled={busy} className="gap-1.5"><Save className="size-4" /> {busy ? "Kaydediliyor…" : "Şartları Kaydet"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
