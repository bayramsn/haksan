import { sql, type AnyColumn } from 'drizzle-orm';

const compactWhitespace = (value: string) => value.trim().replace(/\s+/gu, ' ');

/** Değeri Türkçe karakter kurallarıyla (i→İ, ı korunur) tek biçimde BÜYÜK harfe çevirir. */
export const normalizeUpperName = (value: string) =>
  compactWhitespace(value).toLocaleUpperCase('tr-TR');

/** Firma unvanlarını Türkçe karakter kurallarıyla BÜYÜK harfle saklar. */
export const normalizeCompanyName = normalizeUpperName;

/** Kontak adlarını Türkçe karakter kurallarıyla BÜYÜK harfle saklar. */
export const normalizePersonName = normalizeUpperName;

/** Türkçe harfleri ASCII'ye katlayan tablo; SQL `translate()` ile birebir aynı. */
const NAME_KEY_FROM = 'ÇĞİIÖŞÜçğıiöşü';
const NAME_KEY_TO = 'CGIIOSUcgiiosu';

/**
 * Mükerrer firma tespiti için ünvan anahtarı: Türkçe harfler katlanır, harf/rakam
 * dışındaki her şey atılır. "Haksan Makina" ile "HAKSAN  MAKİNA." aynı anahtarı verir.
 * Tüzel kişilik ekleri (A.Ş., Ltd. Şti.) kasıtlı olarak korunur — "X Sanayi" ile
 * "X Ticaret" ayrı tüzel kişilerdir, yanlışlıkla bloklanmamalıdır.
 */
export const companyNameKey = (value: string) =>
  value
    .replace(/[ÇĞİIÖŞÜçğıiöşü]/g, (char) => NAME_KEY_TO[NAME_KEY_FROM.indexOf(char)])
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/** `companyNameKey`'in SQL karşılığı; aynı anahtarı veritabanı tarafında üretir. */
export const companyNameKeySql = (column: AnyColumn) =>
  sql`regexp_replace(lower(translate(${column}, ${NAME_KEY_FROM}, ${NAME_KEY_TO})), '[^a-z0-9]+', '', 'g')`;
