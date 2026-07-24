import { z } from 'zod';
import { emailSchema, phoneSchema, urlSchema } from './common';

export const companyTypeEnum = z.enum(['person', 'company']);
export const supplierCategoryCodeSchema = z.enum(['transportation', 'logistics']);
export type SupplierCategoryCode = z.infer<typeof supplierCategoryCodeSchema>;
export const companyAddressTypeEnum = z.enum(['office', 'factory', 'work_area', 'shipping', 'billing', 'other']);

const emptyToUndefined = (value: unknown) => {
  if (value === null) return undefined;
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
};
const optionalText = (max: number) => z.preprocess(emptyToUndefined, z.string().max(max).optional());
const optionalPhone = z.preprocess(emptyToUndefined, phoneSchema.optional());
const optionalEmail = z.preprocess(emptyToUndefined, emailSchema.optional());
const optionalCoordinate = (min: number, max: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().min(min).max(max).optional());
// "ecocoldcrc.com" gibi şemasız girişleri https:// ile tamamla; boş string'i alan-yok say.
const optionalUrl = z.preprocess((value) => {
  const cleaned = emptyToUndefined(value);
  if (typeof cleaned !== 'string') return cleaned;
  const trimmed = cleaned.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}, urlSchema.optional());

export const companyAddressSchema = z.object({
  id: z.string().uuid().optional(),
  addressType: companyAddressTypeEnum.default('office'),
  country: optionalText(64).default('Türkiye'),
  province: optionalText(64),
  district: optionalText(64),
  locality: optionalText(64),
  zipCode: optionalText(16),
  street: optionalText(255),
  buildingNumber: optionalText(32),
  fullAddress: optionalText(1000),
  latitude: optionalCoordinate(-90, 90),
  longitude: optionalCoordinate(-180, 180),
  isDefault: z.boolean().default(false),
  isShipping: z.boolean().default(false),
  isBilling: z.boolean().default(false),
});
export type CompanyAddressInput = z.infer<typeof companyAddressSchema>;

export const companyCreateSchema = z.object({
  companyType: companyTypeEnum.default('company'),
  relationTypeCode: z.enum(['customer', 'supplier', 'supplier_customer', 'competitor']).default('customer'),
  customerStatusCode: z.enum(['potential', 'active', 'passive', 'blacklist']).default('potential'),
  companyGroupCode: optionalText(64),
  companyGroupCodes: z.array(z.string().trim().min(1).max(64)).max(32).optional(),
  contactSourceCode: optionalText(64),
  sector: optionalText(128),
  supplierCategoryCode: supplierCategoryCodeSchema.optional(),
  legalTitle: z.string().min(1).max(255),
  shortName: optionalText(128),
  taxOffice: optionalText(128),
  taxNumber: optionalText(32),
  website: optionalUrl,
  notes: optionalText(4000),
  divisionId: optionalText(64),
  divisionIds: z.array(z.string().uuid()).min(1).max(16).optional(),
  // primary address (optional)
  address: z
    .object({
      country: optionalText(64).default('Türkiye'),
      province: optionalText(64),
      district: optionalText(64),
      locality: optionalText(64),
      zipCode: optionalText(16),
      street: optionalText(255),
      buildingNumber: optionalText(32),
      fullAddress: optionalText(1000),
      latitude: optionalCoordinate(-90, 90),
      longitude: optionalCoordinate(-180, 180),
    })
    .optional(),
  addresses: z.array(companyAddressSchema).max(20).optional(),
  primaryPhone: optionalPhone,
  secondaryPhone: optionalPhone,
  fax: optionalPhone,
  primaryEmail: optionalEmail,
  secondaryEmail: optionalEmail,
});
export type CompanyCreateInput = z.infer<typeof companyCreateSchema>;

