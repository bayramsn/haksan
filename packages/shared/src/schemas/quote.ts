import { z } from 'zod';
import { moneySchema, percentSchema } from './common';

export const quoteCreateSchema = z.object({
  opportunityId: z.string().optional(),
  companyId: z.string().min(1),
  companyAddressId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
  contactId: z.string().optional(),
  documentNo: z.string().max(64).optional(),
  quoteDate: z.coerce.date(),
  validityDays: z.coerce.number().int().min(1).max(365).default(30),
  projectOwnerUserId: z.string().optional(),
  currencyCode: z.string().max(8).default('USD'),
  headerDiscountAmount: moneySchema.default(0),
  headerDiscountPercent: percentSchema.default(0),
  paymentTerms: z.string().max(2000).optional(),
  deliveryTerms: z.string().max(2000).optional(),
  warrantyTerms: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
});
type QuoteCreateParsed = z.infer<typeof quoteCreateSchema>;
export type QuoteCreateInput = Omit<QuoteCreateParsed, 'headerDiscountAmount' | 'headerDiscountPercent'> & {
  headerDiscountAmount?: number;
  headerDiscountPercent?: number;
};

export const quoteUpdateSchema = quoteCreateSchema.partial();
export type QuoteUpdateInput = Partial<QuoteCreateInput>;

export const quoteWorkflowStatusEnum = z.enum([
  'cancelled',
  'price_waiting',
  'budget_waiting',
  'on_hold',
  'postponed',
]);
export type QuoteWorkflowStatus = z.infer<typeof quoteWorkflowStatusEnum>;

export const quoteStatusChangeSchema = z
  .object({
    statusCode: quoteWorkflowStatusEnum,
    followUpAt: z.coerce.date().nullish(),
    note: z.string().trim().max(2000).nullish(),
  })
  .superRefine((value, context) => {
    if (value.statusCode !== 'cancelled' && !value.followUpAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Bu durum için hatırlatma tarihi zorunludur.',
        path: ['followUpAt'],
      });
    }
  });
export type QuoteStatusChangeInput = z.infer<typeof quoteStatusChangeSchema>;

// Opsiyonel donanım / yedek parça kalemleri için uyumluluk seçimleri (çoklu).
export const quoteItemTechnicalSpecSchema = z.object({
  key: z.string().min(1).max(255),
  value: z.string().max(2000),
  unit: z.string().max(64).optional(),
  specUnit: z.string().max(64).optional(),
  groupCode: z.string().max(64).optional(),
  groupName: z.string().max(255).optional(),
  group: z.string().max(255).optional(),
});

export const quoteItemCompatibilitySchema = z.object({
  // Aynı teklif içindeki ana ürün ile ona bağlı opsiyonları PDF çıktılarında
  // güvenilir biçimde eşleştirmek için kullanılan, kullanıcıya gösterilmeyen anahtar.
  lineGroupKey: z.string().min(1).max(64).optional(),
  machineIds: z.array(z.string()).default([]),
  brands: z.array(z.string()).default([]),
  controlUnits: z.array(z.string()).default([]),
  supplierIds: z.array(z.string()).default([]),
  technicalSpecs: z.array(quoteItemTechnicalSpecSchema).default([]),
});
export type QuoteItemCompatibility = z.infer<typeof quoteItemCompatibilitySchema>;

export const quoteItemCreateSchema = z.object({
  productModelId: z.string().optional(),
  inventoryItemId: z.string().optional(),
  stockCode: z.string().max(64).optional(),
  description: z.string().min(1).max(2000),
  quantity: z.coerce.number().positive().multipleOf(0.001),
  unitCode: z.string().max(16).default('adet'),
  unitPrice: moneySchema,
  discountAmount: moneySchema.default(0),
  vatRate: percentSchema.default(20),
  sortOrder: z.coerce.number().int().default(0),
  compatibility: quoteItemCompatibilitySchema.nullish(),
  // Millileştirilmiş ithal işleme merkezi (otomatik gümrük/vergi).
  nationalized: z.boolean().optional(),
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

export const proformaPriceItemSchema = z.object({
  quoteItemId: z.string().uuid(),
  unitPrice: moneySchema,
});
export type ProformaPriceItemInput = z.infer<typeof proformaPriceItemSchema>;

export const proformaCreateSchema = z.object({
  quoteId: z.string().min(1),
  documentNo: z.string().trim().min(1).max(64).optional(),
  issueDate: z.coerce.date(),
  statusCode: z.string().max(64).default('draft'),
  fileId: z.string().optional(),
  // Proforma teklifi değiştirmeden kendi net fiyatlarını saklar. Bilerek
  // iskonto alanı kabul edilmez; proforma satırları her zaman iskontosuzdur.
  items: z
    .array(proformaPriceItemSchema)
    .max(200)
    .superRefine((items, context) => {
      const seen = new Set<string>();
      items.forEach((item, index) => {
        if (seen.has(item.quoteItemId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Aynı teklif kalemi proformaya birden fazla kez eklenemez.',
            path: [index, 'quoteItemId'],
          });
        }
        seen.add(item.quoteItemId);
      });
    })
    .optional(),
});
export type ProformaCreateInput = z.infer<typeof proformaCreateSchema>;

export const proformaUpdateSchema = proformaCreateSchema.partial();
export type ProformaUpdateInput = z.infer<typeof proformaUpdateSchema>;

export const contractCreateSchema = z.object({
  quoteId: z.string().min(1),
  contractNo: z.string().trim().min(1).max(64).optional(),
  signedDate: z.coerce.date().optional(),
  paymentTermDays: z.coerce.number().int().min(0).max(3650).optional(),
  statusCode: z.string().max(64).default('draft'),
  fileId: z.string().optional(),
});
export type ContractCreateInput = z.infer<typeof contractCreateSchema>;

export const contractUpdateSchema = contractCreateSchema.partial();
export type ContractUpdateInput = z.infer<typeof contractUpdateSchema>;

export const commercialInvoiceCreateSchema = z.object({
  quoteId: z.string().min(1),
  invoiceNo: z.string().trim().min(1).max(64).optional(),
  invoiceDate: z.coerce.date(),
  statusCode: z.string().max(64).default('draft'),
  fileId: z.string().optional(),
});
export type CommercialInvoiceCreateInput = z.infer<typeof commercialInvoiceCreateSchema>;

export const commercialInvoiceUpdateSchema = commercialInvoiceCreateSchema.partial();
export type CommercialInvoiceUpdateInput = z.infer<typeof commercialInvoiceUpdateSchema>;
