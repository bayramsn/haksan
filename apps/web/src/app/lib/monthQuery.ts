/**
 * Rapor tablosundan listeye inerken dönem `initialQuery` ile taşınır:
 * `month:2026-03` (ay) ya da `month:2026` (yıl). Liste sayfaları bu öneki
 * serbest metin aramasından ayırır; kaydın tarihi önekle başlıyorsa geçer.
 */
export const MONTH_QUERY_PREFIX = "month:";

export const monthQuery = (bucket: string) => `${MONTH_QUERY_PREFIX}${bucket}`;

export function parseMonthQuery(query: string | undefined): { month: string | null; text: string } {
  const raw = query ?? "";
  if (!raw.startsWith(MONTH_QUERY_PREFIX)) return { month: null, text: raw };
  const month = raw.slice(MONTH_QUERY_PREFIX.length).trim();
  return { month: /^\d{4}(-\d{2})?$/.test(month) ? month : null, text: "" };
}

/** `2026-03-14` gibi bir tarih seçilen ay/yıl kovasına düşüyor mu. */
export const inMonth = (date: string | undefined, month: string | null) =>
  !month || String(date ?? "").startsWith(month);
