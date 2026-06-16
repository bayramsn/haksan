/**
 * Kurulum (saha) ücretlendirme mantığı — backend ve frontend için TEK kaynak.
 *
 * Kural:
 *   - Gidilen yer İstanbul içi ise saatlik 70 USD, İstanbul dışı ise 100 USD.
 *   - İlk 1 saat her hâlükârda tam faturalanır (minimum 1 saat).
 *   - 1 saatten sonra, her saatin küsuratı şu eşiklere göre yuvarlanır:
 *       •  0–15 dk  → tam saate yuvarla   (örn. 1:10 → 1.0, 1:15 → 1.0)
 *       • 16–45 dk  → buçuğa yuvarla       (örn. 1:16 → 1.5, 1:45 → 1.5)
 *       • 46–59 dk  → üst saate yuvarla    (örn. 1:46 → 2.0)
 *
 * Para birimi şimdilik USD sabittir.
 */

export type InstallationLocationType = 'istanbul_ici' | 'istanbul_disi';

/** Konum tipine göre saatlik ücret (USD). */
export const INSTALLATION_HOURLY_RATES: Record<InstallationLocationType, number> = {
  istanbul_ici: 70,
  istanbul_disi: 100,
};

/** Kurulum ücreti para birimi (şimdilik sabit). */
export const INSTALLATION_FEE_CURRENCY = 'USD';

/** Arayüzde gösterilecek konum etiketleri. */
export const INSTALLATION_LOCATION_LABELS: Record<InstallationLocationType, string> = {
  istanbul_ici: 'İstanbul içi',
  istanbul_disi: 'İstanbul dışı',
};

/**
 * Süreyi (dakika) faturalanabilir saate yuvarlar.
 * Minimum 1 saat; sonrasında 15/45 dk eşikleriyle çeyrek-yarım-tam yuvarlama.
 */
export function roundBillableHours(durationMinutes: number): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return 0;
  // İlk saat tam faturalanır (minimum 1 saat).
  if (durationMinutes <= 60) return 1;

  const wholeHours = Math.floor(durationMinutes / 60);
  const remainder = durationMinutes % 60; // 0..59

  let fraction: number;
  if (remainder <= 15) fraction = 0; //  0–15 dk → tam saate
  else if (remainder <= 45) fraction = 0.5; // 16–45 dk → buçuğa
  else fraction = 1; // 46–59 dk → üst saate

  return wholeHours + fraction;
}

export interface InstallationFee {
  locationType: InstallationLocationType;
  durationMinutes: number;
  /** Faturalanan yuvarlanmış saat (örn. 1.5). */
  billedHours: number;
  /** Uygulanan saatlik ücret (USD). */
  hourlyRate: number;
  /** Toplam ücret = billedHours × hourlyRate (USD). */
  amount: number;
  currency: string;
}

/**
 * Verilen süre ve konum için kurulum ücretini hesaplar.
 * `durationMinutes` 0/negatif/geçersiz ise ücret 0 döner.
 */
export function computeInstallationFee(
  durationMinutes: number,
  locationType: InstallationLocationType,
): InstallationFee {
  const hourlyRate = INSTALLATION_HOURLY_RATES[locationType] ?? INSTALLATION_HOURLY_RATES.istanbul_ici;
  const billedHours = roundBillableHours(durationMinutes);
  // 2 ondalık hassasiyetinde tut (örn. 1.5 × 70 = 105.00).
  const amount = Math.round(billedHours * hourlyRate * 100) / 100;
  return {
    locationType,
    durationMinutes,
    billedHours,
    hourlyRate,
    amount,
    currency: INSTALLATION_FEE_CURRENCY,
  };
}

/** "1 saat 30 dk" gibi okunur süre etiketi. */
export function formatDuration(durationMinutes: number): string {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return '—';
  const h = Math.floor(durationMinutes / 60);
  const m = durationMinutes % 60;
  if (h === 0) return `${m} dk`;
  if (m === 0) return `${h} saat`;
  return `${h} saat ${m} dk`;
}
