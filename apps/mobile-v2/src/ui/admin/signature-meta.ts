/** Uzantı → MIME eşlemesi (web SignatureSettingsCard `SIGNATURE_MIME_BY_EXTENSION`). */
export const SIGNATURE_MIME_BY_EXTENSION = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
} as const;

export type SignatureImageMeta = {
  extension: keyof typeof SIGNATURE_MIME_BY_EXTENSION;
  mimeType: (typeof SIGNATURE_MIME_BY_EXTENSION)[keyof typeof SIGNATURE_MIME_BY_EXTENSION];
};

/** Uzantı desteklenmiyor ya da bildirilen MIME uzantıyla uyuşmuyorsa `null`. */
export function signatureImageMeta(filename: string, declaredMime: string | null): SignatureImageMeta | null {
  const extension = (filename.split('.').pop() ?? '').toLocaleLowerCase('en-US') as keyof typeof SIGNATURE_MIME_BY_EXTENSION;
  const mimeType = SIGNATURE_MIME_BY_EXTENSION[extension];
  if (!mimeType || (declaredMime && declaredMime !== mimeType)) return null;
  return { extension, mimeType };
}

/**
 * Galeri bazen HEIC adlı dosyayı JPEG'e çevirip verir; MIME destekleniyorsa
 * dosya adı uzantısı ona göre düzeltilir, aksi hâlde web kuralı geçerli.
 */
export function normalizeSignatureFile(filename: string, declaredMime: string | null) {
  const direct = signatureImageMeta(filename, declaredMime);
  if (direct) return { filename, meta: direct };
  const fromMime = (Object.entries(SIGNATURE_MIME_BY_EXTENSION) as [SignatureImageMeta['extension'], SignatureImageMeta['mimeType']][])
    .find(([extension, mime]) => mime === declaredMime && extension !== 'jpeg');
  if (!fromMime) return null;
  const base = filename.includes('.') ? filename.slice(0, filename.lastIndexOf('.')) : filename;
  return { filename: `${base || 'imza'}.${fromMime[0]}`, meta: { extension: fromMime[0], mimeType: fromMime[1] } };
}

/** Mail imzası: sunucu `data:image/(png|jpeg|webp);base64,...` biçimini ister. */
export function signatureDataUrl(meta: SignatureImageMeta, base64: string) {
  return `data:${meta.mimeType};base64,${base64.replace(/\s+/g, '')}`;
}

export const SIGNATURE_DIVISION_ALL = '__all__';
