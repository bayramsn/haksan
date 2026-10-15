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

/** Undefined means legacy fallback; an explicit empty source list must stay empty. */
export function snapshotStandardEquipment(specs: readonly { key?: unknown; value?: unknown }[] | null | undefined): string[] | undefined {
  const source = specs?.find(spec => String(spec.key ?? '').trim().toLocaleLowerCase('tr-TR') === 'standart donanım');
  return source ? String(source.value ?? '').split(/\r?\n/).map(value => value.trim()).filter(Boolean) : undefined;
}
