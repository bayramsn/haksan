/**
 * CRM teknik alanlarını silmeden yalnız müşteri çıktısında gerçek değeri olan
 * satırları seçer. Katalogdaki `-` işareti "henüz kullanılmıyor" sentinelidir.
 */
export const hasPrintableTechnicalSpecValue = (value: unknown): boolean => {
  const normalized = String(value ?? "").trim();
  return Boolean(normalized) && !/^[-–—]+$/.test(normalized);
};

export const printableTechnicalSpecs = <T extends { key?: unknown; value?: unknown }>(
  specs: readonly T[] | null | undefined,
): T[] => (specs ?? []).filter((spec) =>
  Boolean(String(spec.key ?? "").trim()) && hasPrintableTechnicalSpecValue(spec.value),
);
