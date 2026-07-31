import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { files } from '../../db/schema/files';
import { brands } from '../../db/schema/products';
import { DB } from '../../shared/database/database.module';
import { StorageService } from '../../shared/storage/storage.service';

const BRAND_LOGO_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BRAND_LOGO_BYTES = 5 * 1024 * 1024;

/** Relative path the frontend resolves against the configured API base. */
export function brandLogoPath(fileId: string): string {
  return `/brands/media/${fileId}`;
}

export interface ResolvedBrandLogo {
  body: Buffer;
  mimeType: string;
  filename: string;
  sizeBytes: number;
}

/**
 * Public read-through for active brand logos only. Guessing another file UUID
 * never exposes it: the file must be the live brand's selected logo, in the
 * dedicated bucket, linked and within the image allow-list.
 */
@Injectable()
export class BrandMediaService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly storage: StorageService,
  ) {}

  async resolvePublicLogo(fileId: string): Promise<ResolvedBrandLogo | null> {
    const [file] = await this.db
      .select({
        bucket: files.bucket,
        objectKey: files.objectKey,
        originalFilename: files.originalFilename,
        mimeType: files.mimeType,
        sizeBytes: files.sizeBytes,
      })
      .from(files)
      .innerJoin(brands, eq(brands.logoFileId, files.id))
      .where(
        and(
          eq(files.id, fileId),
          eq(files.bucket, 'erp-brand-logos'),
          eq(files.visibility, 'public'),
          eq(files.uploadStatus, 'linked'),
          isNull(files.deletedAt),
          isNull(brands.deletedAt),
        ),
      )
      .limit(1);

    if (
      !file
      || !BRAND_LOGO_MIME_TYPES.has(file.mimeType)
      || file.sizeBytes <= 0
      || file.sizeBytes > MAX_BRAND_LOGO_BYTES
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
