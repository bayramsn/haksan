/** Web ticari bilgi formu gibi boş tahmini tutar, alanı atlamak yerine sıfır olarak kaydedilir. */
export function opportunityEstimate(value: string): number | null {
  const amount = Number(value.trim().replace(',', '.'));
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}
