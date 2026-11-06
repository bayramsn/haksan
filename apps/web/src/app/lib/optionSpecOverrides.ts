import type { Product } from "./mock";
import { normalizeProductSpecKey } from "./productSpecTemplates";

export type OptionSpecTemplateField = { specKey: string; defaultValue: string };

/**
 * Teklifteki kuralın aynısı (QuoteDialog.onPickOptionProduct): seçilen opsiyonel
 * donanımın ürün tipi şablonundaki bir alan tezgahın teknik bilgisinde varsa o
 * satırın değeri değişir. Değer önceliği: opsiyonun kendi teknik değeri → yoksa
 * şablon başlangıç değeri. Etkilemeyen opsiyonlar teknik tabloya dokunmaz.
 */
export const applyOptionSpecOverrides = <S extends { key: string; value: string }>(
  specs: S[],
  options: Product[],
  templatesByType: Record<string, OptionSpecTemplateField[]>,
): S[] => {
  const applied = new Map<string, string>();
  for (const option of options) {
    for (const field of templatesByType[option.productTypeCode ?? ""] ?? []) {
      const key = normalizeProductSpecKey(field.specKey);
      if (!specs.some((s) => normalizeProductSpecKey(s.key) === key)) continue;
      const own = option.specs?.find((s) => normalizeProductSpecKey(s.key) === key)?.value?.trim();
      const value = own || field.defaultValue.trim();
      if (value) applied.set(key, value);
    }
  }
  if (!applied.size) return specs;
  return specs.map((s) => {
    const value = applied.get(normalizeProductSpecKey(s.key));
    return value ? { ...s, value } : s;
  });
};
