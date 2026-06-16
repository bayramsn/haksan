import { z } from 'zod';
import { moneySchema, dateRangeSchema } from './common';

export const receivableCreateSchema = z.object({
  companyId: z.string().min(1),
  quoteId: z.string().optional(),
  amount: moneySchema,
  currencyCode: z.string().max(8).default('USD'),
  dueDate: z.coerce.date(),
  invoiceNo: z.string().max(64).optional(),
  movementType: z.enum(['manual', 'sales_invoice', 'purchase_invoice']).default('manual'),
  documentRef: z.string().max(128).optional(),
  notes: z.string().max(2000).optional(),
});
export type ReceivableCreateInput = z.infer<typeof receivableCreateSchema>;

export const paymentCreateSchema = z
  .object({
    direction: z.enum(['in', 'out']).default('in'),
    receivableId: z.string().min(1).optional(),
    payableId: z.string().min(1).optional(),
    companyId: z.string().min(1).optional(),
    amount: moneySchema,
    currencyCode: z.string().max(8).default('USD'),
    paymentDate: z.coerce.date(),
    paymentMethod: z.enum(['bank_transfer', 'cash', 'credit_card', 'check', 'other']).default('bank_transfer'),
    invoiceNo: z.string().max(64).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => !!v.receivableId || !!v.payableId || !!v.companyId, {
    message: 'receivableId, payableId veya companyId zorunludur',
    path: ['companyId'],
  });
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;

export const financeListQuerySchema = z.object({
  companyId: z.string().uuid().optional(),
});
export type FinanceListQuery = z.infer<typeof financeListQuerySchema>;

export const statementQuerySchema = dateRangeSchema;
export type StatementQuery = z.infer<typeof statementQuerySchema>;

export const installmentPreviewSchema = z.object({
  grandTotal: moneySchema,
  installmentCount: z.coerce.number().int().min(1).max(120),
  firstDueDate: z.coerce.date(),
  lastDueDate: z.coerce.date().optional(),
});
export type InstallmentPreviewInput = z.infer<typeof installmentPreviewSchema>;

export const accountingInvoiceCreateSchema = z.object({
  companyId: z.string().min(1),
  type: z.enum(['sales', 'purchase']),
  invoiceNo: z.string().min(1).max(64),
  invoiceDate: z.coerce.date(),
  amount: moneySchema,
  vatAmount: moneySchema.default(0),
  grandTotal: moneySchema,
  currencyCode: z.string().max(8).default('USD'),
  quoteId: z.string().optional(),
  salesOrderId: z.string().optional(),
  firstDueDate: z.coerce.date().optional(),
  lastDueDate: z.coerce.date().optional(),
  installmentCount: z.coerce.number().int().min(1).max(120).default(1),
  notes: z.string().max(2000).optional(),
  installments: z
    .array(
      z.object({
        installmentNo: z.number().int().min(1),
        dueDate: z.coerce.date(),
        amount: moneySchema,
      })
    )
    .optional(),
});
export type AccountingInvoiceCreateInput = z.infer<typeof accountingInvoiceCreateSchema>;

export const accountingInvoiceListQuerySchema = z.object({
  companyId: z.string().uuid().optional(),
  type: z.enum(['sales', 'purchase']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type AccountingInvoiceListQuery = z.infer<typeof accountingInvoiceListQuerySchema>;

export const dueDatesQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type DueDatesQuery = z.infer<typeof dueDatesQuerySchema>;
