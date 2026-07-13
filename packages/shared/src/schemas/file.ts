import { z } from 'zod';
import { ALLOWED_FILE_EXTENSIONS, ALLOWED_MIME_TYPES, FILE_DOCUMENT_TYPES } from '../constants';

// Files are polymorphically attached, so accepted targets must be explicit.
// Upload-only targets are intentionally separate from targets that callers can
// link directly; chat messages and product drafts are bound by their owning
// domain services to preserve their transaction and ownership invariants.
export const FILE_UPLOAD_ENTITY_TYPES = [
  'company',
  'opportunity',
  'sales_activity',
  'service_ticket',
  'service_complaint_intake',
  'customer_device',
  'product',
  'product_model',
  'quote',
  'chat_conversation',
  'product_draft',
] as const;
export type FileUploadEntityType = (typeof FILE_UPLOAD_ENTITY_TYPES)[number];

export const FILE_LINK_ENTITY_TYPES = [
  'company',
  'opportunity',
  'sales_activity',
  'service_ticket',
  'service_complaint_intake',
  'customer_device',
  'product_model',
  'quote',
] as const;
export type FileLinkEntityType = (typeof FILE_LINK_ENTITY_TYPES)[number];

export const FILE_READABLE_ENTITY_TYPES = [...FILE_LINK_ENTITY_TYPES, 'chat_message'] as const;

const uuidSchema = z.string().uuid();

export const signedUploadUrlBaseSchema = z.object({
  bucket: z.enum([
    'erp-product-images',
    'erp-quote-documents',
    'erp-proforma-documents',
    'erp-contract-documents',
    'erp-invoice-documents',
    'erp-stock-documents',
    'erp-service-documents',
    'erp-import-raw',
  ]),
  entityType: z.enum(FILE_UPLOAD_ENTITY_TYPES),
  entityId: z.string().min(1).max(64),
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  extension: z.enum(ALLOWED_FILE_EXTENSIONS),
  sizeBytes: z.coerce.number().int().positive(),
});

export const signedUploadUrlSchema = signedUploadUrlBaseSchema.superRefine((input, ctx) => {
  if (input.entityType === 'product_draft') {
    if (input.entityId !== 'new') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entityId'], message: 'Yeni ürün görseli hedefi "new" olmalıdır' });
    }
    if (input.bucket !== 'erp-product-images') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bucket'], message: 'Yeni ürün görselleri ürün görseli bucket\'ına yüklenmelidir' });
    }
    return;
  }

  if (!uuidSchema.safeParse(input.entityId).success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entityId'], message: 'Geçerli bir kayıt kimliği gerekli' });
  }
  if (input.entityType === 'chat_conversation' && input.bucket !== 'erp-service-documents') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bucket'], message: 'Sohbet ekleri servis dokümanı bucket\'ına yüklenmelidir' });
  }
});
export type SignedUploadUrlInput = z.infer<typeof signedUploadUrlSchema>;

export const signedDownloadUrlSchema = z.object({
  fileId: uuidSchema,
});
export type SignedDownloadUrlInput = z.infer<typeof signedDownloadUrlSchema>;

export const fileLinkSchema = z.object({
  fileId: uuidSchema,
  entityType: z.enum(FILE_LINK_ENTITY_TYPES),
  entityId: uuidSchema,
  documentTypeCode: z.enum(FILE_DOCUMENT_TYPES),
  description: z.string().trim().max(1000).optional(),
});
export type FileLinkInput = z.infer<typeof fileLinkSchema>;
