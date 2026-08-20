import { Module } from '@nestjs/common';
import { AuditService } from '../../shared/database/audit.service';
import { SignatureMediaController } from './signature-media.controller';
import { SignatureMediaService } from './signature-media.service';
import { SignaturesController } from './signatures.controller';
import { SignaturesService } from './signatures.service';

/**
 * Belge imzaları.
 *
 * İki controller bilerek ayrıdır ve aynı modülde durur:
 *  - `SignaturesController`  → /signatures       (AuthGuard + PermissionsGuard)
 *  - `SignatureMediaController` → /signatures/media/:fileId (@Public)
 * Yönetim uçlarının guard'ları controller seviyesindedir; medya ucu auth'suz
 * olmak ZORUNDA olduğu için ayrı bir controller'a alınmıştır — böylece guard
 * kaldırma/ekleme hatası tüm modülü değil tek bir dosyayı etkiler.
 *
 * DB (`DatabaseModule`) ve `StorageService` (`StorageModule`) global modüllerden
 * geldiği için burada ayrıca import edilmez; brand-media ile aynı desen.
 *
 * `SignaturesService` dışa açılır: teklif/proforma/sözleşme modülleri belgeye
 * imza iliştirirken `resolveForDocument` üzerinden kiracı + bölüm + aktiflik
 * doğrulamasını tekrar yazmadan kullanır.
 */
@Module({
  controllers: [SignatureMediaController, SignaturesController],
  providers: [SignaturesService, SignatureMediaService, AuditService],
  exports: [SignaturesService],
})
export class SignaturesModule {}
