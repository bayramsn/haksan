import { z } from 'zod';
import { moneySchema, percentSchema } from './common';

const productVatRateSchema = percentSchema.refine((rate) => rate !== 1, {
  message: 'Ürün KDV oranı %1 olamaz',
});

export const productCreateSchema = z.object({
  brandId: z.string().min(1),
  series: z.string().trim().max(128).optional(),
  productGroupCode: z.string().max(64).optional(),
  categoryCode: z.string().max(64).optional(),
  subcategoryCode: z.string().max(64).optional(),
  productTypeCode: z.string().max(64).optional(),
  compatibleMachineTypeCode: z.string().max(64).nullish(),
  supplierCompanyId: z.string().uuid().nullish(),
  modelCode: z.string().min(1).max(64),
  modelName: z.string().max(255).optional(),
  fullName: z.string().min(1).max(512),
  currencyCode: z.string().max(8).default('USD'),
  listPrice: moneySchema.optional(),
  cashPrice: moneySchema.optional(),
  vatRate: productVatRateSchema.default(20),
  originCountry: z.string().max(64).optional(),
  /** Tezgahın üretim yılı; belge metnindeki {{YIL}} buradan doldurulur. */
  productionYear: z.coerce.number().int().min(1950).max(2100).optional(),
  hsCode: z.string().max(32).optional(),
  stockCode: z.string().max(64).optional(),
  imageUrl: z.string().max(512).optional(),
  description: z.string().max(4000).optional(),
  // Muadil (eşdeğer) ürün modeli; boş/null ise muadil yok demektir.
  muadilProductId: z.string().uuid().nullish(),
  // Çoklu muadil ürün modeli listesi. Eski muadilProductId geriye uyumluluk için korunur.
  muadilProductIds: z.array(z.string().uuid()).max(50).optional(),
  optionalCompatibilityGroupCodes: z.array(z.string().max(64)).max(50).optional(),
  optionalCompatibilityCategoryCodes: z.array(z.string().max(64)).max(50).optional(),
  optionalCompatibilitySubcategoryCodes: z.array(z.string().max(64)).max(50).optional(),
  optionalCompatibilityTypeCodes: z.array(z.string().max(64)).max(50).optional(),
  optionalCompatibilityBrandIds: z.array(z.string().uuid()).max(50).optional(),
});
export type ProductCreateInput = z.infer<typeof productCreateSchema>;

export const productUpdateSchema = productCreateSchema.partial();
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const productSpecCreateSchema = z.object({
  specGroupCode: z.string().max(64),
  specKey: z.string().min(1).max(255),
  specValue: z.string().max(2000),
  specUnit: z.string().max(64).optional(),
  sortOrder: z.coerce.number().int().default(0),
});
export type ProductSpecCreateInput = z.infer<typeof productSpecCreateSchema>;

export const productSpecTemplateCreateSchema = z.object({
  productTypeCode: z.string().min(1).max(64),
  specKey: z.string().min(1).max(255),
  // `null` = alanı temizle, `undefined` = alana hiç dokunma. Batch güncellemede
  // `.set()` yalnız gönderilen kolonlara yazdığı için ayrım şarttır: boşaltılan
  // değer `undefined` gider ve kolon güncellenmezse eski değer geri gelir.
  specGroupCode: z.string().max(64).nullish(),
  defaultValue: z.string().max(2000).nullish(),
  specUnit: z.string().max(64).nullish(),
  // Bölüm (CNC / Üniversal / Sac İşleme). Boş/null → tüm bölümlerde ("Tümü").
  divisionId: z.string().uuid().nullish(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
  isDeleted: z.boolean().default(false),
});
export type ProductSpecTemplateCreateInput = z.infer<typeof productSpecTemplateCreateSchema>;

export const productSpecTemplateUpdateSchema = productSpecTemplateCreateSchema.partial();
export type ProductSpecTemplateUpdateInput = z.infer<typeof productSpecTemplateUpdateSchema>;

export const productSpecTemplateBulkCreateSchema = z.object({
  items: z.array(productSpecTemplateCreateSchema).min(1).max(500),
});
export type ProductSpecTemplateBulkCreateInput = z.infer<typeof productSpecTemplateBulkCreateSchema>;

export const productSpecTemplateBatchItemSchema = productSpecTemplateCreateSchema.extend({
  id: z.string().uuid().optional(),
});

export const productSpecTemplateBatchSchema = z.object({
  // Kaydın kapsamı. `pruneMissing` ile birlikte gönderildiğinde bu (ürün tipi +
  // bölüm) kapsamında olup `items` içinde bulunmayan alanlar tombstone'lanır;
  // böylece çalışma sayfasından çıkarılan alan aynı transaction içinde silinir.
  productTypeCode: z.string().min(1).max(64).optional(),
  divisionId: z.string().uuid().nullish(),
  pruneMissing: z.boolean().default(false),
  items: z.array(productSpecTemplateBatchItemSchema).min(1).max(1000),
});
export type ProductSpecTemplateBatchInput = z.infer<typeof productSpecTemplateBatchSchema>;

export const machineTemplateFieldSchema = productSpecTemplateCreateSchema.omit({
  productTypeCode: true,
  divisionId: true,
});

export const machineTemplateCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(255),
    code: z.string().trim().min(2).max(64),
    divisionId: z.string().uuid(),
    subcategoryId: z.string().uuid(),
    fields: z.array(machineTemplateFieldSchema).max(1000).default([]),
  })
  .superRefine((value, ctx) => {
    const normalizedKeys = value.fields.map((field) =>
      field.specKey.trim().toLocaleLowerCase('tr-TR'),
    );
    if (new Set(normalizedKeys).size !== normalizedKeys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fields'],
        message: 'Aynı teknik bilgi adı birden fazla kez kullanılamaz',
      });
    }
  });
