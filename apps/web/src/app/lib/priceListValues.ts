export function parsePriceInput(text: string): number | null {
  const clean = text.trim();
  if (!clean) return null;
  const value = Number(clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
export function formatPrice(value: number | null | undefined, currency: string): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('tr-TR')} ${currency === 'TRY' ? 'TL' : currency}`;
}
