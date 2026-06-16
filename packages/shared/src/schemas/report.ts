import { z } from 'zod';

export const exportOpportunityQuerySchema = z.object({
  search: z.string().optional(),
  stageCode: z.string().optional(),
  companyId: z.string().uuid().optional(),
});
export type ExportOpportunityQuery = z.infer<typeof exportOpportunityQuerySchema>;

export const exportQuoteQuerySchema = z.object({
  search: z.string().optional(),
  statusCode: z.string().optional(),
  companyId: z.string().uuid().optional(),
});
export type ExportQuoteQuery = z.infer<typeof exportQuoteQuerySchema>;

export const exportContactQuerySchema = z.object({
  search: z.string().optional(),
  companyId: z.string().uuid().optional(),
});
export type ExportContactQuery = z.infer<typeof exportContactQuerySchema>;

export const exportInventoryQuerySchema = z.object({
  search: z.string().optional(),
  statusCode: z.string().optional(),
});
export type ExportInventoryQuery = z.infer<typeof exportInventoryQuerySchema>;

export const exportPurchaseOrderQuerySchema = z.object({
  search: z.string().optional(),
  supplierCompanyId: z.string().uuid().optional(),
  statusCode: z.string().optional(),
});
export type ExportPurchaseOrderQuery = z.infer<typeof exportPurchaseOrderQuerySchema>;

export const exportOperationalQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()),
  period: z.enum(['monthly', 'yearly']).default('monthly'),
});
export type ExportOperationalQuery = z.infer<typeof exportOperationalQuerySchema>;

export const exportStatementQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  format: z.enum(['xlsx', 'pdf']).default('xlsx'),
});
export type ExportStatementQuery = z.infer<typeof exportStatementQuerySchema>;
