import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { SIGNATURE_IMAGE_MAX_BYTES, SIGNATURE_IMAGE_MIME_TYPES } from '@haksan/shared';
import type { DbClient } from '../../db/client';
import { fileLinks, files } from '../../db/schema/files';
import { signatures } from '../../db/schema/signatures';
import { DB } from '../../shared/database/database.module';
import { StorageService } from '../../shared/storage/storage.service';

const ALLOWED_MIME_TYPES = new Set<string>(SIGNATURE_IMAGE_MIME_TYPES);

/**
 * `files.id` uuid kolonudur; uuid olmayan bir parametre sorguya girerse Postgres
 * 22P02 ile patlar ve auth'suz uç 404 yerine 500 üretir. Auth'suz bir uçta bunu
 * istemcinin tetikleyebilmesi gereksiz gürültüdür, önce burada elenir.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Frontend'in API tabanına göre çözdüğü göreli yol. */
export function signatureMediaPath(fileId: string): string {
  return `/signatures/media/${fileId}`;
}

export interface ResolvedSignatureImage {
  body: Buffer;
  mimeType: string;
  filename: string;
  sizeBytes: number;
}

/**
 * İmza görselinin auth'suz okuma yolu.
 *
 * NEDEN AUTH'SUZ: teklif/proforma/sözleşme PDF'i `window.open` ile açılan ayrı
 * bir yazdırma penceresinde üretilir ve bu pencere auth çerezini taşımaz. İmza
 * görseli korumalı bir uçtan istenirse baskıda boş çıkar (ürün fotoğraflarında
 * bir kez yaşandı; çözümü public bucket + public uç oldu).
 *
 * GÜVENLİK: rastgele bir dosya UUID'si denemek işe yaramaz. Bayt döndürmek için
 * dosyanın AYNI ANDA şu koşulları sağlaması gerekir:
 *   - CANLI bir imza kaydına bağlanmış olmak: `file_links.entity_type = 'signature'`
 *     VE bağın işaret ettiği imzanın silinmemiş (`deleted_at IS NULL`) ve aktif
 *     (`is_active`) olması,
 *   - bağın ve imzanın aynı kiracıya ait olması,
 *   - `erp-signatures` bucket'ında bulunmak,
 *   - `visibility = 'public'` olmak,
 *   - yüklemesi tamamlanıp bağlanmış olmak (`uploadStatus = 'linked'`),
 *   - izin verilen görsel tipinde ve boyut sınırı içinde olmak.
 * Bu yüzden teklif/sözleşme/gümrük gibi private belgeler bu uçtan sızamaz.
 *
 * İMZA KAYDI NEDEN SORGUYA DAHİL: bu uç auth'suzdur ve bir kişinin ıslak imza
 * görselini yayınlar — yani kişisel veridir. Kaydı silmek ya da pasife almak
 * yöneticinin elindeki TEK geri alma koludur; sorgu imza kaydına bakmazsa bu
 * kolların hiçbiri çalışmaz ve görsel, UUID'yi bilen herkese kalıcı olarak açık
 * kalır. Bedeli bilinçli kabul edildi: pasife alınan/silinen bir imzanın eski
 * belgeleri yeniden basıldığında görsel çıkmaz, ad ve ünvan belgenin kendi
 * `document_snapshot`'ından basılmaya devam eder (bkz. templates.ts — görsel
 * opsiyoneldir). Denetim izi belgenin snapshot'ında durduğu için kaybolan tek
 * şey görseldir.
 *
 * NEDEN `signatures.file_id` DEĞİL DE `file_links`: geçmiş belgeler snapshot'ta
 * kendi bastıkları görselin yolunu taşır. İmzanın görseli sonradan
 * DEĞİŞTİRİLİRSE `signatures.file_id` artık eski dosyayı göstermez; bağ
 * üzerinden çözmek eski PDF'in imzasının kaybolmamasını sağlar. Yani "görsel
 * değişti" durumu tolere edilir, "imza kaydı kalktı" durumu edilmez.
 */
@Injectable()
export class SignatureMediaService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly storage: StorageService,
  ) {}

  async resolvePublicSignature(fileId: string): Promise<ResolvedSignatureImage | null> {
    if (!UUID_RE.test(fileId)) return null;
    const [file] = await this.db
      .select({
        bucket: files.bucket,
        objectKey: files.objectKey,
        originalFilename: files.originalFilename,
        mimeType: files.mimeType,
        sizeBytes: files.sizeBytes,
      })
      .from(files)
      .innerJoin(
        fileLinks,
        and(
          eq(fileLinks.fileId, files.id),
          eq(fileLinks.entityType, 'signature'),
          eq(fileLinks.tenantId, files.tenantId),
        ),
      )
      // Bağın işaret ettiği imza kaydı canlı değilse görsel de sunulmaz.
      .innerJoin(
        signatures,
        and(
          eq(signatures.id, fileLinks.entityId),
          eq(signatures.tenantId, fileLinks.tenantId),
          eq(signatures.isActive, true),
          isNull(signatures.deletedAt),
        ),
      )
      .where(
        and(
          eq(files.id, fileId),
          eq(files.bucket, 'erp-signatures'),
          eq(files.visibility, 'public'),
          eq(files.uploadStatus, 'linked'),
          isNull(files.deletedAt),
        ),
      )
      .limit(1);

    if (
      !file
      || !ALLOWED_MIME_TYPES.has(file.mimeType)
      || file.sizeBytes <= 0
      || file.sizeBytes > SIGNATURE_IMAGE_MAX_BYTES
    ) {
      return null;
    }

    const body = await this.storage.getObject(file.bucket, file.objectKey);
    if (!body) return null;
    return {
      body,
      mimeType: file.mimeType,
      filename: file.originalFilename,
      sizeBytes: file.sizeBytes,
    };
  }
}