export type MachineTemplateCreateInput = z.infer<typeof machineTemplateCreateSchema>;

export const technicalImportModeSchema = z.enum(['template_fields', 'machine_data']);
export type TechnicalImportMode = z.infer<typeof technicalImportModeSchema>;

export const technicalImportAvailableFieldSchema = z.object({
  key: z.string().trim().min(1).max(255),
  groupCode: z.string().trim().max(64).optional(),
  unit: z.string().trim().max(64).optional(),
});
export type TechnicalImportAvailableField = z.infer<typeof technicalImportAvailableFieldSchema>;

export const technicalImportPreviewRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(128).optional(),
  // 10 MB ham dosya, base64 kodlamasında yaklaşık 13,4 MB olur.
  fileBase64: z.string().min(1).max(15_000_000),
  mode: technicalImportModeSchema,
  productTypeCode: z.string().trim().min(1).max(64),
  divisionId: z.string().uuid().nullish(),
  availableFields: z.array(technicalImportAvailableFieldSchema).min(1).max(1000),
});
export type TechnicalImportPreviewRequest = z.infer<typeof technicalImportPreviewRequestSchema>;

/**
 * Şablon indirme isteği. Alanlar istemciden gelir çünkü çalışma sayfasındaki liste
 * katalog şablonu ile veritabanı kayıtlarının birleşimidir; böylece indirilen dosya
 * kullanıcının ekranda gördüğü alanlarla birebir aynı olur.
 */
export const technicalImportTemplateRequestSchema = z.object({
  productTypeCode: z.string().trim().min(1).max(64),
  productTypeLabel: z.string().trim().max(255).optional(),
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
  includeValues: z.boolean().default(true),
  fields: z
    .array(
      technicalImportAvailableFieldSchema.extend({
        section: z.string().trim().max(128).optional(),
        value: z.string().trim().max(2000).optional(),
      })
    )
    .max(1000)
    .default([]),
});
export type TechnicalImportTemplateRequest = z.infer<typeof technicalImportTemplateRequestSchema>;

export const technicalImportMatchStatusSchema = z.enum(['exact', 'normalized', 'review', 'unmatched']);
export type TechnicalImportMatchStatus = z.infer<typeof technicalImportMatchStatusSchema>;

export const technicalImportRowSchema = z.object({
  rowNumber: z.coerce.number().int().positive(),
  sheetName: z.string().trim().min(1).max(31),
  section: z.string().trim().max(128).default('GENEL'),
  sourceKey: z.string().trim().min(1).max(255),
  sourceValue: z.string().trim().max(2000).default(''),
  sourceUnit: z.string().trim().max(64).default(''),
  targetKey: z.string().trim().max(255).default(''),
  targetGroupCode: z.string().trim().max(64).default('GENEL'),
  targetUnit: z.string().trim().max(64).default(''),
  matchStatus: technicalImportMatchStatusSchema,
  include: z.boolean().default(true),
});
export type TechnicalImportRowInput = z.infer<typeof technicalImportRowSchema>;

export const technicalImportCommitRequestSchema = z
  .object({
    mode: technicalImportModeSchema,
    productTypeCode: z.string().trim().min(1).max(64),
    divisionId: z.string().uuid().nullish(),
    targetProductId: z.string().uuid().nullish(),
    confirmedTarget: z.boolean().default(false),
    rows: z.array(technicalImportRowSchema).min(1).max(5000),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'machine_data' && (!value.targetProductId || !value.confirmedTarget)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetProductId'],
        message: 'Makine verisi aktarımında hedef makine kullanıcı tarafından onaylanmalıdır',
      });
    }
    if (!value.rows.some((row) => row.include && row.targetKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rows'],
        message: 'Aktarılacak en az bir eşleşmiş teknik satır olmalıdır',
      });
    }
  });
export type TechnicalImportCommitRequest = z.infer<typeof technicalImportCommitRequestSchema>;

export const productEquipmentCreateSchema = z.object({
  equipmentTypeCode: z.string().max(64),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  isPromotion: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});
export type ProductEquipmentCreateInput = z.infer<typeof productEquipmentCreateSchema>;

export const productDetailsReplaceSchema = z.object({
  specs: z.array(productSpecCreateSchema).default([]),
  equipment: z.array(productEquipmentCreateSchema).default([]),
});
export type ProductDetailsReplaceInput = z.infer<typeof productDetailsReplaceSchema>;

