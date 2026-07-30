import { describe, expect, it } from "vitest";
import {
  calculateOpportunityScore,
  findSimilarWonOpportunities,
} from "../../web/src/app/lib/opportunityInsights";
import type { SalesCase } from "../../web/src/app/lib/mock";

const base: SalesCase = {
  id: "opportunity-current",
  customerId: "company-1",
  assignedUserId: "user-1",
  department: "sales",
  requestedProduct: "CNC Dik İşleme Merkezi",
  requestedModel: "VM 2",
  requestedMachine: "VM-2 CNC",
  quantity: 1,
  estimatedAmount: 100_000,
  currency: "USD",
  probability: 70,
  expectedCloseDate: "2030-05-01",
  nextAction: "Teknik toplantı",
  nextActionAt: "2030-04-01",
  stage: "quote",
  qualificationStage: "a",
  qualificationReadiness: { stage: "a", nextStage: "a_plus", ready: true, blockers: [], checks: [], approvals: {} },
  isOfferPrepared: true,
  isLost: false,
  createdAt: "2030-01-01",
};

describe("opportunity insights", () => {
  it("şeffaf bileşenlerden 0-100 arası deterministik skor üretir", () => {
    const result = calculateOpportunityScore(base, {
      now: new Date("2030-03-01T00:00:00Z"),
      activities: [{ id: "a1", salesCaseId: base.id, customerId: base.customerId, type: "Visit", title: "Ziyaret", note: "", date: "2030-02-28", byUserId: "u1" }],
      offers: [{ id: "q1", salesCaseId: base.id, quoteNo: "Q-1", revision: 1, date: "2030-02-20", amount: 100_000, currency: "USD", status: "Approved", note: "" }],
    });

    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.breakdown).toHaveLength(5);
    expect(result.breakdown.reduce((total, item) => total + item.score, 0)).toBe(result.score);
  });

  it("yalnız kazanılan benzer fırsatları benzerlik sırasıyla döndürür", () => {
    const closeMatch: SalesCase = { ...base, id: "won-close", stage: "delivered", qualificationStage: "win", requestedMachine: "VM 2 CNC", estimatedAmount: 95_000 };
    const weakMatch: SalesCase = { ...base, id: "won-weak", stage: "delivered", qualificationStage: "win", requestedMachine: "Fiber lazer", requestedProduct: "Kesim", estimatedAmount: 20_000 };
    const openMatch: SalesCase = { ...base, id: "open", stage: "quote", qualificationStage: "a" };

    const result = findSimilarWonOpportunities(base, [weakMatch, openMatch, closeMatch]);
    expect(result[0]?.opportunity.id).toBe("won-close");
    expect(result.some((item) => item.opportunity.id === "open")).toBe(false);
  });
});
