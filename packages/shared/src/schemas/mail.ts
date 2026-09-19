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

/** Tek mailde taşınabilecek kullanıcı dosyası sayısı. */
export const MAIL_MAX_ATTACHMENTS = 5;
/** Eklerin toplam ham boyutu; SMTP tarafı base64 ile ~%33 büyütür. */
export const MAIL_MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

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
    /**
     * Teklifin "Yazdır / PDF Kaydet" belgesi (tarayıcının ürettiği HTML, görseller gömülü).
     * Verilirse ek PDF bu belgeden headless Chromium ile üretilir; yoksa sunucu şablonu kullanılır.
     */
    quoteDocument: z
      .object({
        html: z.string().min(1).max(8_000_000),
        filename: z.string().trim().min(1).max(200).regex(/^[^\\/\u0000-\u001f]+\.pdf$/i, 'Dosya adı yol ayracı içeremez ve .pdf ile bitmeli'),
      })
      .optional(),
    /**
     * Rapor ekranının "Yazdır / PDF Kaydet" belgesi (görseller gömülü HTML). Verilirse
     * ek PDF bundan üretilir; `reports.export` yetkisi ister ve teklif ekinden bağımsızdır.
     */
    reportDocument: z
      .object({
        html: z.string().min(1).max(8_000_000),
        filename: z.string().trim().min(1).max(200).regex(/^[^\\/\u0000-\u001f]+\.pdf$/i, 'Dosya adı yol ayracı içeremez ve .pdf ile bitmeli'),
      })
      .optional(),
    /**
     * Kullanıcının eklediği dosyalar. İçerik gövdede taşınmaz: dosya normal
     * yükleme yolundan (MIME + uzantı + boyut + magic-byte doğrulaması) geçip
     * kayda bağlanır, mail yalnız kimliğini taşır. Sunucu gönderirken erişim
     * yetkisini ve toplam ek boyutunu ayrıca doğrular.
     */
    fileIds: z.array(z.string().uuid()).max(MAIL_MAX_ATTACHMENTS).optional(),
  })
  .strict()
  // İki ek yolu birlikte gelirse sunucu teklif ekini seçip raporu sessizce düşürürdü.
  .refine((value) => !(value.quoteId && value.reportDocument), {
    path: ['reportDocument'],
    message: 'Teklif eki ile rapor eki aynı mailde gönderilemez',
  });
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
