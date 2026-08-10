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
  /** Çıktının altına basılacak imza (Ayarlar → İmzalar). `null` → imzasız. */
  signatureId: z.string().uuid().nullish(),
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

/**
 * Belgenin (proforma / sözleşme) KENDİ şartları.
 *
 * Belge ekranındaki düzenleme artık bağlı teklifin şartlarını yeniden yazmaz:
 * imza masasında sözleşmeye özel yazılan bir teslim şartı, onaylı teklifin ve
 * aynı teklife bağlı proformanın çıktısını geriye dönük değiştiriyordu. Teklif
 * yalnız ön-dolgu kaynağıdır; gönderilmezse belge onun şartlarıyla basılır.
 */
export const documentTermsSchema = quoteTermsUpsertSchema.partial().optional();
export type DocumentTermsInput = z.infer<typeof documentTermsSchema>;

/**
 * Fırsat açmadan ("hızlı") kesilen teklif.
 *
 * Normal akışta teklif her zaman bir satış kartına bağlanır; kart yoksa istemci
 * önce fırsat açar. Küçük/ad-hoc işlerde bu zorunluluk gereksiz kayıt üretiyor,
 * bu yüzden başlık + kalemler + şartlar tek istekte gelir ve `opportunityId`
 * hiç gönderilemez. Firma bilgisi bilinçli olarak zorunludur: teklif; cari,
 * alacak ve sipariş akışlarını besleyen bir CRM kaydıdır, proformadan farklı
 * olarak firmasız var olamaz.
 */
export const standaloneQuoteCreateSchema = quoteCreateSchema.omit({ opportunityId: true }).extend({
  items: z.array(quoteItemCreateSchema).min(1).max(200),
  terms: quoteTermsUpsertSchema.partial().optional(),
});
type StandaloneQuoteCreateParsed = z.infer<typeof standaloneQuoteCreateSchema>;
export type StandaloneQuoteCreateInput = Omit<
  StandaloneQuoteCreateParsed,
  'headerDiscountAmount' | 'headerDiscountPercent'
> & {
  headerDiscountAmount?: number;
  headerDiscountPercent?: number;
};

export const proformaPriceItemSchema = z.object({
  quoteItemId: z.string().uuid(),
  unitPrice: moneySchema,
});
export type ProformaPriceItemInput = z.infer<typeof proformaPriceItemSchema>;

/**
 * Teklife bağlı belgenin (proforma / sözleşme) kendi net fiyatlarını saklayan
 * kalem listesi. Belge, bağlı teklifi DEĞİŞTİRMEZ: onaylı teklif kilitlidir
 * (`assertQuoteMutable`), oysa sözleşme masasında fiyat pazarlığa açıktır.
 * İskonto bilerek bu payload ile değiştirilemez; teklif satırından korunur.
 */
const documentPriceItemsSchema = z
  .array(proformaPriceItemSchema)
  .max(200)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.quoteItemId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Aynı teklif kalemi belgeye birden fazla kez eklenemez.',
          path: [index, 'quoteItemId'],
        });
      }
      seen.add(item.quoteItemId);
    });
  })
  .optional();

export const proformaCreateSchema = z.object({
  quoteId: z.string().min(1),
  documentNo: z.string().trim().min(1).max(64).optional(),
  issueDate: z.coerce.date(),
  statusCode: z.string().max(64).default('draft'),
  fileId: z.string().optional(),
  /** Çıktının altına basılacak imza (Ayarlar → İmzalar). `null` → imzasız. */
  signatureId: z.string().uuid().nullish(),
  // `unitPrice` brüt birim fiyatıdır, net toplam mevcut iskonto düşülerek hesaplanır.
  items: documentPriceItemsSchema,
  // Belgeye özel şartlar; gönderilmezse teklifin şartlarıyla basılır.
  terms: documentTermsSchema,
});
export type ProformaCreateInput = z.infer<typeof proformaCreateSchema>;

export const proformaUpdateSchema = proformaCreateSchema.partial();
export type ProformaUpdateInput = z.infer<typeof proformaUpdateSchema>;

/**
 * Tekliften bağımsız ("hızlı") belge kalemi. Teklife bağlı belgeden farkı,
 * satırın kendi açıklaması/adedi/iskontosu olması — bir teklif kalemine değil,
 * doğrudan belgeye aittir. Proforma ve sözleşme aynı kalem şeklini paylaşır.
 */
export const proformaFreeItemSchema = z
  .object({
    description: z.string().trim().min(1).max(2000),
    quantity: z.coerce.number().positive().multipleOf(0.001),
    unitCode: z.string().trim().max(16).default('adet'),
    unitPrice: moneySchema,
    discountAmount: moneySchema.default(0),
    vatRate: percentSchema.default(20),
    /** PDF'deki Markası / Modeli / Menşei / G.T.İ.P. satırları — boş bırakılırsa basılmaz. */
    brand: z.string().trim().max(255).optional(),
    model: z.string().trim().max(255).optional(),
    originCountry: z.string().trim().max(255).optional(),
    hsCode: z.string().trim().max(64).optional(),
  })
  .superRefine((item, context) => {
    if (item.discountAmount > item.quantity * item.unitPrice + 0.0001) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Satır iskontosu brüt tutarını aşamaz',
        path: ['discountAmount'],
      });
    }
  });
export type ProformaFreeItemInput = z.infer<typeof proformaFreeItemSchema>;

/**
 * Bağımsız belgelerin ortak alıcı alanları: kayıtlı firma seçilmezse aynı
 * bilgiler serbest metin olarak girilir ve yalnızca belgeye yazılır.
 */
