import { describe, expect, it } from "vitest";
import { buildPeriodResult, monthRange, reportLines } from "./TargetWorkspace";

describe("hedef raporu dönem aralığı", () => {
  it("başlangıç ve bitiş aylarını dahil eder", () => {
    expect(monthRange("2026-01", "2026-03")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("ters ve 18 aydan uzun raporları reddeder", () => {
    expect(() => monthRange("2026-04", "2026-03")).toThrow(/başlangıç/i);
    expect(() => monthRange("2025-01", "2026-07")).toThrow(/18 aylık/i);
  });
});

describe("hedef raporu kalem normalizasyonu", () => {
  it("ana metrikle aynı sayacı kullanan alt kalemi ikinci kez saymaz", () => {
    const lines = reportLines({
      subject: { kind: "user", id: "u1", name: "Ayşe Yılmaz" },
      hasTarget: true,
      metrics: { quoteTarget: { target: 10, actual: 7, pct: 70 } },
      targetItems: [
        { category: "Satış", activity: "Teklif hazırla", target: "10", unit: "count", metricKey: "quoteTarget", trackingMode: "automatic", actual: 7, pct: 70 },
        { category: "Kalite", activity: "Müşteri geri bildirimi", target: "3", unit: "count", trackingMode: "manual" },
      ],
    }, "2026-08", 80);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ id: "metric:quoteTarget", target: 10, actual: 7, pct: 70 });
    expect(lines[1]).toMatchObject({ label: "Müşteri geri bildirimi", trackingMode: "manual", status: "manual" });
  });

  it("aynı otomatik metriğe bağlı kalemleri tek ve homojen sayaçta birleştirir", () => {
    const lines = reportLines({
      subject: { kind: "department", id: "d1", name: "Satış" },
      hasTarget: true,
      targetItems: [
        { category: "Saha", activity: "Bayi ziyareti", target: "4", unit: "count", metricKey: "visitTarget", trackingMode: "automatic", actual: 6 },
        { category: "Saha", activity: "Müşteri ziyareti", target: "8", unit: "count", metricKey: "visitTarget", trackingMode: "automatic", actual: 6 },
      ],
    }, "2026-08", 75);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ id: "item-group:visitTarget", target: 12, actual: 6, pct: 50, trackingMode: "automatic" });
  });

  it("dönem özetinde yalnız ölçülebilir kalemlerin ortalamasını alır", () => {
    const result = buildPeriodResult("2026-08", {
      expectedProgressPct: 80,
      subjects: [{
        subject: { kind: "user", id: "u1", name: "Ayşe Yılmaz" },
        hasTarget: true,
        metrics: {
          quoteTarget: { target: 10, actual: 8, pct: 80 },
          visitTarget: { target: 10, actual: 10, pct: 100 },
        },
        targetItems: [{ category: "Kalite", activity: "Kontrol", target: "2", trackingMode: "manual" }],
      }],
    });

    expect(result.averagePct).toBe(90);
    expect(result.achievedCount).toBe(1);
    expect(result.manualCount).toBe(1);
  });
});
