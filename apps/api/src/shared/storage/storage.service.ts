import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
// file-type v16 is CJS; default export is { fromBuffer, ... }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fileType = require('file-type') as { fromBuffer(buf: Buffer): Promise<{ ext: string; mime: string } | undefined> };
import type { StorageProvider, SignedUrlOptions, UploadOptions } from './storage.types';
import { STORAGE_PROVIDER } from './storage.types';
import { ALLOWED_FILE_EXTENSIONS, ALLOWED_MIME_TYPES } from '@haksan/shared';
import { ValidationError } from '../utils/errors';
import { loadEnv } from '../../config/env';
import { buildObjectKey, sanitizeFilename, tenantFromObjectKey } from './object-key';

/**
 * Façade over a StorageProvider. Centralizes:
 *  - object key construction (tenant-scoped)
 *  - MIME / extension validation
 *  - file size cap from env
 *  - signed URL TTL clamp
 *  - tenant ownership check (signed URL refuses cross-tenant)
 */
@Injectable()
export class StorageService {
  private env = loadEnv();

  constructor(@Inject(STORAGE_PROVIDER) public readonly provider: StorageProvider) {}

  validateUploadIntent(opts: { filename: string; mimeType: string; extension: string; sizeBytes: number }): void {
    if (!ALLOWED_MIME_TYPES.includes(opts.mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
      throw new ValidationError(`İzin verilmeyen MIME türü: ${opts.mimeType}`);
    }
    if (!ALLOWED_FILE_EXTENSIONS.includes(opts.extension.toLowerCase() as (typeof ALLOWED_FILE_EXTENSIONS)[number])) {
      throw new ValidationError(`İzin verilmeyen dosya uzantısı: ${opts.extension}`);
    }
    const maxBytes = this.env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    if (opts.sizeBytes > maxBytes) {
      throw new ValidationError(`Dosya çok büyük. Maks. ${this.env.MAX_UPLOAD_SIZE_MB} MB`);
    }
    if (opts.sizeBytes <= 0) {
      throw new ValidationError('Dosya boyutu sıfır olamaz');
    }
  }

  async validateActualFile(buf: Buffer): Promise<void> {
    const detected = await fileType.fromBuffer(buf);
    if (!detected) throw new ValidationError('Dosya türü tespit edilemedi (magic byte uyumsuz)');
    if (!ALLOWED_MIME_TYPES.includes(detected.mime as (typeof ALLOWED_MIME_TYPES)[number])) {
      throw new ValidationError(`Magic-byte ile tespit edilen tür reddedildi: ${detected.mime}`);
    }
  }

  buildKey(opts: { tenantId: string; entityType: string; entityId: string; filename: string }): string {
    return buildObjectKey({
      tenantId: opts.tenantId,
      entityType: opts.entityType,
      entityId: opts.entityId,
      filename: sanitizeFilename(opts.filename),
    });
  }

  async getSignedUploadUrl(opts: SignedUrlOptions): Promise<string> {
    return this.provider.getSignedUploadUrl({
      ...opts,
      expiresInSeconds: Math.min(opts.expiresInSeconds ?? this.env.SIGNED_URL_EXPIRE_SECONDS, 3600),
    });
  }

  async getSignedDownloadUrl(opts: SignedUrlOptions & { actorTenantId: string }): Promise<string> {
    const ownerTenant = tenantFromObjectKey(opts.objectKey);
    if (ownerTenant && ownerTenant !== opts.actorTenantId) {
      throw new ValidationError('Bu dosyaya erişim yetkiniz yok');
    }
    return this.provider.getSignedDownloadUrl({
      ...opts,
      expiresInSeconds: Math.min(opts.expiresInSeconds ?? this.env.SIGNED_URL_EXPIRE_SECONDS, 3600),
    });
  }

  async uploadFile(opts: UploadOptions): Promise<void> {
    return this.provider.uploadFile(opts);
  }

  async getObject(bucket: string, objectKey: string): Promise<Buffer | null> {
    return this.provider.getObject(bucket, objectKey);
  }

  async deleteFile(bucket: string, objectKey: string): Promise<void> {
    return this.provider.deleteFile(bucket, objectKey);
  }

  async getFileMetadata(bucket: string, objectKey: string) {
    return this.provider.getFileMetadata(bucket, objectKey);
  }

  calculateChecksum(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
  }
}
