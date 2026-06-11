import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { files, fileLinks } from '../../db/schema/files';
import { fileDocumentTypes, storageProviders } from '../../db/schema/lookup';
import { DB } from '../../shared/database/database.module';
import { StorageService } from '../../shared/storage/storage.service';
import { NotFoundError, ValidationError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import { loadEnv } from '../../config/env';
import type { SignedUploadUrlInput, FileLinkInput, SignedDownloadUrlInput } from '@haksan/shared';
import { AuditService } from '../../shared/database/audit.service';

@Injectable()
export class FilesService {
  private env = loadEnv();

  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly storage: StorageService,
    private readonly audit: AuditService
  ) {}

  async createSignedUploadUrl(input: SignedUploadUrlInput, actor: AuthContext) {
    this.storage.validateUploadIntent({
      filename: input.filename,
      mimeType: input.mimeType,
      extension: input.extension,
      sizeBytes: input.sizeBytes,
    });
    const objectKey = this.storage.buildKey({
      tenantId: actor.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      filename: input.filename,
    });
    const url = await this.storage.getSignedUploadUrl({
      bucket: input.bucket,
      objectKey,
      mimeType: input.mimeType,
      contentLength: input.sizeBytes,
    });

    // Pre-register file metadata (caller will confirm + link via /files/link)
    const provider = await this.db.query.storageProviders.findFirst({
      where: eq(storageProviders.code, this.env.S3_PROVIDER),
    });
    const [file] = await this.db
      .insert(files)
      .values({
        tenantId: actor.tenantId,
        bucket: input.bucket,
        objectKey,
        originalFilename: input.filename,
        mimeType: input.mimeType,
        extension: input.extension,
        sizeBytes: input.sizeBytes,
        storageProviderId: provider?.id ?? null,
        visibility: 'private',
        uploadedBy: actor.userId,
      })
      .returning();
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'file.signed_upload_url',
      resourceType: 'file',
      resourceId: file.id,
      newValues: { bucket: input.bucket, objectKey, sizeBytes: input.sizeBytes },
    });
    return {
      fileId: file.id,
      bucket: input.bucket,
      objectKey,
      uploadUrl: url,
      expiresInSeconds: this.env.SIGNED_URL_EXPIRE_SECONDS,
    };
  }

  async createSignedDownloadUrl(input: SignedDownloadUrlInput, actor: AuthContext) {
    const file = await this.db.query.files.findFirst({
      where: and(eq(files.id, input.fileId), eq(files.tenantId, actor.tenantId)),
    });
    if (!file || file.deletedAt) throw new NotFoundError('Dosya');
    const url = await this.storage.getSignedDownloadUrl({
      actorTenantId: actor.tenantId,
      bucket: file.bucket,
      objectKey: file.objectKey,
    });
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'file.signed_download_url',
      resourceType: 'file',
      resourceId: file.id,
    });
    return { downloadUrl: url, filename: file.originalFilename, mimeType: file.mimeType };
  }

  async linkFile(input: FileLinkInput, actor: AuthContext) {
    const file = await this.db.query.files.findFirst({
      where: and(eq(files.id, input.fileId), eq(files.tenantId, actor.tenantId)),
    });
    if (!file || file.deletedAt) throw new NotFoundError('Dosya');
    const docType = await this.db.query.fileDocumentTypes.findFirst({
      where: eq(fileDocumentTypes.code, input.documentTypeCode),
    });
    if (!docType) throw new ValidationError(`Bilinmeyen doküman türü: ${input.documentTypeCode}`);
    const [link] = await this.db
      .insert(fileLinks)
      .values({
        tenantId: actor.tenantId,
        fileId: file.id,
        entityType: input.entityType,
        entityId: input.entityId,
        documentTypeId: docType.id,
        description: input.description ?? null,
      })
      .returning();
    return link;
  }

  async delete(fileId: string, actor: AuthContext): Promise<void> {
    const file = await this.db.query.files.findFirst({
      where: and(eq(files.id, fileId), eq(files.tenantId, actor.tenantId)),
    });
    if (!file || file.deletedAt) throw new NotFoundError('Dosya');
    await this.db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, fileId));
    // Soft delete only — physical object remains; lifecycle policy can sweep later.
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'file.deleted',
      resourceType: 'file',
      resourceId: file.id,
    });
  }
}
