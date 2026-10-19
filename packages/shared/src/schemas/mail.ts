import { z } from 'zod';
import { emailSchema } from './common';
import { companyListQuerySchema } from './company';

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

export const mailSignatureSchema = z.object({
  image: z.string().max(2_800_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/).nullable(),
  filename: z.string().max(200).regex(/^[^\\/\u0000-\u001f]+\.(png|jpe?g|webp)$/i).nullable(),
}).strict().refine((value) => Boolean(value.image) === Boolean(value.filename), 'Görsel ve dosya adı birlikte verilmelidir');
export type MailSignatureInput = z.infer<typeof mailSignatureSchema>;

export const MAIL_SIGNATURE_MAX = 2000;

/** Mailin sonuna eklenen düz metin imza; null varsayılana döner, boş metin imzayı kapatır. */
export const userMailSignatureSchema = z
  .object({ signature: z.string().max(MAIL_SIGNATURE_MAX).nullable() })
  .strict();
export type UserMailSignatureInput = z.infer<typeof userMailSignatureSchema>;

/**
 * Tarayıcının "Yazdır / PDF Kaydet" belgesi (görseller gömülü HTML). Sunucu bunu
 * headless Chromium ile PDF'e çevirir: indirme ucu ve mail ekleri aynı şekli kullanır.
 */
