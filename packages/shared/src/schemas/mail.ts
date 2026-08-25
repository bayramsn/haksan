import { z } from 'zod';
import { emailSchema } from './common';

const safeMailSubjectSchema = z
  .string()
  .trim()
  .min(1, 'Konu zorunludur')
  .max(255)
  .refine((value) => !/[\r\n]/.test(value), 'E-posta konusu satır sonu içeremez');

export const userMailAccountUpsertSchema = z
  .object({
    email: emailSchema,
    displayName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((value) => !/[\r\n]/.test(value), 'Gönderen adı satır sonu içeremez'),
    password: z.string().min(1).max(512),
  })
  .strict();
export type UserMailAccountUpsertInput = z.infer<typeof userMailAccountUpsertSchema>;

export const userMailAccountStatusSchema = z.object({
  featureEnabled: z.boolean(),
  configured: z.boolean(),
  email: emailSchema.nullable(),
  displayName: z.string().max(255).nullable(),
  status: z.enum(['active', 'error']).nullable(),
  serverLabel: z.string().max(255).nullable(),
  lastVerifiedAt: z.string().datetime().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
});
export type UserMailAccountStatus = z.infer<typeof userMailAccountStatusSchema>;

export const mailSendSchema = z
  .object({
    to: emailSchema,
    /** Bilgi alıcıları; hem kendi ekibimiz hem müşteri kontakları olabilir. */
    cc: z.array(emailSchema).max(20).optional(),
    subject: safeMailSubjectSchema,
    body: z.string().trim().min(1, 'Mesaj zorunludur').max(10_000),
    companyId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    /** Verilirse teklifin PDF'i sunucuda üretilip mesaja eklenir. */
    quoteId: z.string().uuid().optional(),
  })
  .strict();
export type MailSendInput = z.infer<typeof mailSendSchema>;

/** Alıcı seçicisinin verisi: firmanın kontakları + kendi kullanıcılarımız. */
export const mailRecipientOptionSchema = z.object({
  email: emailSchema,
  name: z.string().max(255),
  detail: z.string().max(255).nullable(),
  contactId: z.string().uuid().nullable(),
});
export type MailRecipientOption = z.infer<typeof mailRecipientOptionSchema>;

export const mailRecipientsSchema = z.object({
  contacts: z.array(mailRecipientOptionSchema),
  colleagues: z.array(mailRecipientOptionSchema),
});
export type MailRecipients = z.infer<typeof mailRecipientsSchema>;

export const mailSendResultSchema = z.object({
  delivered: z.literal(true),
  messageId: z.string().max(255).nullable(),
  sentAt: z.string().datetime(),
});
export type MailSendResult = z.infer<typeof mailSendResultSchema>;
