import type { QualificationStage, SalesCase } from "./mock";

/**
 * Açılışta hangi alana düşüleceği. Ayrı bir "Bugünüm" sayfası yok; satış
 * rollerinin tamamı Fırsat panosuna düşer (Lead o panonun ilk kolonu).
 */
export const defaultOpportunityView = (
  roles: string[] | undefined,
): "pipeline" | null => {
  const normalized = (roles ?? []).map((role) => role.toLocaleLowerCase("tr-TR"));
  const isAdmin = normalized.some((role) => role === "admin" || role === "super_admin");
  const isSales = normalized.some((role) => role === "sales" || role.includes("satış"));
  return isAdmin || isSales ? "pipeline" : null;
};

const DEFAULT_STAGE_PROBABILITY: Record<QualificationStage, number> = {
  lead: 0.05,
  c: 0.15,
  b: 0.35,
  a: 0.6,
  a_plus: 0.8,
  win: 1,
  lost: 0,
};

export function summarizePipelineStage(items: SalesCase[], now = new Date()) {
  const totalsByCurrency = new Map<SalesCase["currency"], { totalAmount: number; weightedAmount: number }>();
  for (const item of items) {
    const probability = item.probability == null
      ? DEFAULT_STAGE_PROBABILITY[item.qualificationStage ?? "lead"]
      : Math.min(1, Math.max(0, item.probability / 100));
    const current = totalsByCurrency.get(item.currency) ?? { totalAmount: 0, weightedAmount: 0 };
    current.totalAmount += item.estimatedAmount;
    current.weightedAmount += item.estimatedAmount * probability;
    totalsByCurrency.set(item.currency, current);
  }
  const ages = items.map((item) => {
    const reported = item.qualificationReadiness?.health?.stageAgeDays;
    if (reported != null && Number.isFinite(reported)) return Math.max(0, reported);
    const created = new Date(item.createdAt).getTime();
    return Number.isFinite(created) ? Math.max(0, Math.floor((now.getTime() - created) / 86_400_000)) : 0;
  });

  return {
    count: items.length,
    totalsByCurrency: [...totalsByCurrency.entries()].map(([currency, totals]) => ({ currency, ...totals })),
    averageStageAgeDays: ages.length ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length) : 0,
  };
}
