const compactWhitespace = (value: string) => value.trim().replace(/\s+/gu, ' ');

/** Değeri Türkçe karakter kurallarıyla (i→İ, ı korunur) tek biçimde BÜYÜK harfe çevirir. */
export const normalizeUpperName = (value: string) =>
  compactWhitespace(value).toLocaleUpperCase('tr-TR');

/** Firma unvanlarını Türkçe karakter kurallarıyla BÜYÜK harfle saklar. */
export const normalizeCompanyName = normalizeUpperName;

/** Kontak adlarını Türkçe karakter kurallarıyla BÜYÜK harfle saklar. */
export const normalizePersonName = normalizeUpperName;