export const PRINT_DOCUMENT_MAX_CHARS = 8_000_000;
export const printDocumentPdfSchema = z.object({
  html: z.string().min(1).max(PRINT_DOCUMENT_MAX_CHARS),
  filename: z.string().trim().min(1).max(200).regex(/^[^\\/\u0000-\u001f"]+\.pdf$/i, 'Dosya adı yol ayracı içeremez ve .pdf ile bitmeli'),
});
export type PrintDocumentPdf = z.infer<typeof printDocumentPdfSchema>;

export const userMailAccountStatusSchema = z.object({
  featureEnabled: z.boolean(),
  configured: z.boolean(),
  email: emailSchema.nullable(),
  displayName: z.string().max(255).nullable(),
  status: z.enum(['active', 'error']).nullable(),
  serverLabel: z.string().max(255).nullable(),
  lastVerifiedAt: z.string().datetime().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
  signatureImage: z.string().nullable().optional(),
  signatureFilename: z.string().nullable().optional(),
  /** Kullanıcının kaydettiği imza; null = profilden üretilen varsayılan, '' = imzasız. */
  signature: z.string().max(MAIL_SIGNATURE_MAX).nullable(),
  /** Kayıtlı imza yoksa maile eklenen, profilden (ad, ünvan, telefon, e-posta) üretilen imza. */
  defaultSignature: z.string().max(MAIL_SIGNATURE_MAX),
});
export type UserMailAccountStatus = z.infer<typeof userMailAccountStatusSchema>;

/** Tek mailde taşınabilecek kullanıcı dosyası sayısı. */
export const MAIL_MAX_ATTACHMENTS = 10;
/**
 * Eklerin toplam ham boyutu. SMTP base64 ile ~%37 büyütür: 25 MB ≈ 34 MB ileti.
 * Gönderen sunucu (mail.haksancnc.com.tr) 50 MB kabul ediyor; sınırı belirleyen alıcı
 * tarafı — Exchange Online'ın ~36 MB varsayılanının altında kalmak için 25 MB.
 */
export const MAIL_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
/** Firmaya giden tek mailde birlikte gönderilebilecek teklif sayısı. */
export const MAIL_MAX_QUOTES = 5;

export const mailSendSchema = z
  .object({
    to: emailSchema,
    /** Bilgi alıcıları; hem kendi ekibimiz hem müşteri kontakları olabilir. */
    cc: z.array(emailSchema).max(20).optional(),
    subject: safeMailSubjectSchema,
    body: z.string().trim().min(1, 'Mesaj zorunludur').max(10_000),
    companyId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    /** Verilirse teklifin PDF'i sunucuda üretilip mesaja eklenir. Eski istemciler; yenileri `quotes` gönderir. */
    quoteId: z.string().uuid().optional(),
    /**
     * Aynı maile eklenecek teklifler. `document` verilirse ek PDF o belgeden
     * (Chromium) üretilir, yoksa sunucunun sade şablonu kullanılır.
     */
    quotes: z
      .array(z.object({ id: z.string().uuid(), document: printDocumentPdfSchema.optional() }).strict())
      .min(1)
      .max(MAIL_MAX_QUOTES)
      .refine((items) => new Set(items.map((item) => item.id)).size === items.length, 'Aynı teklif iki kez eklenemez')
      .optional(),
    /**
     * Teklifin "Yazdır / PDF Kaydet" belgesi (tarayıcının ürettiği HTML, görseller gömülü).
     * Verilirse ek PDF bu belgeden headless Chromium ile üretilir; yoksa sunucu şablonu kullanılır.
     */
    quoteDocument: printDocumentPdfSchema.optional(),
    /**
     * Rapor ekranının "Yazdır / PDF Kaydet" belgesi (görseller gömülü HTML). Verilirse
     * ek PDF bundan üretilir; `reports.export` yetkisi ister ve teklif ekinden bağımsızdır.
     */
    reportDocument: printDocumentPdfSchema.optional(),
    /** Ürünün teknik föyü; sunucu ürün okuma ve bölüm erişimini doğrular. */
    productDocument: z.object({ id: z.string().uuid(), pdf: printDocumentPdfSchema }).strict().optional(),
    /**
     * Proforma / sözleşme gibi belge kayıtlarının "Yazdır / PDF Kaydet" çıktısı. `documentId`
     * ile birlikte gelir; sunucu kaydı görebildiğini doğrulayıp HTML'i PDF'e çevirir.
     */
    document: z
      .object({
        id: z.string().uuid(),
        kind: z.enum(['proforma', 'contract']),
        pdf: printDocumentPdfSchema,
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
  // Birden çok üretilen ek gelirse sunucu birini seçip ötekileri sessizce düşürürdü.
  .refine((value) => [value.quoteId || value.quotes, value.reportDocument, value.document, value.productDocument].filter(Boolean).length <= 1, {
    path: ['reportDocument'],
    message: 'Teklif, rapor, belge ve ürün teknik eki aynı mailde gönderilemez',
  })
  .refine((value) => !(value.quoteId && value.quotes), {
    path: ['quotes'],
    message: 'Teklif kimliği ve teklif listesi birlikte gönderilemez',
  })
  .refine((value) => !value.quoteDocument || Boolean(value.quoteId), {
    path: ['quoteId'],
    message: 'Teklif belgesi için teklif kimliği gereklidir',
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

/**
 * Toplu mail: kullanıcının kendi webmail hesabından, her alıcıya ayrı ileti.
 * Kişisel SMTP günlük kotalarını zorlamamak için tek gönderim 300 alıcıyla sınırlı.
 */
export const MAIL_CAMPAIGN_MAX_RECIPIENTS = 300;
/** Gövde ve konuda alıcıya göre doldurulan alanlar. */
export const MAIL_CAMPAIGN_PLACEHOLDERS = ['{{ad}}', '{{firma}}'] as const;

export const mailCampaignRecipientSchema = z
  .object({
    email: emailSchema,
    name: z.string().trim().max(255).optional(),
    companyName: z.string().trim().max(255).optional(),
    companyId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
  })
  .strict();
export type MailCampaignRecipientInput = z.infer<typeof mailCampaignRecipientSchema>;

export const mailCampaignCreateSchema = z
  .object({
    subject: safeMailSubjectSchema,
    body: z.string().trim().min(1, 'Mesaj zorunludur').max(10_000),
    /** Yalnız genel katalog kütüphanesindeki dosyalar eklenebilir. */
    fileIds: z.array(z.string().uuid()).max(MAIL_MAX_ATTACHMENTS).optional(),
    recipients: z.array(mailCampaignRecipientSchema).min(1, 'En az bir alıcı seçin').max(MAIL_CAMPAIGN_MAX_RECIPIENTS),
  })
  .strict();
export type MailCampaignCreateInput = z.infer<typeof mailCampaignCreateSchema>;

/** CRM alıcı adayları: Firmalar listesinin süzgeçleri + firma genel e-postalarını dahil etme. */
export const mailCampaignCandidatesQuerySchema = companyListQuerySchema.extend({
  includeCompanyEmails: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
});
export type MailCampaignCandidatesQuery = z.infer<typeof mailCampaignCandidatesQuerySchema>;
export const MAIL_CAMPAIGN_MAX_CANDIDATES = 2000;

/** Dışarıdan alıcı listesi (.xlsx / .csv); sunucu e-posta, ad ve firma sütunlarını sezer. */
export const mailRecipientListParseSchema = z
  .object({ fileName: z.string().trim().min(1).max(255), fileBase64: z.string().min(1).max(3_000_000) })
  .strict();
export type MailRecipientListParseInput = z.infer<typeof mailRecipientListParseSchema>;

/** Toplu mail almak istemeyen adres; sonraki gönderimlerde atlanır. */
export const mailSuppressionSchema = z
  .object({ email: emailSchema, reason: z.string().trim().max(255).optional() })
  .strict();
export type MailSuppressionInput = z.infer<typeof mailSuppressionSchema>;

export type MailCampaignStatus = 'sending' | 'completed' | 'cancelled' | 'failed';
export type MailCampaignRecipientStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
