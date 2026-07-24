import { z } from 'zod';
import { emailSchema, phoneSchema } from './common';

const emptyToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const optionalText = (max: number) => z.preprocess(emptyToUndefined, z.string().max(max).optional());
const optionalPhone = z.preprocess(emptyToUndefined, phoneSchema.optional());
const optionalEmail = z.preprocess(emptyToUndefined, emailSchema.optional());
const optionalDate = z.preprocess(emptyToUndefined, z.coerce.date().optional());
const emptyToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);
const clearableText = (max: number) => z.preprocess(emptyToNull, z.string().max(max).nullable().optional());
const clearablePhone = z.preprocess(emptyToNull, phoneSchema.nullable().optional());
const clearableEmail = z.preprocess(emptyToNull, emailSchema.nullable().optional());
const clearableDate = z.preprocess(emptyToNull, z.coerce.date().nullable().optional());

export const contactCreateSchema = z.object({
  companyId: z.string().min(1),
  fullName: z.string().min(1).max(255),
  title: optionalText(128),
  department: optionalText(128),
  decisionRoleCode: optionalText(64),
  workPhone: optionalPhone,
  phoneExtension: optionalText(16),
  mobilePhone: optionalPhone,
  otherPhone: optionalPhone,
  workEmail: optionalEmail,
  personalEmail: optionalEmail,
  otherEmail: optionalEmail,
  gender: optionalText(32),
  birthDate: optionalDate,
  hometown: optionalText(64),
  favoriteTeam: optionalText(64),
  favoriteColor: optionalText(32),
  graduatedSchool: optionalText(128),
  notes: optionalText(4000),
  isBlacklisted: z.boolean().default(false),
  blacklistReason: optionalText(2000),
  isPrimary: z.boolean().default(false),
});
export type ContactCreateInput = z.infer<typeof contactCreateSchema>;

export const contactUpdateSchema = contactCreateSchema.partial().extend({
  title: clearableText(128),
  department: clearableText(128),
  decisionRoleCode: clearableText(64),
  workPhone: clearablePhone,
  phoneExtension: clearableText(16),
  mobilePhone: clearablePhone,
  otherPhone: clearablePhone,
  workEmail: clearableEmail,
  personalEmail: clearableEmail,
  otherEmail: clearableEmail,
  gender: clearableText(32),
  birthDate: clearableDate,
  hometown: clearableText(64),
  favoriteTeam: clearableText(64),
  favoriteColor: clearableText(32),
  graduatedSchool: clearableText(128),
  notes: clearableText(4000),
  blacklistReason: clearableText(2000),
});
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;