const standaloneOwnerFields = {
  /** Kayıtlı firma; verilmezse serbest metin alanları kullanılır. */
  companyId: z.string().uuid().optional(),
  companyName: z.string().trim().max(255).optional(),
  companyAddress: z.string().trim().max(1000).optional(),
  companyTaxOffice: z.string().trim().max(255).optional(),
  companyTaxNumber: z.string().trim().max(64).optional(),
  contactName: z.string().trim().max(255).optional(),
  contactPhone: z.string().trim().max(64).optional(),
  divisionId: z.string().uuid().optional(),
  /** Çıktının altına basılacak imza (Ayarlar → İmzalar). `null` → imzasız. */
  signatureId: z.string().uuid().nullish(),
  statusCode: z.string().max(64).default('draft'),
  currencyCode: z.string().trim().max(8).default('USD'),
  paymentTerms: z.string().max(4000).optional(),
  deliveryTerms: z.string().max(4000).optional(),
  warrantyTerms: z.string().max(4000).optional(),
  notes: z.string().max(4000).optional(),
} as const;

const standaloneProformaFields = z.object({
  ...standaloneOwnerFields,
  documentNo: z.string().trim().min(1).max(64).optional(),
  issueDate: z.coerce.date(),
  items: z.array(proformaFreeItemSchema).min(1).max(200),
});

/** Kime kesildiği belirsiz bir belge oluşmasın: firma kaydı ya da unvan şart. */
const requireStandaloneOwner = (
  value: { companyId?: string; companyName?: string },
  context: z.RefinementCtx,
) => {
  if (!value.companyId && !value.companyName?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Firma seçin veya firma unvanını yazın',
      path: ['companyName'],
    });
  }
};

/** Firma alanlarına hiç dokunulmayan güncellemede mevcut kayıt geçerliliğini korur. */
const requireStandaloneOwnerOnPatch = (
  value: { companyId?: string; companyName?: string },
  context: z.RefinementCtx,
) => {
  if (value.companyId === undefined && value.companyName === undefined) return;
  requireStandaloneOwner(value, context);
};

export const standaloneProformaCreateSchema = standaloneProformaFields.superRefine(requireStandaloneOwner);
export type StandaloneProformaCreateInput = z.infer<typeof standaloneProformaCreateSchema>;

export const standaloneProformaUpdateSchema = standaloneProformaFields
  .partial()
  .superRefine(requireStandaloneOwnerOnPatch);
export type StandaloneProformaUpdateInput = z.infer<typeof standaloneProformaUpdateSchema>;

/**
 * Sözleşme çıktısındaki ödeme planı satırı. Teklife bağlı sözleşmede plan
 * cari alacaklardan gelir; teklifsiz sözleşmede elle girilir.
 */
export const standaloneContractInstallmentSchema = z.object({
  label: z.string().trim().max(255).optional(),
  amount: moneySchema,
  dueDate: z.coerce.date().optional(),
  /** Senetli vade — çıktıda ayrı işaretlenir. */
  promissoryNote: z.boolean().optional(),
});
export type StandaloneContractInstallmentInput = z.infer<typeof standaloneContractInstallmentSchema>;

const standaloneContractFields = z.object({
  ...standaloneOwnerFields,
  contractNo: z.string().trim().min(1).max(64).optional(),
  signedDate: z.coerce.date(),
  paymentTermDays: z.coerce.number().int().min(0).max(3650).optional(),
  items: z.array(proformaFreeItemSchema).min(1).max(200),
  /** Sözleşme çıktısındaki teslim bilgileri (teklif şartları tablosunun karşılığı). */
  deliveryLocation: z.string().trim().max(255).optional(),
  estimatedDeliveryDaysMin: z.coerce.number().int().nonnegative().max(3650).optional(),
  estimatedDeliveryDaysMax: z.coerce.number().int().nonnegative().max(3650).optional(),
  importCostsExcluded: z.boolean().default(true),
  installments: z.array(standaloneContractInstallmentSchema).max(60).optional(),
});

export const standaloneContractCreateSchema = standaloneContractFields.superRefine((value, context) => {
  requireStandaloneOwner(value, context);
  if (
    value.estimatedDeliveryDaysMin !== undefined
    && value.estimatedDeliveryDaysMax !== undefined
    && value.estimatedDeliveryDaysMin > value.estimatedDeliveryDaysMax
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'En erken teslim günü en geçten büyük olamaz',
      path: ['estimatedDeliveryDaysMin'],
    });
  }
});
export type StandaloneContractCreateInput = z.infer<typeof standaloneContractCreateSchema>;

export const standaloneContractUpdateSchema = standaloneContractFields
  .partial()
  .superRefine(requireStandaloneOwnerOnPatch);
export type StandaloneContractUpdateInput = z.infer<typeof standaloneContractUpdateSchema>;

export const contractCreateSchema = z.object({
  quoteId: z.string().min(1),
  contractNo: z.string().trim().min(1).max(64).optional(),
  signedDate: z.coerce.date().optional(),
  paymentTermDays: z.coerce.number().int().min(0).max(3650).optional(),
  statusCode: z.string().max(64).default('draft'),
  fileId: z.string().optional(),
  /** Çıktının altına basılacak imza (Ayarlar → İmzalar). `null` → imzasız. */
  signatureId: z.string().uuid().nullish(),
  // Sözleşme masasında pazarlık edilen fiyat, onaylı teklife dokunmadan
  // burada saklanır ve sözleşme çıktısı bu değerlerle basılır.
  items: documentPriceItemsSchema,
  // Şartlar da sözleşmeye özeldir; teklifinkini yeniden yazmaz.
  terms: documentTermsSchema,
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
