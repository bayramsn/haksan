import { z } from 'zod';
import { paginationSchema } from './common';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
/** Boş veya yalnız boşluk olan değer "girilmedi" (null) sayılır. */
const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);

// Varsayılan değer yok: güncelleme şeması bundan `.partial()` ile türüyor ve
// alan varsayılanları PATCH'te gönderilmeyen alanları ezmemeli.
const tradeFairContactFields = z.object({
  fairName: z.string().trim().min(1, 'Fuar adı zorunlu').max(200),
  companyName: z.string().trim().min(1, 'Firma adı zorunlu').max(255),
  contactName: z.string().trim().min(1, 'Yetkili adı soyadı zorunlu').max(200),
  contactTitle: optionalText(120),
  mobilePhone: z.preprocess(
    blankToNull,
    z.string().trim().max(32).refine((v) => v.replace(/\D/g, '').length >= 7, 'Telefon en az 7 rakam içermelidir').nullable().optional()
  ),
  email: z.preprocess(blankToNull, z.string().trim().email('Geçerli bir e-posta girin').max(254).nullable().optional()),
  country: z.string().trim().min(1).max(64),
  province: optionalText(128),
  district: optionalText(128),
  productCategory: optionalText(128),
  productType: optionalText(255),
  // Not ya da fotoğraf/dosya eki zorunlu; ek kayıttan sonra yüklendiği için bu
  // kural formda (web + mobil) uygulanır, sunucuda not isteğe bağlı.
  notes: optionalText(4000),
  metByUserId: z.string().uuid().nullable().optional(),
  /** Eski alan; arayüz artık göndermiyor. */
  departmentId: z.string().uuid().nullable().optional(),
  /** Görüşmenin bölümü (CNC / Üniversal / Sac İşleme); ürün seçimi bu bölüme göre. */
  divisionId: z.string({ required_error: 'Bölüm seçimi zorunlu' }).uuid('Bölüm seçimi zorunlu'),
  /** İlgilenilen CRM ürünleri; boş liste = ürün seçilmedi. */
  productModelIds: z.array(z.string().uuid()).max(20, 'En fazla 20 ürün seçilebilir').optional(),
  visitorCount: z.coerce.number().int().min(1, 'Görüşülen kişi en az 1 olmalı').max(999, 'Görüşülen kişi en fazla 999 olabilir'),
});

export const tradeFairContactCreateSchema = tradeFairContactFields.extend({
  country: tradeFairContactFields.shape.country.default('Türkiye'),
  visitorCount: tradeFairContactFields.shape.visitorCount.default(1),
});
export const tradeFairContactUpdateSchema = tradeFairContactFields.partial();
export type TradeFairContactInput = z.infer<typeof tradeFairContactCreateSchema>;
export type TradeFairContactUpdateInput = z.infer<typeof tradeFairContactUpdateSchema>;

export const tradeFairListQuerySchema = paginationSchema.extend({
  fairName: z.string().trim().max(200).optional(),
  q: z.string().trim().max(200).optional(),
  metByUserId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
});

/** Fuar formundaki ürün seçici: seçilen bölümün (ve ortak) katalog ürünleri. */
export const tradeFairProductQuerySchema = z.object({
  divisionId: z.string().uuid(),
  q: z.string().trim().max(200).optional(),
});
export type TradeFairProductQuery = z.infer<typeof tradeFairProductQuerySchema>;
export type TradeFairListQuery = z.infer<typeof tradeFairListQuerySchema>;

/**
 * Fuar kaydını Firmalar'a ekleme: `companyId` verilirse mevcut firmaya kontak
 * olarak bağlanır, verilmezse kayıttaki bilgilerle yeni firma açılır.
 */
export const tradeFairToCompanySchema = z.object({
  companyId: z.string().uuid().optional(),
  /** Yeni firmanın bölümü; tek bölümlü kullanıcıda boş bırakılabilir. */
  divisionIds: z.array(z.string().uuid()).min(1).max(16).optional(),
});
export type TradeFairToCompanyInput = z.infer<typeof tradeFairToCompanySchema>;

/** Formlardaki "not ya da ek" kuralının ortak mesajı. */
export const TRADE_FAIR_NOTE_OR_ATTACHMENT_MESSAGE = 'Not yazın ya da fotoğraf/dosya ekleyin';
