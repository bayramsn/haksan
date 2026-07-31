import { describe, expect, it } from 'vitest';
import { brandCreateSchema, fileLinkSchema, signedUploadUrlSchema } from '@haksan/shared';

const brandId = '00000000-0000-4000-8000-000000000010';
const companyId = '00000000-0000-4000-8000-000000000020';

describe('brand management contracts', () => {
  it('accepts a bounded raster logo upload linked to a brand', () => {
    expect(signedUploadUrlSchema.safeParse({
      bucket: 'erp-brand-logos',
      entityType: 'brand',
      entityId: brandId,
      filename: 'haxan.webp',
      mimeType: 'image/webp',
      extension: 'webp',
      sizeBytes: 128_000,
    }).success).toBe(true);

    expect(fileLinkSchema.safeParse({
      fileId: companyId,
      entityType: 'brand',
      entityId: brandId,
      documentTypeCode: 'brand_logo',
    }).success).toBe(true);
  });

  it('rejects oversized, non-image or wrongly targeted brand logos', () => {
    const base = {
      bucket: 'erp-brand-logos',
      entityType: 'brand',
      entityId: brandId,
      filename: 'logo.png',
      mimeType: 'image/png',
      extension: 'png',
      sizeBytes: 10_000,
    } as const;
    expect(signedUploadUrlSchema.safeParse({ ...base, sizeBytes: 5 * 1024 * 1024 + 1 }).success).toBe(false);
    expect(signedUploadUrlSchema.safeParse({
      ...base,
      filename: 'logo.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
    }).success).toBe(false);
    expect(signedUploadUrlSchema.safeParse({ ...base, entityType: 'company' }).success).toBe(false);
  });

  it('accepts own-brand and customer-company metadata', () => {
    expect(brandCreateSchema.safeParse({ name: 'HAXAN', isOwned: true }).success).toBe(true);
    expect(brandCreateSchema.safeParse({
      name: 'Partner Marka',
      companyId,
      isOwned: false,
      divisionId: brandId,
    }).success).toBe(true);
  });
});
