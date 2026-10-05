import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Images, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { fileService, tradeFairService, type TradeFairPhotoDTO } from "../../../lib/services";

const PAGE_SIZE = 24;

function Photo({ fileId, alt, className }: { fileId: string; alt: string; className: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | undefined;
    setUrl(null);
    setFailed(false);
    fileService.imagePreview(fileId)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [fileId]);

  if (failed) return <span className="px-4 text-center text-xs text-muted-foreground">Fotoğraf açılamadı</span>;
  if (!url) return <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Fotoğraf yükleniyor" />;
  return <img src={url} alt={alt} className={className} loading="lazy" onError={() => setFailed(true)} />;
}

export function TradeFairPhotoGallery({ fairName, q, refreshKey }: { fairName?: string; q: string; refreshKey: number }) {
  const [photos, setPhotos] = useState<TradeFairPhotoDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const requestSeq = useRef(0);

  const loadPage = useCallback(async (nextPage: number): Promise<boolean> => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(false);
    try {
      const result = await tradeFairService.photos({ fairName, q: q.trim() || undefined, page: nextPage, pageSize: PAGE_SIZE });
      if (seq !== requestSeq.current) return false;
      setPhotos((current) => nextPage === 1 ? result.data : [...current, ...result.data]);
      setTotal(result.meta.total);
      setPage(nextPage);
      return true;
    } catch {
      if (seq === requestSeq.current) setError(true);
      return false;
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [fairName, q]);

  useEffect(() => {
    ++requestSeq.current;
    setPhotos([]);
    setTotal(0);
    setPage(0);
    setSelectedIndex(null);
    setLoading(true);
    const timer = window.setTimeout(() => void loadPage(1), q ? 250 : 0);
    return () => { window.clearTimeout(timer); ++requestSeq.current; };
  }, [loadPage, refreshKey]);

  const selected = selectedIndex === null ? null : photos[selectedIndex] ?? null;
  const showNext = useCallback(async () => {
    if (selectedIndex === null) return;
    if (selectedIndex + 1 < photos.length) {
      setSelectedIndex(selectedIndex + 1);
    } else if (!loading && photos.length < total && await loadPage(page + 1)) {
      setSelectedIndex(photos.length);
    }
  }, [selectedIndex, photos.length, total, loading, loadPage, page]);
  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") setSelectedIndex((index) => index === null ? null : Math.max(0, index - 1));
      if (event.key === "ArrowRight") void showNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, showNext]);

  return (
    <section aria-label="Fuar fotoğraf galerisi" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold"><Images className="size-5 text-primary" /> Fotoğraf galerisi</h2>
          <p className="text-xs text-muted-foreground">{fairName ?? "Tüm fuarlar"} · {total} fotoğraf</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
          Fotoğraflar yüklenemedi. <Button variant="link" className="h-auto p-0" onClick={() => void loadPage(photos.length ? page + 1 : 1)}>Tekrar dene</Button>
        </div>
      )}
      {loading && photos.length === 0 ? (
        <div className="grid place-items-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : !error && photos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Images className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">Henüz fotoğraf yok</p>
          <p className="mt-1 text-sm text-muted-foreground">Görüşme kartından fotoğraf eklediğinizde burada görünür.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {photos.map((photo, index) => (
              <button
                key={photo.fileId}
                type="button"
                onClick={() => setSelectedIndex(index)}
                aria-label={`${photo.filename} fotoğrafını aç, ${photo.companyName} ${photo.contactName}`}
                className="group overflow-hidden rounded-xl border border-border/70 bg-white text-left shadow-xs transition hover:border-primary/60 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="grid aspect-square place-items-center overflow-hidden bg-muted/40">
                  <Photo fileId={photo.fileId} alt={photo.filename} className="size-full object-cover transition duration-200 group-hover:scale-105" />
                </span>
                <span className="block min-w-0 p-2.5">
                  <span className="block truncate text-xs font-semibold" title={photo.companyName}>{photo.companyName}</span>
                  <span className="block truncate text-[11px] text-muted-foreground" title={photo.contactName}>{photo.contactName}</span>
                  {!fairName && <span className="block truncate text-[10px] text-muted-foreground" title={photo.fairName}>{photo.fairName}</span>}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{photos.length} / {total} fotoğraf</span>
            {photos.length < total && <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadPage(page + 1)}>{loading ? <Loader2 className="size-4 animate-spin" /> : "Daha fazla yükle"}</Button>}
          </div>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelectedIndex(null); }}>
        <DialogContent className="max-h-[95dvh] max-w-[min(96vw,1100px)] overflow-hidden p-3 sm:p-5">
          {selected && (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="truncate text-sm">{selected.filename}</DialogTitle>
                <DialogDescription className="truncate">{selected.fairName} · {selected.companyName} · {selected.contactName}</DialogDescription>
              </DialogHeader>
              <div className="grid min-h-56 place-items-center overflow-hidden rounded-lg bg-slate-950">
                <Photo fileId={selected.fileId} alt={selected.filename} className="max-h-[72dvh] max-w-full object-contain" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" size="sm" disabled={selectedIndex === 0} onClick={() => setSelectedIndex((index) => index === null ? null : index - 1)} aria-label="Önceki fotoğraf"><ChevronLeft className="size-4" /> Önceki</Button>
                <span className="text-xs text-muted-foreground">{(selectedIndex ?? 0) + 1} / {total}</span>
                <Button variant="outline" size="sm" disabled={loading || (selectedIndex === photos.length - 1 && photos.length >= total)} onClick={() => void showNext()} aria-label="Sonraki fotoğraf">{loading ? "Yükleniyor" : "Sonraki"} <ChevronRight className="size-4" /></Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
