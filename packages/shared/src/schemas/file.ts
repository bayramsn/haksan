import { z } from 'zod';
import { ALLOWED_FILE_EXTENSIONS, ALLOWED_MIME_TYPES, FILE_DOCUMENT_TYPES } from '../constants';

export const signedUploadUrlSchema = z.object({
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
  entityType: z.string().max(64),
  entityId: z.string().max(64),
  filename: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  extension: z.enum(ALLOWED_FILE_EXTENSIONS),
  sizeBytes: z.coerce.number().int().positive(),
});
export type SignedUploadUrlInput = z.infer<typeof signedUploadUrlSchema>;

export const signedDownloadUrlSchema = z.object({
  fileId: z.string().min(1),
});
export type SignedDownloadUrlInput = z.infer<typeof signedDownloadUrlSchema>;

export const fileLinkSchema = z.object({
  fileId: z.string().min(1),
  entityType: z.string().max(64),
  entityId: z.string().max(64),
  documentTypeCode: z.enum(FILE_DOCUMENT_TYPES),
  description: z.string().max(1000).optional(),
});
export type FileLinkInput = z.infer<typeof fileLinkSchema>;
