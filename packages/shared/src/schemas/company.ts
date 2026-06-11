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
