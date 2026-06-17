import { fileService } from "../../lib/services";

/**
 * Küçük bir imzalı-URL önbelleği. Kanban kartlarındaki görsel önizlemeleri
 * her yeniden render'da (sürükleme, store güncellemesi vb.) yeniden çekmemek
 * için kullanılır. İmzalı URL'ler süreli olduğundan TTL ile yenilenir.
 */
export type SignedFile = {
  url: string;
  mimeType: string;
  filename: string;
  fetchedAt: number;
};

// İmzalı URL'ler genelde ~15 dk geçerli; biraz erken yenileyerek 404 riskini önle.
const TTL_MS = 10 * 60 * 1000;

const resolved = new Map<string, SignedFile>();
const inflight = new Map<string, Promise<SignedFile>>();

export function getSignedFile(fileId: string): Promise<SignedFile> {
  const cached = resolved.get(fileId);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return Promise.resolve(cached);
  }
  const pending = inflight.get(fileId);
  if (pending) return pending;

  const promise = fileService
    .signedDownload(fileId)
    .then((s) => {
      const entry: SignedFile = {
        url: s.downloadUrl,
        mimeType: s.mimeType,
        filename: s.filename,
        fetchedAt: Date.now(),
      };
      resolved.set(fileId, entry);
      inflight.delete(fileId);
      return entry;
    })
    .catch((err) => {
      inflight.delete(fileId);
      throw err;
    });

  inflight.set(fileId, promise);
  return promise;
}
