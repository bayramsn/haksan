import { useEffect, useRef, useState } from "react";
import { Paperclip, FileText, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { DocumentItem } from "../lib/mock";
import { getSignedFile } from "../lib/signedFileCache";
import { DocumentUploadDialog } from "./dialogs/DocumentUploadDialog";
import { useStore } from "../lib/store";
import { fileService } from "../../lib/services";

const MAX_THUMBS = 4;

/** Servis ekleri için izin verilen tipler (DocumentUploadDialog ile aynı). */
const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const ACCEPT = Object.keys(EXT_TO_MIME).map((e) => `.${e}`).join(",");

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isImageDoc = (d: DocumentItem) =>
  (d.mimeType?.startsWith("image/") ?? false) || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(d.fileName);

const extLabel = (name: string) => (name.split(".").pop() ?? "").slice(0, 4).toLocaleUpperCase("tr-TR") || "DOSYA";

/** İmzalı URL ile yüklenen küçük görsel önizleme karosu. */
function ImageThumb({ doc, onClick }: { doc: DocumentItem; onClick: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!doc.fileId) return;
    let alive = true;
    getSignedFile(doc.fileId)
      .then((f) => alive && setSrc(f.url))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [doc.fileId]);

  return (
    <button
      type="button"
      title={doc.fileName}
      onClick={onClick}
      className="relative size-9 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted/40 grid place-items-center transition hover:border-primary/60 hover:shadow-sm"
    >
      {src && !failed ? (
        <img src={src} alt={doc.fileName} className="size-full object-cover" onError={() => setFailed(true)} />
      ) : failed ? (
        <FileText className="size-4 text-muted-foreground" />
      ) : (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
      )}
    </button>
  );
}

/** Görsel olmayan dosyalar için ikon + uzantı karosu. */
function FileChip({ doc, onClick }: { doc: DocumentItem; onClick: () => void }) {
  return (
    <button
      type="button"
      title={doc.fileName}
      onClick={onClick}
      className="relative size-9 shrink-0 overflow-hidden rounded-md border border-border/60 bg-primary/5 text-primary grid place-items-center transition hover:border-primary/60 hover:shadow-sm"
    >
      <FileText className="size-4" />
      <span className="absolute bottom-0 inset-x-0 bg-primary/85 text-white text-[7px] leading-[10px] text-center truncate px-0.5">
        {extLabel(doc.fileName)}
      </span>
    </button>
  );
}

/**
 * Ortak ek şeridi: karta bağlı dosya/görselleri küçük önizleme karoları olarak
 * gösterir, tıklayınca önizleme açar ve sonuna bir yükleme kontrolü (children)
 * yerleştirir. Kartın kendi onClick/sürükle davranışını tetiklememek için tüm
 * etkileşimlerde propagation durdurulur.
 */
function AttachmentStrip({
  docs,
  onPreview,
  onOverflow,
  children,
}: {
  docs: DocumentItem[];
  onPreview: (doc: DocumentItem) => void;
  onOverflow?: () => void;
  children: React.ReactNode;
}) {
  const shown = docs.slice(0, MAX_THUMBS);
  const extra = docs.length - shown.length;

  return (
    <div
      className="mt-2.5 flex items-center gap-1.5 flex-wrap"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {shown.map((doc) =>
        isImageDoc(doc) && doc.fileId ? (
          <ImageThumb key={doc.id} doc={doc} onClick={() => onPreview(doc)} />
        ) : (
          <FileChip key={doc.id} doc={doc} onClick={() => onPreview(doc)} />
        )
      )}

      {extra > 0 && (
        <button
          type="button"
          title={`${extra} dosya daha`}
          onClick={() => onOverflow?.()}
          className="size-9 shrink-0 rounded-md border border-border/60 bg-muted/40 text-[11px] text-muted-foreground grid place-items-center transition hover:border-primary/60 hover:text-primary"
        >
          +{extra}
        </button>
      )}

      {children}
    </div>
  );
}

