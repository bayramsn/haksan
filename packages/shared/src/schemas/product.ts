import { z } from 'zod';
import { moneySchema, percentSchema } from './common';

const productVatRateSchema = percentSchema.refine((rate) => rate !== 1, {
  message: 'Ürün KDV oranı %1 olamaz',
});

export const productCreateSchema = z.object({
  brandId: z.string().min(1),
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
  specGroupCode: z.string().max(64).optional(),
  defaultValue: z.string().max(2000).optional(),
  specUnit: z.string().max(64).optional(),
  // Bölüm (CNC / Üniversal / Sac İşleme). Boş/null → tüm bölümlerde ("Tümü").
  divisionId: z.string().uuid().nullish(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});
export type ProductSpecTemplateCreateInput = z.infer<typeof productSpecTemplateCreateSchema>;

export const productSpecTemplateUpdateSchema = productSpecTemplateCreateSchema.partial();
export type ProductSpecTemplateUpdateInput = z.infer<typeof productSpecTemplateUpdateSchema>;

export const productSpecTemplateBulkCreateSchema = z.object({
  items: z.array(productSpecTemplateCreateSchema).min(1).max(500),
});
export type ProductSpecTemplateBulkCreateInput = z.infer<typeof productSpecTemplateBulkCreateSchema>;

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
