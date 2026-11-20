export type TableSortDirection = 'asc' | 'desc';
export type TableSortType = 'auto' | 'text' | 'number' | 'date';
export type TableSort = { key: string; direction: TableSortDirection };
export type TableSortValue = string | number | boolean | Date | null | undefined;

const collator = new Intl.Collator('tr-TR', { numeric: true, sensitivity: 'base' });
const empty = (value: TableSortValue) => value == null || (typeof value === 'string' && (!value.trim() || /^[—–-]$/.test(value.trim())));

/** Only complete numeric cells are numbers: model names and phone labels stay text. */
export function tableNumber(value: TableSortValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let text = value.trim().replace(/\u00a0/g, ' ');
  text = text.replace(/^(?:₺|\$|€|£|TRY|TL|USD|EUR|GBP)\s*/i, '').replace(/\s*(?:₺|\$|€|£|TRY|TL|USD|EUR|GBP|%)$/i, '').trim();
  text = text.replace(/\s*(?:kW|kVA|rpm|dev\/(?:dk|dak)|mm|cm|kg|adet|Hz|volt|m²|m³)\s*$/iu, '').trim();
  if (!/^[+-]?\d[\d.,\s]*$/.test(text)) return null;
  text = text.replace(/\s/g, '');
  if (text.includes(',') && text.includes('.')) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (text.includes(',')) {
    text = /^\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, '') : text.replace(',', '.');
  } else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, '');
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function tableDate(value: TableSortValue): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const local = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (local) {
    const [, day, month, year, hour = '0', minute = '0'] = local;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day) ? date.getTime() : null;
  }
  const monthNames = ['oca', 'şub', 'mar', 'nis', 'may', 'haz', 'tem', 'ağu', 'eyl', 'eki', 'kas', 'ara'];
  const fullMonths = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
  const named = text.toLocaleLowerCase('tr-TR').match(/^(\d{1,2})\s+([a-zçğıöşü]+)\.?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/u);
  if (named) {
    const [, day, monthName, year, hour = '0', minute = '0'] = named;
    const month = fullMonths.indexOf(monthName) >= 0 ? fullMonths.indexOf(monthName) : monthNames.indexOf(monthName);
    if (month < 0) return null;
    const date = new Date(Number(year), month, Number(day), Number(hour), Number(minute));
    return date.getFullYear() === Number(year) && date.getMonth() === month && date.getDate() === Number(day) ? date.getTime() : null;
  }
  if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(text)) return null;
  const date = Date.parse(text);
  return Number.isFinite(date) ? date : null;
}

/** Stable-sort callers retain source order for equal cells. Empty cells always go last. */
export function compareTableValues(a: TableSortValue, b: TableSortValue, direction: TableSortDirection = 'asc', type: TableSortType = 'auto'): number {
  if (empty(a) || empty(b)) return empty(a) === empty(b) ? 0 : empty(a) ? 1 : -1;
  const multiplier = direction === 'asc' ? 1 : -1;
  if (type !== 'text') {
    if (type === 'auto' || type === 'date') {
      const dateA = tableDate(a), dateB = tableDate(b);
      if (dateA != null && dateB != null) return (dateA - dateB) * multiplier;
    }
    if (type === 'auto' || type === 'number') {
      const numberA = tableNumber(a), numberB = tableNumber(b);
      if (numberA != null && numberB != null) return (numberA - numberB) * multiplier;
    }
  }
  return collator.compare(String(a), String(b)) * multiplier;
}