/**
 * Satış kanban kartı eki şeridi — yükleme için zengin DocumentUploadDialog
 * (tip seçimi, açıklama) kullanır; karta kilitlidir.
 */
export function KanbanCardAttachments({
  caseId,
  companyId,
  docs,
  onPreview,
  onOpenCase,
}: {
  caseId: string;
  companyId?: string;
  docs: DocumentItem[];
  onPreview: (doc: DocumentItem) => void;
  onOpenCase?: () => void;
}) {
  return (
    <AttachmentStrip docs={docs} onPreview={onPreview} onOverflow={onOpenCase}>
      <DocumentUploadDialog
        defaultSalesCaseId={caseId}
        defaultCompanyId={companyId}
        defaultType="Other"
        trigger={
          <button
            type="button"
            title="Dosya / görsel yükle"
            className="size-9 shrink-0 rounded-md border border-dashed border-border/70 bg-white text-muted-foreground grid place-items-center transition hover:border-primary hover:text-primary"
          >
            {docs.length === 0 ? <Paperclip className="size-4" /> : <Plus className="size-4" />}
          </button>
        }
      />
    </AttachmentStrip>
  );
}

/** Servis talebine (entityType=service_ticket) dosya yükleyen satır içi buton. */
function ServiceUploadButton({ serviceRequestId, hasDocs }: { serviceRequestId: string; hasDocs: boolean }) {
  const { addDocument } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLocaleLowerCase("tr-TR") ?? "";
    const mime = file.type || EXT_TO_MIME[ext];
    if (!EXT_TO_MIME[ext] || !mime) {
      toast.error("Desteklenmeyen dosya tipi", { description: "PDF, DOCX, XLSX, PNG, JPG veya WEBP yükleyebilirsiniz." });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Dosya boyutu 25 MB'ı aşamaz");
      return;
    }

    setBusy(true);
    try {
      const up = await fileService.signedUpload({
        bucket: "erp-service-documents",
        entityType: "service_ticket",
        entityId: serviceRequestId,
        filename: file.name,
        mimeType: mime as any,
        extension: ext as any,
        sizeBytes: file.size,
      });
      const res = await fetch(up.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": mime } });
      if (!res.ok) throw new Error(`Depoya yükleme başarısız (${res.status})`);

      await fileService.link({
        fileId: up.fileId,
        entityType: "service_ticket",
        entityId: serviceRequestId,
        documentTypeCode: "service_document",
      });
      await addDocument({
        id: up.fileId,
        fileId: up.fileId,
        salesCaseId: "",
        serviceRequestId,
        type: "Other",
        fileName: file.name,
        size: formatSize(file.size),
        mimeType: mime,
      });
      toast.success("Dosya yüklendi", { description: file.name });
    } catch (err: any) {
      toast.error("Dosya yüklenemedi", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={onPick} />
      <button
        type="button"
        disabled={busy}
        title="Dosya / görsel yükle"
        onClick={() => inputRef.current?.click()}
        className="size-9 shrink-0 rounded-md border border-dashed border-border/70 bg-white text-muted-foreground grid place-items-center transition hover:border-primary hover:text-primary disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : hasDocs ? <Plus className="size-4" /> : <Paperclip className="size-4" />}
      </button>
    </>
  );
}

/**
 * Servis kanban kartı eki şeridi — yükleme için satır içi dosya seçici kullanır
 * ve dosyayı service_ticket entity'sine bağlar.
 */
export function ServiceCardAttachments({
  serviceRequestId,
  docs,
  onPreview,
  onOpenDetail,
}: {
  serviceRequestId: string;
  docs: DocumentItem[];
  onPreview: (doc: DocumentItem) => void;
  onOpenDetail?: () => void;
}) {
  return (
    <AttachmentStrip docs={docs} onPreview={onPreview} onOverflow={onOpenDetail}>
      <ServiceUploadButton serviceRequestId={serviceRequestId} hasDocs={docs.length > 0} />
    </AttachmentStrip>
  );
}
