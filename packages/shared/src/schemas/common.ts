import { z } from 'zod';

// UUIDs are flexible across providers (Postgres gen_random_uuid, MySQL UUID(), SQLite text)
export const uuidSchema = z.string().uuid();
export const idSchema = z.string().min(1).max(64);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Üst sınırı aşan pageSize değerlerini 422 yerine 200'e kırp (eski istemciler).
  pageSize: z.coerce
    .number()
    .int()
    .transform((n) => Math.min(Math.max(n, 1), 200))
    .default(25),
  sortBy: z.string().max(64).optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type DateRange = z.infer<typeof dateRangeSchema>;

export const moneySchema = z.coerce.number().nonnegative().multipleOf(0.0001);
export const percentSchema = z.coerce.number().min(0).max(100).multipleOf(0.01);

export const phoneSchema = z
  .string()
  .min(5, 'Telefon en az 5 karakter olmalı')
  .max(32, 'Telefon en fazla 32 karakter olabilir')
  .regex(/^[+0-9 ()\-]*$/, 'Geçersiz telefon (yalnızca rakam, boşluk, +, parantez ve tire kullanın)');
/** ASCII-only Zod `.email()` rejects IDN/local parts (örn. ismailsomalı@…); basit unicode-safe kontrol. */
export const emailSchema = z
  .string()
  .trim()
  .max(255)
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(v), 'Geçersiz e-posta');
export const urlSchema = z.string().url('Geçersiz web adresi (örn. https://site.com)').max(512);

/**
 * Giriş için kullanılan kullanıcı adı (örn. `Raifsenturk`).
 *
 * Saklanan biçim her zaman küçük harftir; `Raifsenturk` ile `raifsenturk` aynı
 * hesaptır. Yalnızca ASCII harf/rakam ve `. _ -` kabul edilir: Türkçe/Kiril
 * harfler benzer görünen (confusable) karakterlerle taklit hesabı açmayı
 * mümkün kıldığı için bilinçli olarak dışarıda bırakılmıştır.
 *
 * Not: `.toLowerCase()` regex'ten ÖNCE gelmelidir, aksi halde büyük harfli
 * girdiler regex'e takılır.
 */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Kullanıcı adı en az 3 karakter olmalı')
  .max(32, 'Kullanıcı adı en fazla 32 karakter olabilir')
  .regex(
    /^[a-z0-9._-]+$/,
    'Kullanıcı adı yalnızca harf, rakam, nokta, alt çizgi ve tire içerebilir (boşluk kullanılamaz)'
  );

/**
 * Giriş ekranından gelen tanımlayıcı: kullanıcı adı VEYA e-posta.
 *
 * Bilinçli olarak gevşek doğrulanır — burada amaç biçim dayatmak değil, aşırı
 * uzun girdiyi kesmektir. Hesap araması her zaman parametreli ve tam eşleşmeli
 * bir sorgu ile yapılır, bu yüzden serbest metin güvenlik riski yaratmaz.
 * Sıkı doğrulama yapmak, "bu biçim geçersiz" ile "böyle kullanıcı yok"
 * arasında ayrım yaratıp kullanıcı numaralandırmasına kapı açardı.
 */
export const loginIdentifierSchema = z.string().trim().min(1).max(254);
