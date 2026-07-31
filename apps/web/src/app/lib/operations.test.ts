import { describe, expect, it } from "vitest";
import type { SalesCase } from "./mock";
import {
  buildAlerts,
  buildWorkItems,
  type OperationStoreSnapshot,
} from "./operations";

const snapshotWithLead = (patch: Partial<SalesCase> = {}): OperationStoreSnapshot => ({
  customers: [],
  contacts: [],
  offers: [],
  payments: [],
  service: [],
  stock: [],
  products: [],
  activities: [],
  users: [],
  machines: [],
  documents: [],
  shipments: [],
  deliveries: [],
  cases: [
    {
      id: "lead-1",
      qualificationStage: "lead",
      leadFollowUpStatus: "new",
      leadCompanyTitle: "Örnek Sanayi",
      requestedProduct: "CNC torna",
      createdAt: "2026-07-31",
      nextActionAt: undefined,
      assignedUserId: undefined,
      leadInsights: {
        fitScore: 60,
        engagementScore: 20,
        priorityScore: 48,
        priorityBand: "low",
        slaBreached: true,
        fitReasons: [],
        engagementReasons: [],
        missingQualificationFields: [],
      },
      qualificationReadiness: {
        health: {
          leadStatus: "new",
          leadSlaHours: 4,
          leadStatusAgeHours: 6,
          leadSlaBreached: true,
          actionOverdue: false,
          firstContactAt: null,
          contactAttemptCount: 0,
          attemptLimitReached: false,
        },
      },
      ...patch,
    } as unknown as SalesCase,
  ],
});

describe("lead uygulama-geneli aksiyonları", () => {
  it("Dashboard iş kuyruğunda kritik lead kaydını doğrudan çalışma alanına taşır", () => {
    const items = buildWorkItems(snapshotWithLead());
    const leadItem = items.find((item) => item.id === "lead:lead-1");

    expect(leadItem).toMatchObject({
      severity: "critical",
      module: "leads",
      action: { kind: "salesCase", salesCaseId: "lead-1" },
    });
  });

  it("Bildirim Merkezi uyarılarını açıklanabilir lead kuyruklarına bağlar", () => {
    const alerts = buildAlerts(snapshotWithLead());
    const leadAlerts = alerts.filter((alert) => alert.module === "leads");

    expect(leadAlerts.map((alert) => alert.action)).toEqual(
      expect.arrayContaining([
        { kind: "navigate", nav: "leads", focus: "sla_risk" },
        { kind: "navigate", nav: "leads", focus: "unassigned" },
        { kind: "navigate", nav: "leads", focus: "no_action" },
        { kind: "navigate", nav: "leads", focus: "uncontacted" },
      ]),
    );
  });
});
