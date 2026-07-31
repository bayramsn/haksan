import { describe, expect, it } from 'vitest';
import { companyUpdateSchema, signedUploadUrlSchema } from '@haksan/shared';

const companyId = '00000000-0000-4000-8000-000000000001';

describe('company logo contracts', () => {
  it('accepts a bounded raster logo upload linked to a company', () => {
    const result = signedUploadUrlSchema.safeParse({
      bucket: 'erp-company-logos',
      entityType: 'company',
      entityId: companyId,
      filename: 'logo.png',
      mimeType: 'image/png',
      extension: 'png',
      sizeBytes: 128_000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects oversized or non-image company logo uploads', () => {
    const oversized = signedUploadUrlSchema.safeParse({
      bucket: 'erp-company-logos',
      entityType: 'company',
      entityId: companyId,
      filename: 'logo.png',
      mimeType: 'image/png',
      extension: 'png',
      sizeBytes: 5 * 1024 * 1024 + 1,
    });
    const document = signedUploadUrlSchema.safeParse({
      bucket: 'erp-company-logos',
      entityType: 'company',
      entityId: companyId,
      filename: 'logo.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      sizeBytes: 10_000,
    });
    expect(oversized.success).toBe(false);
    expect(document.success).toBe(false);
  });

  it('allows setting or clearing the active logo by UUID', () => {
    expect(companyUpdateSchema.safeParse({ logoFileId: companyId }).success).toBe(true);
    expect(companyUpdateSchema.safeParse({ logoFileId: null }).success).toBe(true);
    expect(companyUpdateSchema.safeParse({ logoFileId: 'not-a-uuid' }).success).toBe(false);
  });
});
