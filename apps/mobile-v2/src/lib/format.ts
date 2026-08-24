const currency = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  maximumFractionDigits: 0,
});
const decimal = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });

export const formatMoney = (n: number): string => currency.format(n);

/**
 * KPI kutusuna sığması için: 22184674 -> "22,2 Mn".
 * Hermes'in Intl'i `notation: 'compact'` desteklemiyor (sessizce tam sayı
 * döndürüyor), bu yüzden elle: bin / milyon / milyar.
 */
const UNITS: [threshold: number, suffix: string][] = [
  [1e9, ' Mr'],
  [1e6, ' Mn'],
  [1e3, ' B'],
];

export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  for (const [threshold, suffix] of UNITS) {
    if (abs >= threshold) return decimal.format(n / threshold) + suffix;
  }
  return decimal.format(n);
}

/** §6.3: panel günün saatine göre farklı özet gösterir. */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 6) return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

/* ------------------------------------------------------------- tarihler ---- */

const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
const longDateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "20 May 2025". Geçersiz/boş değerde tire döner — listede boşluk kalmasın. */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : '—';
}

/** "14:30" */
export function formatTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? timeFmt.format(d) : '—';
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? `${dateFmt.format(d)} ${timeFmt.format(d)}` : '—';
}

/** Liste başlığı: "Bugün" / "Dün" / "20 Mayıs Çarşamba". */
export function dayLabel(value: string | Date | null | undefined, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return '—';
  const days = daysBetween(d, now);
  if (days === 0) return 'Bugün';
  if (days === 1) return 'Dün';
  return longDateFmt.format(d);
}

/** Takvim günü farkı (saat farkı değil): dün 23:50 ile bugün 00:10 = 1 gün. */
function daysBetween(a: Date, b: Date): number {
  const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((startB - startA) / 86_400_000);
}

/** Bildirim satırı: "az önce" / "5 dk önce" / "2 saat önce" / "3 gün önce". */
export function relativeTime(value: string | Date | null | undefined, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return '—';
  const seconds = Math.round((now.getTime() - d.getTime()) / 1000);
  if (seconds < 0) return formatDateTime(d); // gelecekteki tarih: göreli anlatım yanıltır
  if (seconds < 60) return 'az önce';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = daysBetween(d, now);
  if (days < 30) return `${days} gün önce`;
  return formatDate(d);
}

/**
 * Sunucu para alanlarını `::text` döndürüyor (kuruş kaybetmemek için). Gösterim
 * anında sayıya çevrilir; hesap yapılacaksa bu fonksiyon kullanılmamalı.
 */
export function formatAmount(value: string | number | null | undefined, currencyCode = 'TRY'): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Vade rozeti: negatif = gecikmiş. */
export function dueLabel(value: string | Date | null | undefined, now: Date = new Date()): { text: string; overdue: boolean } | null {
  const d = toDate(value);
  if (!d) return null;
  const days = daysBetween(now, d);
  if (days < 0) return { text: `${Math.abs(days)} gün gecikti`, overdue: true };
  if (days === 0) return { text: 'Bugün', overdue: false };
  return { text: `${days} gün kaldı`, overdue: false };
}

/* ------------------------------------------------- yerel datetime giriş ---- */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Form inputlarına yazılan "YYYY-AA-GG SS:DD" gösterimi. Yerel saat korunur;
 * ISO'ya çevrilmez — sunucu z.coerce.date ile aynı anda ayrıştırır.
 */
export function formatLocalDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** formatLocalDateTime'in tersi; geçersiz değer null döner. */
export function parseLocalDateTime(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ||
    date.getHours() !== hour || date.getMinutes() !== minute
  ) return null;
  return date;
}
