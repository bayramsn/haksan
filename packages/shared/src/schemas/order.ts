import { z } from 'zod';
import { moneySchema, percentSchema } from './common';

const orderItemBaseSchema = z.object({
  productModelId: z.string().optional(),
  inventoryItemId: z.string().optional(),
  description: z.string().min(1).max(2000),
  quantity: z.coerce.number().positive().multipleOf(0.001),
  unitCode: z.string().max(16).default('adet'),
  unitPrice: moneySchema,
  discountAmount: moneySchema.default(0),
  vatRate: percentSchema.default(20),
  sortOrder: z.coerce.number().int().default(0),
});

export const salesOrderCreateSchema = z.object({
  quoteId: z.string().optional(),
  opportunityId: z.string().optional(),
  companyId: z.string().min(1),
  contactId: z.string().optional(),
  orderNo: z.string().max(64).optional(),
  orderDate: z.coerce.date(),
  currencyCode: z.string().max(8).default('USD'),
  notes: z.string().max(4000).optional(),
});
export type SalesOrderCreateInput = z.infer<typeof salesOrderCreateSchema>;

export const salesOrderUpdateSchema = salesOrderCreateSchema.partial();
export type SalesOrderUpdateInput = z.infer<typeof salesOrderUpdateSchema>;

export const salesOrderItemCreateSchema = orderItemBaseSchema.extend({
  quoteItemId: z.string().optional(),
});
export type SalesOrderItemCreateInput = z.infer<typeof salesOrderItemCreateSchema>;

export const salesOrderItemUpdateSchema = salesOrderItemCreateSchema.partial();
export type SalesOrderItemUpdateInput = z.infer<typeof salesOrderItemUpdateSchema>;

export const salesOrderFromQuoteSchema = z.object({
  orderDate: z.coerce.date().optional(),
  orderNo: z.string().max(64).optional(),
  copyItems: z.boolean().default(true),
  reserveStock: z.boolean().default(false),
  notes: z.string().max(4000).optional(),
});
export type SalesOrderFromQuoteInput = z.infer<typeof salesOrderFromQuoteSchema>;

export const orderStatusUpdateSchema = z.object({
  statusCode: z.string().max(64),
  notes: z.string().max(1000).optional(),
});
export type OrderStatusUpdateInput = z.infer<typeof orderStatusUpdateSchema>;

const purchaseOrderBaseSchema = z.object({
  // İdari satın almalarda firma opsiyonel; ticari için aşağıdaki refine zorunlu kılar.
  supplierCompanyId: z.string().min(1).optional(),
  purchaseType: z.enum(['commercial', 'administrative']).default('commercial'),
  invoiceNo: z.string().max(128).optional(),
  orderNo: z.string().max(64).optional(),
  orderDate: z.coerce.date(),
  expectedDate: z.coerce.date().optional(),
  currencyCode: z.string().max(8).default('USD'),
  incoterm: z.string().max(64).optional(),
  shipmentReference: z.string().max(128).optional(),
  notes: z.string().max(4000).optional(),
});

export const purchaseOrderCreateSchema = purchaseOrderBaseSchema.superRefine((value, ctx) => {
  if (value.purchaseType !== 'administrative' && !value.supplierCompanyId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['supplierCompanyId'],
      message: 'Ticari satın alma için firma zorunludur',
    });
  }
});
export type PurchaseOrderCreateInput = z.infer<typeof purchaseOrderCreateSchema>;

export const purchaseOrderUpdateSchema = purchaseOrderBaseSchema.partial();
export type PurchaseOrderUpdateInput = z.infer<typeof purchaseOrderUpdateSchema>;

export const purchaseOrderItemCreateSchema = orderItemBaseSchema.extend({
  inventoryItemId: z.never().optional(),
  expectedDate: z.coerce.date().optional(),
});
export type PurchaseOrderItemCreateInput = z.infer<typeof purchaseOrderItemCreateSchema>;

export const purchaseOrderItemUpdateSchema = purchaseOrderItemCreateSchema.partial();
export type PurchaseOrderItemUpdateInput = z.infer<typeof purchaseOrderItemUpdateSchema>;
