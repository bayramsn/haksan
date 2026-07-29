import { colors } from '@/src/theme/tokens';

/** Stitch durum rozeti tonları — premium liste kartlarında renk kodlu statü. */
export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

export const STATUS_TONE_STYLES: Record<StatusTone, { bg: string; fg: string }> = {
  success: { bg: colors.statusActiveBg, fg: colors.statusActiveText },
  info: { bg: colors.primarySoft, fg: colors.primary },
  warning: { bg: colors.statusPotentialBg, fg: colors.statusPotentialText },
  danger: { bg: colors.accentRedSoft, fg: colors.accentRed },
  neutral: { bg: colors.statusPassiveBg, fg: colors.statusPassiveText },
};

/** Durum kodu/adından ton türetir — proforma, sözleşme, teklif vb. ortak sözlük. */
export function resolveStatusTone(code?: string | null, name?: string | null): StatusTone {
  const c = String(code ?? '').toLowerCase();
  const n = String(name ?? '').toLocaleLowerCase('tr-TR');

  // Olumlu / tamamlanmış
  if (['accepted', 'approved', 'active', 'signed', 'fulfilled', 'completed', 'paid', 'won'].includes(c)) return 'success';
  if (/(kabul|onay|aktif|imzalan|tamamlan|ödendi|odendi)/.test(n)) return 'success';

  // İptal / red / süresi dolan
  if (['cancelled', 'canceled', 'rejected', 'expired', 'lost', 'failed'].includes(c)) return 'danger';
  if (/(iptal|red|süresi|suresi|kaybedil|başarısız|basarisiz)/.test(n)) return 'danger';

  // Beklemede / kısmi
  if (['pending', 'waiting', 'partial', 'on_hold', 'potential'].includes(c)) return 'warning';
  if (/(bekle|kısmi|kismi|potansiyel)/.test(n)) return 'warning';

  // Akışta / gönderildi
  if (['sent', 'in_progress', 'shipped', 'open'].includes(c)) return 'info';
  if (/(gönderil|gonderil|yolda|işlemde|islemde|açık|acik)/.test(n)) return 'info';

  // Taslak / pasif / varsayılan
  return 'neutral';
}

export type StatusMeta = { label: string; tone: StatusTone };

/** Bir kayıttan statü etiketini ve tonunu çıkarır.
 *  `status` alanı `{ code, name }` nesnesi ya da düz string olabilir; `statusCode`/`statusName` de desteklenir. */
export function getStatusMeta(item: Record<string, unknown>, field = 'status'): StatusMeta | undefined {
  const raw = item[field];
  let code = '';
  let name = '';

  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    code = String(obj.code ?? '');
    name = String(obj.name ?? '');
  } else if (typeof raw === 'string') {
    code = raw;
  }

  if (!code && !name) {
    code = String(item.statusCode ?? '');
    name = String(item.statusName ?? '');
  }

  const label = (name || code).trim();
  if (!label) return undefined;
  return { label, tone: resolveStatusTone(code, name) };
}