export const brandCreateSchema = z.object({
  name: z.string().min(1).max(128),
  country: z.string().max(64).optional(),
  website: z.string().url().max(512).optional(),
  notes: z.string().max(4000).optional(),
  companyId: z.string().uuid().nullish(),
  isOwned: z.boolean().default(false),
  logoFileId: z.string().uuid().nullish(),
  // Ürün formunda seçilen CNC / Üniversal / Sac İşleme grubunun bölümü.
  // Boş bırakılırsa marka tüm bölümlerde kullanılabilen ortak kayıt olur.
  divisionId: z.string().uuid().nullish(),
});
export type BrandCreateInput = z.infer<typeof brandCreateSchema>;

export const priceListCreateSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  description: z.string().max(4000).optional(),
  divisionId: z.string().uuid().optional(),
  currencyCode: z.string().max(8).default('USD'),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  isActive: z.boolean().default(true),
});
export type PriceListCreateInput = z.infer<typeof priceListCreateSchema>;

export const priceListUpdateSchema = priceListCreateSchema.partial();
export type PriceListUpdateInput = z.infer<typeof priceListUpdateSchema>;

export const priceListItemCreateSchema = z.object({
  productModelId: z.string().min(1),
  listPrice: moneySchema.optional(),
  cashPrice: moneySchema.optional(),
  campaignPrice: moneySchema.optional(),
  campaignValidFrom: z.coerce.date().optional(),
  campaignValidUntil: z.coerce.date().optional(),
  campaignIsActive: z.boolean().default(false),
  vatRate: percentSchema.optional(),
  notes: z.string().max(4000).optional(),
});
export type PriceListItemCreateRequest = Omit<z.infer<typeof priceListItemCreateSchema>, 'campaignIsActive'> & {
  campaignIsActive?: boolean;
};
export type PriceListItemCreateInput = z.infer<typeof priceListItemCreateSchema>;

export const priceListItemUpdateSchema = priceListItemCreateSchema.partial();
export type PriceListItemUpdateInput = z.infer<typeof priceListItemUpdateSchema>;

export const productOptionSetCreateSchema = z.object({
  name: z.string().min(1).max(255),
  sortOrder: z.coerce.number().int().default(0),
});
export type ProductOptionSetCreateInput = z.infer<typeof productOptionSetCreateSchema>;

export const productOptionValueCreateSchema = z.object({
  value: z.string().min(1).max(255),
  priceDelta: moneySchema.optional(),
  currencyCode: z.string().max(8).optional(),
  sortOrder: z.coerce.number().int().default(0),
});
export type ProductOptionValueCreateInput = z.infer<typeof productOptionValueCreateSchema>;

export const productImportSpecSchema = z.object({
  specGroupCode: z.string().max(64).optional(),
  specKey: z.string().min(1).max(255),
  specValue: z.string().min(1).max(2000),
  specUnit: z.string().max(64).optional(),
  sortOrder: z.coerce.number().int().default(0),
});
export type ProductImportSpecInput = z.infer<typeof productImportSpecSchema>;

export const productImportEquipmentSchema = z.object({
  equipmentTypeCode: z.string().max(64),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  isPromotion: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});
export type ProductImportEquipmentInput = z.infer<typeof productImportEquipmentSchema>;

export const productImportRowSchema = z.object({
  rowNumber: z.coerce.number().int().positive(),
  brandName: z.string().min(1).max(128),
  series: z.string().trim().max(128).optional(),
  modelCode: z.string().min(1).max(64),
  modelName: z.string().max(255).optional(),
  fullName: z.string().min(1).max(512),
  productGroupCode: z.string().max(64).optional(),
  categoryCode: z.string().max(64).optional(),
  subcategoryCode: z.string().max(64).optional(),
  productTypeCode: z.string().max(64).optional(),
  compatibleMachineTypeCode: z.string().max(64).nullish(),
  currencyCode: z.string().max(8).default('USD'),
  listPrice: moneySchema.optional(),
  cashPrice: moneySchema.optional(),
  vatRate: percentSchema.default(20),
  originCountry: z.string().max(64).optional(),
  /** Tezgahın üretim yılı; belge metnindeki {{YIL}} buradan doldurulur. */
  productionYear: z.coerce.number().int().min(1950).max(2100).optional(),
  hsCode: z.string().max(32).optional(),
  stockCode: z.string().max(64).optional(),
  imageUrl: z.string().max(512).optional(),
  description: z.string().max(4000).optional(),
  specs: z.array(productImportSpecSchema).default([]),
  equipment: z.array(productImportEquipmentSchema).default([]),
});
export type ProductImportRowInput = z.infer<typeof productImportRowSchema>;

export const productImportPreviewRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileBase64: z.string().min(1),
});
export type ProductImportPreviewRequest = z.infer<typeof productImportPreviewRequestSchema>;

export const productImportCommitRequestSchema = z.object({
  rows: z.array(productImportRowSchema).min(1),
  mode: z.enum(['upsert', 'create_only']).default('upsert'),
  replaceDetails: z.boolean().default(true),
});
export type ProductImportCommitRequest = z.infer<typeof productImportCommitRequestSchema>;