export const companyUpdateSchema = companyCreateSchema.partial().extend({
  companyGroupCode: z.string().trim().max(64).nullable().optional(),
  contactSourceCode: z.string().trim().max(64).nullable().optional(),
  sector: z.string().trim().max(128).nullable().optional(),
  supplierCategoryCode: supplierCategoryCodeSchema.nullable().optional(),
  shortName: z.string().trim().max(128).nullable().optional(),
  taxOffice: z.string().trim().max(128).nullable().optional(),
  taxNumber: z.string().trim().max(32).nullable().optional(),
  website: z.preprocess((value) => {
    if (value === null || value === '') return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }, urlSchema.nullable().optional()),
  notes: z.string().trim().max(4000).nullable().optional(),
  primaryPhone: phoneSchema.nullable().optional(),
  secondaryPhone: phoneSchema.nullable().optional(),
  fax: phoneSchema.nullable().optional(),
  primaryEmail: emailSchema.nullable().optional(),
  secondaryEmail: emailSchema.nullable().optional(),
});
export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>;

export const companyListQuerySchema = z.object({
  search: z.string().max(128).optional(),
  relationTypeCode: z.enum(['customer', 'supplier', 'supplier_customer', 'competitor']).optional(),
  customerStatusCode: z.enum(['potential', 'active', 'passive', 'blacklist']).optional(),
  divisionId: z.string().uuid().optional(),
});
export type CompanyListQuery = z.infer<typeof companyListQuerySchema>;

export const companyOsmSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(160),
  address: z.string().trim().max(240).optional(),
  city: z.string().trim().max(64).optional(),
  district: z.string().trim().max(64).optional(),
  country: z.string().trim().max(64).optional(),
});
export type CompanyOsmSearchQuery = z.infer<typeof companyOsmSearchQuerySchema>;

export const companyOsmSearchResultSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  type: z.string().nullable(),
  category: z.string().nullable(),
  importance: z.number().nullable(),
  matchQuality: z.enum(['exact', 'street', 'area']),
  matchScore: z.number().min(0).max(100),
  matchReason: z.string(),
  website: z.string().url().optional(),
  phone: z.string().max(64).optional(),
  email: z.string().email().max(254).optional(),
  address: z.record(z.unknown()).optional(),
});
export type CompanyOsmSearchResult = z.infer<typeof companyOsmSearchResultSchema>;

/**
 * Yeni firma ekranındaki resmî site incelemesi. Site URL'si boş bırakılırsa
 * sunucu, doğrulanmış OSM firma kaydındaki web sitesi alanını kullanmayı dener.
 */
export const companyWebsiteLookupSchema = companyOsmSearchQuerySchema.extend({
  website: optionalUrl,
});
export type CompanyWebsiteLookupInput = z.infer<typeof companyWebsiteLookupSchema>;

export const companyWebsiteLookupResultSchema = z.object({
  officialWebsite: z.string().url(),
  siteName: z.string().max(255).optional(),
  confidence: z.enum(['high', 'medium', 'low']),
  confidenceScore: z.number().int().min(0).max(100),
  matchReason: z.string().max(500),
  sourceUrls: z.array(z.string().url()).min(1).max(4),
  suggestion: z.object({
    website: z.string().url(),
    address: z.string().max(1000).optional(),
    city: z.string().max(64).optional(),
    district: z.string().max(64).optional(),
    country: z.string().max(64).optional(),
    zipCode: z.string().max(16).optional(),
    phone: z.string().max(64).optional(),
    email: z.string().email().max(254).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }),
  warnings: z.array(z.string().max(500)).max(8),
});
export type CompanyWebsiteLookupResult = z.infer<typeof companyWebsiteLookupResultSchema>;

export const companyLocationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).nullable(),
  longitude: z.coerce.number().min(-180).max(180).nullable(),
  source: z.enum(['manual', 'verified', 'osm_exact', 'osm_street', 'osm_area']).default('manual'),
});
export type CompanyLocationInput = z.infer<typeof companyLocationSchema>;

export const companyAccessRequestSchema = z.object({
  divisionId: z.string().uuid().optional(),
  note: z.string().max(2000).optional(),
});
export type CompanyAccessRequestInput = z.infer<typeof companyAccessRequestSchema>;

export const companyAccessRequestDecisionSchema = z.object({
  decisionNote: z.string().max(2000).optional(),
});
export type CompanyAccessRequestDecisionInput = z.infer<typeof companyAccessRequestDecisionSchema>;

export const accessRequestListQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});
export type AccessRequestListQuery = z.infer<typeof accessRequestListQuerySchema>;
