import { VISIT_NOT_DONE_RESULT } from "@haksan/shared";
import type { Activity } from "../../lib/mock";

export type OpportunityVisitStatus = "done" | "not_done";

export const OPPORTUNITY_VISIT_STATUS_RESULT: Record<OpportunityVisitStatus, string> = {
  done: "Ziyaret yapıldı",
  // Rapor sayımları bu metne bakarak ziyareti eler; sabit paylaşımlı.
  not_done: VISIT_NOT_DONE_RESULT,
};

const VISIT_ACTIVITY_TYPE_CODES = new Set(["customer_visit", "visit", "demo"]);

/**
 * Eski ziyaret kayıtlarında sonuç alanı boş olabilir; onlar tamamlanmış ziyaret
 * olarak kalır. Yeni açık durum seçimlerinde ise son ziyaret aktivitesinin
 * sonucu kullanılır, böylece "Yapılmadı" kararı yenilemeden sonra "Yapıldı"
 * olarak görünmez.
 */
export function resolveOpportunityVisitStatus({
  complete,
  activities,
  salesCaseId,
}: {
  complete: boolean;
  activities: Activity[];
  salesCaseId: string;
}): OpportunityVisitStatus | undefined {
  const latestVisit = activities.find(
    (activity) =>
      activity.salesCaseId === salesCaseId &&
      VISIT_ACTIVITY_TYPE_CODES.has(activity.typeCode ?? ""),
  );

  if (latestVisit?.result === OPPORTUNITY_VISIT_STATUS_RESULT.not_done) {
    return "not_done";
  }

  return complete ? "done" : undefined;
}
