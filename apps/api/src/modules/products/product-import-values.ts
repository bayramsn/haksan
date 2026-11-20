/** Excel conventions are normalized only at the import boundary. */
export function importedCurrencyCode(value: string): string {
  const code = value.trim().toUpperCase();
  return ['TL', '₺', 'TÜRK LİRASI', 'TURK LIRASI'].includes(code) ? 'TRY' : code;
}
export function importedVatRate(value: number | undefined): number {
  if (value === undefined) return 20;
  return value === 0.01 ? 1 : value === 0.1 ? 10 : value === 0.2 ? 20 : value;
}
export function importedCellValue(value: unknown, numberFormat: string, stringify: (value: unknown) => string): string {
  // Identifiers formatted as 000000 keep their leading zeroes; prices/rates retain raw numeric values.
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && /^0{2,32}$/.test(numberFormat)) {
    return String(value).padStart(numberFormat.length, '0');
  }
  return stringify(value);
}
