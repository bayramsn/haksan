import { z } from 'zod';
import { emailSchema, phoneSchema, urlSchema } from './common';

export const companyTypeEnum = z.enum(['person', 'company']);

const emptyToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const optionalText = (max: number) => z.preprocess(emptyToUndefined, z.string().max(max).optional());
const optionalPhone = z.preprocess(emptyToUndefined, phoneSchema.optional());
const optionalEmail = z.preprocess(emptyToUndefined, emailSchema.optional());
const optionalUrl = z.preprocess(emptyToUndefined, urlSchema.optional());

export const companyCreateSchema = z.object({
  companyType: companyTypeEnum.default('company'),
  relationTypeCode: z.enum(['customer', 'supplier', 'supplier_customer']).default('customer'),
  customerStatusCode: z.enum(['potential', 'active', 'passive', 'blacklist']).default('potential'),
  companyGroupCode: optionalText(64),
  contactSourceCode: optionalText(64),
  sector: optionalText(128),
  legalTitle: z.string().min(1).max(255),
  shortName: optionalText(128),
  taxOffice: optionalText(128),
  taxNumber: optionalText(32),
  website: optionalUrl,
  notes: optionalText(4000),
  divisionId: optionalText(64),
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
      latitude: z.coerce.number().min(-90).max(90).optional(),
      longitude: z.coerce.number().min(-180).max(180).optional(),
    })
    .optional(),
  primaryPhone: optionalPhone,
  secondaryPhone: optionalPhone,
  fax: optionalPhone,
  primaryEmail: optionalEmail,
  secondaryEmail: optionalEmail,
});
export type CompanyCreateInput = z.infer<typeof companyCreateSchema>;

export const companyUpdateSchema = companyCreateSchema.partial();
export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>;

export const companyListQuerySchema = z.object({
  search: z.string().max(128).optional(),
  relationTypeCode: z.enum(['customer', 'supplier', 'supplier_customer']).optional(),
  customerStatusCode: z.enum(['potential', 'active', 'passive', 'blacklist']).optional(),
});
export type CompanyListQuery = z.infer<typeof companyListQuerySchema>;

export const companyOsmSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(160),
  city: z.string().trim().max(64).optional(),
  district: z.string().trim().max(64).optional(),
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
  address: z.record(z.unknown()).optional(),
});
export type CompanyOsmSearchResult = z.infer<typeof companyOsmSearchResultSchema>;

export const companyLocationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).nullable(),
  longitude: z.coerce.number().min(-180).max(180).nullable(),
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
