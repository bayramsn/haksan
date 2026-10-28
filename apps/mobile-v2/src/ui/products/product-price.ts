/** Missing prices must remain distinct from explicitly entered zero prices. */
export function hasProductPrice(value: string | number | null | undefined): boolean {
  return value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
}

export function productPriceLabel(value: string | number | null | undefined, currency?: string | null): string {
  if (!hasProductPrice(value)) return 'Fiyat girilmemiş';
  const amount = Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount} ${currency?.trim() || '(para birimi belirtilmemiş)'}`;
}
