// Raporlar sayfasının sekmeleri; App tembel yüklenen sayfayı çekmeden hedefi çözebilsin diye ayrı dosya.
export const REPORT_MODES = ["operasyonel", "karlilik", "hedefler", "analitik"] as const;
export type ReportMode = (typeof REPORT_MODES)[number];
export const isReportMode = (value: unknown): value is ReportMode => REPORT_MODES.includes(value as ReportMode);

/** Gösterge panelinden gelen `mode:operasyonel` gibi bir hedef; yoksa son seçilen sekme kalır. */
export const parseReportMode = (query: string | undefined): ReportMode | null => {
  const value = query?.startsWith("mode:") ? query.slice("mode:".length) : null;
  return isReportMode(value) ? value : null;
};
