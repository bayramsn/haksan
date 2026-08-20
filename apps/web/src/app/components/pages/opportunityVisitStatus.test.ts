import { describe, expect, it } from "vitest";
import type { Activity } from "../../lib/mock";
import {
  OPPORTUNITY_VISIT_STATUS_RESULT,
  resolveOpportunityVisitStatus,
} from "./opportunityVisitStatus";

const activity = (patch: Partial<Activity> = {}): Activity => ({
  id: "activity-1",
  salesCaseId: "opportunity-1",
  customerId: "company-1",
  type: "Müşteri Ziyareti",
  typeCode: "customer_visit",
  origin: "manual",
  title: "Müşteri Ziyareti",
  note: "",
  result: "",
  date: "2026-08-11",
  byUserId: "user-1",
  ...patch,
});

describe("resolveOpportunityVisitStatus", () => {
  it("henüz karar verilmediyse seçim yapılabilmesi için boş değer döndürür", () => {
    expect(resolveOpportunityVisitStatus({
      complete: false,
      activities: [],
      salesCaseId: "opportunity-1",
    })).toBeUndefined();
  });

  it("Yapılmadı kararını tamamlanmış ama atlanmış ziyaret olarak korur", () => {
    expect(resolveOpportunityVisitStatus({
      complete: true,
      activities: [activity({ result: OPPORTUNITY_VISIT_STATUS_RESULT.not_done })],
      salesCaseId: "opportunity-1",
    })).toBe("not_done");
  });

  it("eski veya Yapıldı ziyaret kayıtlarını tamamlanmış gösterir", () => {
    expect(resolveOpportunityVisitStatus({
      complete: true,
      activities: [activity()],
      salesCaseId: "opportunity-1",
    })).toBe("done");
  });
});
