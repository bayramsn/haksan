import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServiceRequest } from "./mock";
import { buildAlerts, buildKpiDrilldowns, buildWorkItems, type OperationStoreSnapshot } from "./operations";
import { isServiceOverdue, serviceAgeDays, serviceSlaRemainingDays } from "./serviceSla";

const NOW = Date.parse("2026-11-19T12:00:00Z");
const DAY_MS = 86_400_000;
const request = (age: number, priority: ServiceRequest["priority"] = "normal", patch: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id: "service-1", machineId: "machine-1", customerId: "company-1", assignedUserId: "",
  stage: "Request Opened", diagnosisNote: "", serviceNote: "", quoteRequired: false,
  createdAt: new Date(NOW - age * DAY_MS).toISOString(), priority, ...patch,
});
const snapshot = (service: ServiceRequest[]): OperationStoreSnapshot => ({
  service, customers: [], contacts: [], cases: [], offers: [], payments: [], stock: [], products: [],
  activities: [], users: [], machines: [], documents: [], shipments: [], deliveries: [],
});

afterEach(() => vi.useRealTimers());

describe("servis öncelik SLA hesabı", () => {
  it.each([
    ["critical", 1], ["high", 2], ["normal", 7], ["low", 14],
  ] as const)("%s önceliğinde %i günlük hedefi kullanır", (priority, target) => {
    expect(serviceSlaRemainingDays(request(0, priority), NOW)).toBe(target);
    expect(serviceSlaRemainingDays(request(target, priority), NOW)).toBe(0);
    expect(isServiceOverdue(request(target, priority), NOW)).toBe(false);
    expect(isServiceOverdue(request(target + 1, priority), NOW)).toBe(true);
  });

  it("tam günleri sayar, gelecek tarihleri gecikmiş göstermez", () => {
    expect(serviceAgeDays(request(1.9), NOW)).toBe(1);
    expect(serviceAgeDays(request(-2), NOW)).toBe(0);
    expect(isServiceOverdue(request(-2, "critical"), NOW)).toBe(false);
  });

  it("geçersiz tarihleri ve kapalı servisleri SLA aşımı saymaz", () => {
    expect(serviceAgeDays(request(20, "critical", { createdAt: "invalid" }), NOW)).toBe(0);
    expect(isServiceOverdue(request(20, "critical", { createdAt: "invalid" }), NOW)).toBe(false);
    expect(isServiceOverdue(request(20, "critical", { stage: "Closed" }), NOW)).toBe(false);
  });

  it("önceliği olmayan eski kayıtlarda normal SLA hedefini kullanır", () => {
    expect(serviceSlaRemainingDays(request(6, "normal", { priority: undefined }), NOW)).toBe(1);
    expect(isServiceOverdue(request(8, "normal", { priority: undefined }), NOW)).toBe(true);
  });

  it("iki günlük kritik servisi dashboard gecikme kuyruğuna bağlar", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const data = snapshot([request(2, "critical")]);
    expect(buildWorkItems(data).find((item) => item.id === "service:service-1")).toMatchObject({
      action: { kind: "navigate", nav: "service-requests", focus: "late" },
    });
    expect(buildAlerts(data).find((alert) => alert.id === "alert:service-sla")).toMatchObject({ title: "1 servis gecikmesi" });
    expect(buildKpiDrilldowns(data).find((kpi) => kpi.id === "kpi:service-open")).toMatchObject({
      description: "1 kayıt öncelik SLA süresini aştı",
    });
  });

  it("sekiz günlük düşük öncelikli servise erken gecikme uyarısı üretmez", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const data = snapshot([request(8, "low")]);
    expect(buildWorkItems(data).find((item) => item.id === "service:service-1")).toMatchObject({
      action: { kind: "navigate", nav: "service-requests", focus: "open" },
    });
    expect(buildAlerts(data).find((alert) => alert.id === "alert:service-sla")).toBeUndefined();
  });
});
