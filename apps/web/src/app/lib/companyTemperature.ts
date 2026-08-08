import { LEAD_TEMPERATURE_ORDER, type LeadTemperature, type SalesCase } from "./mock";

/**
 * Bir firmanın alım niyeti (sıcaklık).
 *
 * Sıcaklık firmada değil satış kartında tutuluyor ve bir firmanın birden çok
 * açık kartı olabiliyor. Firma kartında tek bir değer göstermek gerektiği için
 * **en sıcak** olan seçilir: satışçı için önemli olan "bu firmada sıcak bir iş
 * var mı", ortalama değil.
 *
 * Kapanmış kartlar sayılmaz — kapanmış bir işin sıcaklığı firmanın bugünkü
 * niyeti hakkında bir şey söylemez.
 */
export function companyTemperature(
  companyId: string | undefined,
  cases: Pick<SalesCase, "customerId" | "leadTemperature" | "closedAt" | "isLost">[],
): LeadTemperature | null {
  if (!companyId) return null;
  const open = cases.filter(
    (item) => item.customerId === companyId && !item.closedAt && !item.isLost,
  );
  if (open.length === 0) return null;

  for (const level of LEAD_TEMPERATURE_ORDER) {
    if (open.some((item) => (item.leadTemperature ?? "unknown") === level)) return level;
  }
  return null;
}

/**
 * Sıcaklık başına firma sayısı. Gösterge panelinde "kaç firma sıcak" sorusunun
 * cevabı; kart sayısı değil FİRMA sayısı verir, çünkü aynı firmanın üç kartı
 * olması onu üç kat sıcak yapmaz.
 */
export function companyTemperatureCounts(
  cases: Pick<SalesCase, "customerId" | "leadTemperature" | "closedAt" | "isLost">[],
): Record<LeadTemperature, number> {
  const counts: Record<LeadTemperature, number> = { hot: 0, waiting: 0, cold: 0, unknown: 0 };
  const companyIds = new Set(
    cases.map((item) => item.customerId).filter((id): id is string => Boolean(id)),
  );
  for (const id of companyIds) {
    const level = companyTemperature(id, cases);
    if (level) counts[level] += 1;
  }
  return counts;
}
