/** Web MachinesPage garanti kuralları ve makine formu yardımcıları. */

export type WarrantyState = 'active' | 'expiring' | 'expired' | 'unknown';

const DAY_MS = 86_400_000;

export function warrantyInfo(warrantyEnd: string | null | undefined, now: number): { state: WarrantyState; days: number | null } {
  if (!warrantyEnd) return { state: 'unknown', days: null };
  const end = new Date(warrantyEnd).getTime();
  if (Number.isNaN(end)) return { state: 'unknown', days: null };
  const days = Math.ceil((end - now) / DAY_MS);
  if (days < 0) return { state: 'expired', days };
  if (days <= 60) return { state: 'expiring', days };
  return { state: 'active', days };
}

/** Web liste rozeti: "Garanti aktif" / "N gün kaldı" / "Süresi doldu" / "Garanti yok". */
export function warrantyShortLabel(info: { state: WarrantyState; days: number | null }): string {
  if (info.state === 'expiring') return `${info.days} gün kaldı`;
  if (info.state === 'expired') return 'Süresi doldu';
  if (info.state === 'unknown') return 'Garanti yok';
  return 'Garanti aktif';
}

export const WARRANTY_TONE: Record<WarrantyState, 'success' | 'warning' | 'destructive' | 'neutral'> = {
  active: 'success',
  expiring: 'warning',
  expired: 'destructive',
  unknown: 'neutral',
};

export function warrantyStats(rows: { warrantyEndDate: string | null }[], now: number): Record<WarrantyState, number> {
  const stats: Record<WarrantyState, number> = { active: 0, expiring: 0, expired: 0, unknown: 0 };
  for (const row of rows) stats[warrantyInfo(row.warrantyEndDate, now).state] += 1;
  return stats;
}

/** Web makine durumu: garanti bitmişse "Garanti Dışı", aksi halde "Aktif". */
export function machineStatusLabel(warrantyEnd: string | null | undefined, now: number): string {
  return warrantyInfo(warrantyEnd, now).state === 'expired' ? 'Garanti Dışı' : 'Aktif';
}

/** YYYY-AA-GG'ye yıl ekler (29 Şubat → 28 Şubat). Geçersiz girişte boş döner. */
export function addYears(day: string, years: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!match) return '';
  const year = Number(match[1]) + years;
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const date = Math.min(Number(match[3]), lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
}

/** Web CreateMachineDialog not alanı: "Model · Seri No". */
export function machineNotes(model: string, serial: string): string {
  return [model.trim(), serial.trim()].filter(Boolean).join(' · ');
}

/** Makine için servis şikayet bağlantısı başlığı. */
export function complaintLinkTitle(model: string | null | undefined): string {
  return `${model?.trim() || 'Makine'} Servis Formu`;
}

/**
 * Herkese açık şikayet formu adresi. Sunucu yalnız göreli yol döner; web
 * uygulamasının kökü (appLinkHost) bilinmiyorsa API kökü kullanılır.
 */
export function publicComplaintUrl(origin: string, publicPath: string): string {
  const base = origin.replace(/\/+$/, '');
  const path = publicPath.startsWith('/') ? publicPath : `/${publicPath}`;
  return `${base}${path}`;
}
