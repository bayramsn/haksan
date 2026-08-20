import { describe, expect, it } from "vitest";
import type { SalesCase } from "./mock";
import { defaultOpportunityView, summarizePipelineStage } from "./opportunityPresentation";

const baseLead = (patch: Partial<SalesCase> = {}): SalesCase => ({
  id: "lead-1",
  customerId: "",
  assignedUserId: "sales-1",
  department: "sales",
  requestedProduct: "CNC torna",
  requestedModel: "MT-210",
  quantity: 1,
  estimatedAmount: 100_000,
  currency: "EUR",
  stage: "sales",
  qualificationStage: "lead",
  nextAction: "İlk görüşmeyi yap",
  nextActionAt: "2026-08-18T12:00:00.000Z",
  isOfferPrepared: false,
  isLost: false,
  createdAt: "2026-08-10",
  qualificationReadiness: {
    stage: "lead",
    nextStage: "c",
    ready: false,
    blockers: [],
    checks: [],
    approvals: {},
    health: {
      stageAgeDays: 8,
      stageAgeLimitDays: 14,
      rotting: false,
      leadStatus: "new",
      leadSlaHours: 24,
      leadStatusAgeHours: 3,
      leadSlaBreached: false,
      contactAttemptCount: 0,
      attemptLimitReached: false,
      firstContactAt: null,
      actionOverdue: false,
      actionMissing: false,
    },
  },
  ...patch,
});

describe("başlangıç görünümü", () => {
  it("satış rollerini Fırsat panosuna, diğerlerini gösterge paneline yönlendirir", () => {
    // "Bugünüm" ayrı bir sayfa değil; Lead artık Fırsat panosunun ilk kolonu.
    expect(defaultOpportunityView(["sales"])).toBe("pipeline");
    expect(defaultOpportunityView(["admin"])).toBe("pipeline");
    expect(defaultOpportunityView(["service"])).toBeNull();
  });
});

describe("pipeline kolon özeti", () => {
  it("toplam, ağırlıklı değer ve ortalama aşama yaşını üretir", () => {
    const summary = summarizePipelineStage([
      { ...baseLead(), qualificationStage: "b", probability: 50, estimatedAmount: 100_000 },
      { ...baseLead(), id: "lead-2", qualificationStage: "b", probability: 25, estimatedAmount: 200_000, qualificationReadiness: { ...baseLead().qualificationReadiness!, health: { ...baseLead().qualificationReadiness!.health!, stageAgeDays: 4 } } },
    ]);
    expect(summary).toEqual({
      count: 2,
      totalsByCurrency: [{ currency: "EUR", totalAmount: 300_000, weightedAmount: 100_000 }],
      averageStageAgeDays: 6,
    });
  });

  it("farklı para birimlerini birbirine eklemez", () => {
    const summary = summarizePipelineStage([
      { ...baseLead(), qualificationStage: "b", probability: 50, estimatedAmount: 100_000, currency: "EUR" },
      { ...baseLead(), id: "lead-2", qualificationStage: "b", probability: 50, estimatedAmount: 4_000_000, currency: "TRY" },
    ]);
    expect(summary.totalsByCurrency).toEqual([
      { currency: "EUR", totalAmount: 100_000, weightedAmount: 50_000 },
      { currency: "TRY", totalAmount: 4_000_000, weightedAmount: 2_000_000 },
    ]);
  });
});
