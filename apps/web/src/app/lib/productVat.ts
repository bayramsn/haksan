/** Product form defaults supplied by the business: lathes 10%, machining centres 20%. */
export function defaultVatRateForProductType(code: string, label = '', isMachine = true): string | null {
  if (!isMachine) return null;
  const value = `${code} ${label}`.toLocaleUpperCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/TORNA|LATHE/.test(value)) return '10';
  if (/ISLEME[_ ]MERKEZ|MACHINING[_ ]CENT/.test(value)) return '20';
  return null;
}
