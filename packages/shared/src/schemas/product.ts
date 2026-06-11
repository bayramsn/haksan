import { z } from 'zod';
import { moneySchema, percentSchema } from './common';

export const productCreateSchema = z.object({
  brandId: z.string().min(1),
  productGroupCode: z.string().max(64).optional(),
  categoryCode: z.string().max(64).optional(),
  subcategoryCode: z.string().max(64).optional(),
  productTypeCode: z.string().max(64).optional(),
  modelCode: z.string().min(1).max(64),
  modelName: z.string().max(255).optional(),
  fullName: z.string().min(1).max(512),
  currencyCode: z.string().max(8).default('USD'),
  listPrice: moneySchema.optional(),
  cashPrice: moneySchema.optional(),
  vatRate: percentSchema.default(20),
  originCountry: z.string().max(64).optional(),
  hsCode: z.string().max(32).optional(),
  stockCode: z.string().max(64).optional(),
  imageUrl: z.string().max(512).optional(),
  description: z.string().max(4000).optional(),
  // Muadil (eşdeğer) ürün modeli; boş/null ise muadil yok demektir.
  muadilProductId: z.string().uuid().nullish(),
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
});
export type BrandCreateInput = z.infer<typeof brandCreateSchema>;

export const priceListCreateSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  description: z.string().max(4000).optional(),
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
  vatRate: percentSchema.optional(),
  notes: z.string().max(4000).optional(),
});
export type PriceListItemCreateInput = z.infer<typeof priceListItemCreateSchema>;

export const priceListItemUpdateSchema = priceListItemCreateSchema.partial();
export type PriceListItemUpdateInput = z.infer<typeof priceListItemUpdateSchema>;

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
