/** Kurulum saha konumu ve süre gösterimi için ortak yardımcılar. */

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

export function roundBillableHours(durationMinutes: number): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return 0;
  if (durationMinutes <= 60) return 1;

  const wholeHours = Math.floor(durationMinutes / 60);
  const remainder = durationMinutes % 60;
  if (remainder <= 15) return wholeHours;
  if (remainder <= 45) return wholeHours + 0.5;
  return wholeHours + 1;
}

export interface InstallationFee {
  locationType: InstallationLocationType;
  durationMinutes: number;
  billedHours: number;
  hourlyRate: number;
  amount: number;
  currency: string;
}

export function computeInstallationFee(
  durationMinutes: number,
  locationType: InstallationLocationType,
): InstallationFee {
  const hourlyRate = INSTALLATION_HOURLY_RATES[locationType] ?? INSTALLATION_HOURLY_RATES.istanbul_ici;
  const billedHours = roundBillableHours(durationMinutes);
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
