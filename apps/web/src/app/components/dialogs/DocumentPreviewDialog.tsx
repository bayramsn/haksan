import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { fileService } from "../../../lib/services";
import type { DocumentItem } from "../../lib/mock";

/**
 * Doküman önizleme pop-up'ı — imzalı (signed) URL ile.
 * - PDF  → iframe içinde gömülü önizleme
 * - Görsel → img
 * - Diğer → indir butonu
 * fileId yoksa (yalnızca meta kayıt) bilgilendirme gösterir.
 */
export function DocumentPreviewDialog({
  doc,
  onClose,
}: {
  doc: DocumentItem | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [mime, setMime] = useState("");
  const [filename, setFilename] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setError(null);
    setMime("");
    setFilename("");
    if (!doc) return;
    if (!doc.fileId) {
      setError("Bu kayıt yalnızca meta veridir; yüklenmiş bir dosya yok.");
      return;
    }
    setLoading(true);
    fileService
      .signedDownload(doc.fileId)
      .then((s) => {
        if (!alive) return;
        setUrl(s.downloadUrl);
        setMime(s.mimeType || doc.mimeType || "");
        setFilename(s.filename || doc.fileName);
      })
      .catch((e: any) => {
        if (alive) setError(e?.message ?? "Önizleme alınamadı.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [doc]);

  const name = doc?.fileName ?? "";
  const isPdf = mime.includes("pdf") || name.toLowerCase().endsWith(".pdf");
  const isImage = mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name);

  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || name || "dokuman";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(960px,calc(100vw-2rem))] max-w-none sm:max-w-none max-h-[92dvh] overflow-hidden p-0 gap-0 flex flex-col">
        {doc && (
          <>
            <DialogHeader className="border-b border-border/60 px-5 pt-5 pb-4 pr-12">
              <DialogTitle className="flex items-center gap-2 min-w-0">
                <FileText className="size-5 text-primary shrink-0" />
                <span className="truncate">{doc.fileName}</span>
              </DialogTitle>
              <DialogDescription>
                {doc.type}
                {doc.size ? ` · ${doc.size}` : ""}
                {doc.uploadedAt ? ` · ${doc.uploadedAt}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 min-h-0 overflow-auto bg-muted/30 grid place-items-center p-3" style={{ minHeight: "55vh" }}>
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Önizleme yükleniyor…
                </div>
              )}
              {!loading && error && (
                <div className="text-center text-sm text-muted-foreground max-w-sm px-4">{error}</div>
              )}
              {!loading && !error && url && isPdf && (
                <iframe title={doc.fileName} src={url} className="w-full h-[72vh] rounded-md border border-border/60 bg-white" />
              )}
              {!loading && !error && url && isImage && (
                <img src={url} alt={doc.fileName} className="max-w-full max-h-[72vh] rounded-md object-contain shadow-sm" />
              )}
              {!loading && !error && url && !isPdf && !isImage && (
                <div className="text-center space-y-3">
                  <FileText className="size-12 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Bu dosya türü tarayıcıda önizlenemiyor.
                    <br />
                    İndirerek görüntüleyebilirsiniz.
                  </p>
                  <Button onClick={download} className="gap-1"><Download className="size-4" /> İndir</Button>
                </div>
              )}
            </div>

            <DialogFooter className="border-t border-border/60 bg-muted/20 px-5 py-4 gap-2 sm:justify-between">
              <div className="flex gap-2">
                <Button variant="outline" className="gap-1" onClick={download} disabled={!url}>
                  <Download className="size-4" /> İndir
                </Button>
                {url && (
                  <Button variant="outline" className="gap-1" onClick={() => window.open(url, "_blank", "noopener")}>
                    <ExternalLink className="size-4" /> Yeni sekme
                  </Button>
                )}
              </div>
              <Button variant="outline" onClick={onClose}>Kapat</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
