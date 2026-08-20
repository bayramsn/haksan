import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { companies } from '../../db/schema/companies';
import { files } from '../../db/schema/files';
import { DB } from '../../shared/database/database.module';
import { StorageService } from '../../shared/storage/storage.service';

const COMPANY_LOGO_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_COMPANY_LOGO_BYTES = 5 * 1024 * 1024;

/** Relative path the frontend resolves against the configured API base. */
export function companyLogoPath(fileId: string): string {
  return `/companies/media/${fileId}`;
}

export interface ResolvedCompanyLogo {
  body: Buffer;
  mimeType: string;
  filename: string;
  sizeBytes: number;
}

/**
 * Public read-through for company logos only. A UUID is streamable when it is
 * in the dedicated public bucket and is the active logo of a live company.
 * Other company documents remain private even when their ids are guessed.
 */
@Injectable()
export class CompanyMediaService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly storage: StorageService,
  ) {}

  async resolvePublicLogo(fileId: string): Promise<ResolvedCompanyLogo | null> {
    const [file] = await this.db
      .select({
        bucket: files.bucket,
        objectKey: files.objectKey,
        originalFilename: files.originalFilename,
        mimeType: files.mimeType,
        sizeBytes: files.sizeBytes,
      })
      .from(files)
      .innerJoin(companies, eq(companies.logoFileId, files.id))
      .where(
        and(
          eq(files.id, fileId),
          eq(files.bucket, 'erp-company-logos'),
          eq(files.visibility, 'public'),
          eq(files.uploadStatus, 'linked'),
          isNull(files.deletedAt),
          isNull(companies.deletedAt),
        ),
      )
      .limit(1);

    if (
      !file
      || !COMPANY_LOGO_MIME_TYPES.has(file.mimeType)
      || file.sizeBytes <= 0
      || file.sizeBytes > MAX_COMPANY_LOGO_BYTES
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
