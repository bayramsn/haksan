import { z } from 'zod';

/**
 * Belge imzası: teklif / proforma / sözleşme çıktısının altına basılan
 * ad + ünvan + (opsiyonel) imza görseli.
 *
 * Görsel akışı marka logosuyla aynıdır:
 *   1) POST /files/signed-upload-url  → bucket 'erp-signatures', entityType 'signature',
 *      entityId = mevcut imza id'si veya yeni kayıt için 'new'
 *   2) PUT  /files/:fileId/content    → görsel baytları
 *   3) POST|PATCH /signatures         → `fileId` ile imzaya bağla
 * Bağlama sırasında API dosyayı imzaya `file_links` üzerinden bağlar ve
 * `uploadStatus`'ü 'linked' yapar; istemcinin ayrıca /files/link çağırması gerekmez.
 */

/**
 * İmza görseli için kabul edilen tipler ve üst sınır.
 *
 * 2 MB: imza taraması tek renkli, birkaç yüz piksellik küçük bir görseldir;
 * 2 MB, 300 dpi'lık bir A5 taramasını bile rahatça alır. Sınırın düşük
 * tutulmasının nedeni bu görselin PDF penceresinde yazdırma anında,
 * senkron biçimde indirilmesi: büyük dosya doğrudan baskı gecikmesi demektir.
 * Ayrıca auth'suz sunulan bir uçtan servis edildiği için bant genişliği
 * suistimalini de sınırlar.
 */
export const SIGNATURE_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const SIGNATURE_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const;
export const SIGNATURE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const signatureFields = z.object({
  name: z.string().trim().min(1, 'Ad zorunludur').max(255),
  title: z.string().trim().min(1, 'Ünvan zorunludur').max(255),
  /**
   * Bölüm ataması. `null` / gönderilmemiş → "Tümü": her bölümün belgesinde
   * seçilebilir. Dolu ise imza yalnızca o bölümün belgelerinde görünür.
   */
  divisionId: z.string().uuid().nullish(),
  /** Yüklenmiş imza görselinin dosya kimliği. `null` → görseli kaldır. */
  fileId: z.string().uuid().nullish(),
  isActive: z.boolean().default(true),
});

export const signatureCreateSchema = signatureFields;
export type SignatureCreateInput = z.infer<typeof signatureCreateSchema>;

export const signatureUpdateSchema = signatureFields.partial();
export type SignatureUpdateInput = z.infer<typeof signatureUpdateSchema>;

export const signatureListQuerySchema = z.object({
  /** Varsayılan olarak yalnızca aktif imzalar döner; ayar ekranı `false` gönderir. */
  activeOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .optional(),
});
export type SignatureListQuery = z.infer<typeof signatureListQuerySchema>;

/** Liste/detay uçlarının döndürdüğü imza görünümü. */
export interface SignatureView {
  id: string;
  name: string;
  title: string;
  divisionId: string | null;
  fileId: string | null;
  /**
   * Auth'suz erişilebilen göreli yol (`/signatures/media/:fileId`); istemci bunu
   * API tabanına göre çözer. Görsel yoksa `null`.
   */
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Belgenin `documentSnapshot.signature` alanına gömülen imza kopyası.
 *
 * Denetim gereği: imza kaydı sonradan değişse veya silinse bile belge kendi
 * basıldığı imzayı korur. Yazdırma katmanı canlı imzaya değil bu bloğa bakar.
 */
export interface DocumentSignatureSnapshot {
  /** Anlık görüntü alındığı andaki imza kaydının kimliği (kayıt silinmiş olabilir). */
  id: string;
  name: string;
  title: string;
  fileId: string | null;
  /** `/signatures/media/:fileId` — görsel yoksa `null`. */
  imageUrl: string | null;
  capturedAt: string;
}

/**
 * Belge oluşturma/güncelleme gövdelerine eklenen imza seçimi.
 * `null` → imzayı kaldır, gönderilmedi → mevcut imza korunur.
 */
export const documentSignatureSelectionSchema = z.object({
  signatureId: z.string().uuid().nullish(),
});
