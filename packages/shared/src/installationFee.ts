/** Kurulum saha konumu ve süre gösterimi için ortak yardımcılar. */

export type InstallationLocationType = 'istanbul_ici' | 'istanbul_disi';

/** Arayüzde gösterilecek konum etiketleri. */
export const INSTALLATION_LOCATION_LABELS: Record<InstallationLocationType, string> = {
  istanbul_ici: 'İstanbul içi',
  istanbul_disi: 'İstanbul dışı',
};

/** "1 saat 30 dk" gibi okunur süre etiketi. */
export function formatDuration(durationMinutes: number): string {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return '—';
  const h = Math.floor(durationMinutes / 60);
  const m = durationMinutes % 60;
  if (h === 0) return `${m} dk`;
  if (m === 0) return `${h} saat`;
  return `${h} saat ${m} dk`;
}
