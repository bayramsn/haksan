/** Saf JS tarih/saat seçici mantığı (yerel takvim paketi yok). Hafta pazartesi başlar. */

export const WEEKDAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

export const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
] as const;

export type GridDay = { date: Date; inMonth: boolean; key: string };

function key(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** 6×7 ızgara: önceki/sonraki ayın günleri `inMonth: false`. */
export function monthGrid(year: number, month: number): GridDay[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const days: GridDay[] = [];
  for (let index = 0; index < 42; index++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    days.push({ date, inMonth: date.getMonth() === month, key: key(date) });
  }
  return days;
}

export function isSameDay(a: Date | null | undefined, b: Date | null | undefined): boolean {
  return Boolean(a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate());
}

/** Seçili günün tarihini korur, saati/dakikayı değiştirir. */
export function withTime(date: Date, hours: number, minutes: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

/** Seçili saati korur, günü değiştirir. */
export function withDay(time: Date, day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.getHours(), time.getMinutes(), 0, 0);
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export function minuteSteps(step: number): number[] {
  const safe = Math.max(1, Math.min(30, Math.floor(step)));
  return Array.from({ length: Math.ceil(60 / safe) }, (_, index) => index * safe);
}

/** Dakikayı en yakın adıma yuvarlar (taşarsa saati ilerletir). */
export function roundToStep(date: Date, step: number): Date {
  const ms = step * 60_000;
  return new Date(Math.round(date.getTime() / ms) * ms);
}

const pad = (value: number) => String(value).padStart(2, '0');

export function formatPickerValue(date: Date | null, mode: 'date' | 'datetime'): string {
  if (!date) return '';
  const day = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
  return mode === 'date' ? day : `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
