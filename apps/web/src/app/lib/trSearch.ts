/**
 * Türkçe metin arama karşılaştırması.
 *
 * Combobox listelerinde (il/ilçe, firma, ürün…) kullanıcı Türkçe klavye
 * kullanmadan da arayabilsin diye aksanlar sadeleştirilir ve küçük harfe
 * indirilir: "ist" → İstanbul, "besiktas" → Beşiktaş, "sisli" → Şişli.
 *
 * `toLocaleLowerCase("tr-TR")` tek başına yetmez: ASCII "I" harfini "ı"ya
 * çevirdiği için "Istanbul" yazan kullanıcı hiçbir sonuç göremezdi.
 * Boşluk ve rakamlar korunur; çok kelimeli aramalar bozulmaz.
 */
const TR_FOLD: Record<string, string> = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i", I: "i", ö: "o", Ö: "o",
  ş: "s", Ş: "s", ü: "u", Ü: "u", â: "a", Â: "a", î: "i", Î: "i", û: "u", Û: "u",
};

/** Arama anahtarına indirger (aksansız, küçük harf). */
export const foldTr = (value: string): string =>
  value.replace(/[çÇğĞıİIöÖşŞüÜâÂîÎûÛ]/g, (ch) => TR_FOLD[ch] ?? ch).toLowerCase();

/** `haystack`, `needle` ifadesini Türkçe duyarsız biçimde içeriyor mu? */
export const matchesTr = (haystack: string, needle: string): boolean =>
  foldTr(haystack).includes(foldTr(needle));
