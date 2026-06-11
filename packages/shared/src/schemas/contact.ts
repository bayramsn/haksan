import { z } from 'zod';
import { emailSchema, phoneSchema } from './common';

const emptyToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const optionalText = (max: number) => z.preprocess(emptyToUndefined, z.string().max(max).optional());
const optionalPhone = z.preprocess(emptyToUndefined, phoneSchema.optional());
const optionalEmail = z.preprocess(emptyToUndefined, emailSchema.optional());
const optionalDate = z.preprocess(emptyToUndefined, z.coerce.date().optional());

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
  knownIllness: optionalText(512),
  favoriteColor: optionalText(32),
  graduatedSchool: optionalText(128),
  politicalView: optionalText(128),
  notes: optionalText(4000),
  isPrimary: z.boolean().default(false),
});
export type ContactCreateInput = z.infer<typeof contactCreateSchema>;

export const contactUpdateSchema = contactCreateSchema.partial();
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;
