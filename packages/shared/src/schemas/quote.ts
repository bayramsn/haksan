import { z } from 'zod';
import { moneySchema, percentSchema } from './common';

export const quoteCreateSchema = z.object({
  opportunityId: z.string().optional(),
  companyId: z.string().min(1),
  contactId: z.string().optional(),
  documentNo: z.string().max(64).optional(),
  quoteDate: z.coerce.date(),
  validityDays: z.coerce.number().int().min(1).max(365).default(30),
  projectOwnerUserId: z.string().optional(),
  currencyCode: z.string().max(8).default('USD'),
  paymentTerms: z.string().max(2000).optional(),
  deliveryTerms: z.string().max(2000).optional(),
  warrantyTerms: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
});
export type QuoteCreateInput = z.infer<typeof quoteCreateSchema>;

export const quoteUpdateSchema = quoteCreateSchema.partial();
export type QuoteUpdateInput = z.infer<typeof quoteUpdateSchema>;

// Opsiyonel donanım / yedek parça kalemleri için uyumluluk seçimleri (çoklu).
export const quoteItemCompatibilitySchema = z.object({
  machineIds: z.array(z.string()).default([]),
  brands: z.array(z.string()).default([]),
  controlUnits: z.array(z.string()).default([]),
  supplierIds: z.array(z.string()).default([]),
});
export type QuoteItemCompatibility = z.infer<typeof quoteItemCompatibilitySchema>;

export const quoteItemCreateSchema = z.object({
  productModelId: z.string().optional(),
  inventoryItemId: z.string().optional(),
  description: z.string().min(1).max(2000),
  quantity: z.coerce.number().positive().multipleOf(0.001),
  unitCode: z.string().max(16).default('adet'),
  unitPrice: moneySchema,
  discountAmount: moneySchema.default(0),
  vatRate: percentSchema.default(20),
  sortOrder: z.coerce.number().int().default(0),
  compatibility: quoteItemCompatibilitySchema.nullish(),
});
export type QuoteItemCreateInput = z.infer<typeof quoteItemCreateSchema>;

export const quoteItemUpdateSchema = quoteItemCreateSchema.partial();
export type QuoteItemUpdateInput = z.infer<typeof quoteItemUpdateSchema>;

export const quoteTermsUpsertSchema = z.object({
  paymentTermsText: z.string().max(4000).optional(),
  deliveryTermsText: z.string().max(4000).optional(),
  warrantyTermsText: z.string().max(4000).optional(),
  importCostsExcluded: z.boolean().default(true),
  deliveryLocation: z.string().max(255).optional(),
  estimatedDeliveryDaysMin: z.coerce.number().int().nonnegative().optional(),
  estimatedDeliveryDaysMax: z.coerce.number().int().nonnegative().optional(),
});
export type QuoteTermsUpsertInput = z.infer<typeof quoteTermsUpsertSchema>;

export const proformaCreateSchema = z.object({
  quoteId: z.string().min(1),
  documentNo: z.string().min(1).max(64),
  issueDate: z.coerce.date(),
  statusCode: z.string().max(64).default('draft'),
  fileId: z.string().optional(),
});
export type ProformaCreateInput = z.infer<typeof proformaCreateSchema>;

export const proformaUpdateSchema = proformaCreateSchema.partial();
export type ProformaUpdateInput = z.infer<typeof proformaUpdateSchema>;

export const contractCreateSchema = z.object({
  quoteId: z.string().min(1),
  contractNo: z.string().min(1).max(64),
  signedDate: z.coerce.date().optional(),
  statusCode: z.string().max(64).default('draft'),
  fileId: z.string().optional(),
});
export type ContractCreateInput = z.infer<typeof contractCreateSchema>;

export const contractUpdateSchema = contractCreateSchema.partial();
export type ContractUpdateInput = z.infer<typeof contractUpdateSchema>;

export const commercialInvoiceCreateSchema = z.object({
  quoteId: z.string().min(1),
  invoiceNo: z.string().min(1).max(64),
  invoiceDate: z.coerce.date(),
  statusCode: z.string().max(64).default('draft'),
  fileId: z.string().optional(),
});
export type CommercialInvoiceCreateInput = z.infer<typeof commercialInvoiceCreateSchema>;

export const commercialInvoiceUpdateSchema = commercialInvoiceCreateSchema.partial();
export type CommercialInvoiceUpdateInput = z.infer<typeof commercialInvoiceUpdateSchema>;
