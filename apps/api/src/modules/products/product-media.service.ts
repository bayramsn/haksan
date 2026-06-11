import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { files, fileLinks } from '../../db/schema/files';
import { productMedia, productModels } from '../../db/schema/products';
import { DB } from '../../shared/database/database.module';
import { StorageService } from '../../shared/storage/storage.service';
import { NotFoundError } from '../../shared/utils/errors';

/** Relative path the frontend resolves against the API base. */
export function productMediaPath(fileId: string): string {
  return `/products/media/${fileId}`;
}

export interface ProductMediaItem {
  fileId: string;
  mediaType: 'image' | 'document';
  title: string | null;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export interface ResolvedPublicMedia {
  body: Buffer;
  mimeType: string;
  filename: string;
  sizeBytes: number;
}

/**
 * Read side of product blobs stored in object storage.
 *
 * Two access paths with deliberately different trust levels:
 *  - `listForProduct` is tenant-scoped and meant to sit behind the auth guard.
 *  - `resolvePublicMedia` streams bytes WITHOUT auth, but only for files that
 *    were explicitly marked `visibility = 'public'` AND are linked to a product
 *    (via product_media or a product file_link). Everything else 404s, so
 *    private documents (quotes, contracts, customs papers) can never leak here.
 */
@Injectable()
export class ProductMediaService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly storage: StorageService
  ) {}

  async listForProduct(productId: string, tenantId: string): Promise<ProductMediaItem[]> {
    const imageRows = await this.db
      .select({
        fileId: files.id,
        title: productMedia.title,
        mimeType: files.mimeType,
        sizeBytes: files.sizeBytes,
        sortOrder: productMedia.sortOrder,
        deletedAt: files.deletedAt,
      })
      .from(productMedia)
      .innerJoin(files, eq(productMedia.fileId, files.id))
      .where(and(eq(productMedia.productModelId, productId), eq(productMedia.tenantId, tenantId)));

    const docRows = await this.db
      .select({
        fileId: files.id,
        title: files.originalFilename,
        mimeType: files.mimeType,
        sizeBytes: files.sizeBytes,
        deletedAt: files.deletedAt,
      })
      .from(fileLinks)
      .innerJoin(files, eq(fileLinks.fileId, files.id))
      .where(
        and(
          eq(fileLinks.entityType, 'product_model'),
          eq(fileLinks.entityId, productId),
          eq(fileLinks.tenantId, tenantId)
        )
      );

    const items: ProductMediaItem[] = [];
    for (const r of imageRows) {
      if (r.deletedAt) continue;
      items.push({
        fileId: r.fileId,
        mediaType: 'image',
        title: r.title,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        url: productMediaPath(r.fileId),
      });
    }
    for (const r of docRows) {
      if (r.deletedAt) continue;
      items.push({
        fileId: r.fileId,
        mediaType: 'document',
        title: r.title,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        url: productMediaPath(r.fileId),
      });
    }
    return items;
  }

  /**
   * Resolve a publicly-served product blob. Returns null when the file is not
   * public, soft-deleted, or not actually attached to a product — so the caller
   * can answer 404 without revealing whether the id exists.
   */
  async resolvePublicMedia(fileId: string): Promise<ResolvedPublicMedia | null> {
    const file = await this.db.query.files.findFirst({
      where: and(eq(files.id, fileId), eq(files.visibility, 'public'), isNull(files.deletedAt)),
    });
    if (!file) return null;

    // Confirm the file is genuinely a product asset (not just any public file).
    const linkedAsMedia = await this.db.query.productMedia.findFirst({
      where: eq(productMedia.fileId, fileId),
    });
    let linkedAsDoc = false;
    if (!linkedAsMedia) {
      const docLink = await this.db.query.fileLinks.findFirst({
        where: and(eq(fileLinks.fileId, fileId), eq(fileLinks.entityType, 'product_model')),
      });
      linkedAsDoc = Boolean(docLink);
    }
    if (!linkedAsMedia && !linkedAsDoc) return null;

    const body = await this.storage.getObject(file.bucket, file.objectKey);
    if (!body) return null;

    return {
      body,
      mimeType: file.mimeType,
      filename: file.originalFilename,
      sizeBytes: file.sizeBytes,
    };
  }

  async assertProductExists(productId: string, tenantId: string): Promise<void> {
    const row = await this.db.query.productModels.findFirst({
      where: and(eq(productModels.id, productId), eq(productModels.tenantId, tenantId), isNull(productModels.deletedAt)),
    });
    if (!row) throw new NotFoundError('Ürün');
  }
}
