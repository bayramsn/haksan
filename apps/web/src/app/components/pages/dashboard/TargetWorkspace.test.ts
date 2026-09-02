import { describe, expect, it } from "vitest";
import { buildPeriodResult, buildTeamRows, monthRange, paceMeta, projectedPct, quarterRange, reportLines, sortTeamRows, yearRange } from "./TargetWorkspace";

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

describe("ekip karnesi", () => {
  const response = {
    period: "2026-08",
    expectedProgressPct: 60,
    subjects: [
      {
        subject: { kind: "user", id: "u1", name: "Ayşe Yılmaz", departmentNames: ["Satış"] },
        hasTarget: true,
        metrics: { quoteTarget: { target: 10, actual: 9, pct: 90 } },
      },
      {
        subject: { kind: "user", id: "u2", name: "Barış Demir" },
        hasTarget: true,
        metrics: { quoteTarget: { target: 10, actual: 2, pct: 20 } },
      },
      {
        subject: { kind: "user", id: "u3", name: "Cem Kaya" },
        hasTarget: false,
        metrics: {},
      },
    ],
  };

  it("tempoyu beklenen ilerlemeye göre hesaplar", () => {
    const rows = buildTeamRows(response);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ id: "u1", averagePct: 90, pace: 30, department: "Satış" });
    expect(rows[1]).toMatchObject({ id: "u2", averagePct: 20, pace: -40 });
    // Hedefi olmayan kişi ölçülemez; tempo boş kalır.
    expect(rows[2]).toMatchObject({ id: "u3", averagePct: null, pace: null });
  });

  it("geride kalanı başa alır, ölçülemeyeni sona atar", () => {
    const sorted = sortTeamRows(buildTeamRows(response), "pace");
    expect(sorted.map((row) => row.id)).toEqual(["u2", "u1", "u3"]);
  });

  it("isme göre sıralarken Türkçe alfabeyi kullanır", () => {
    const sorted = sortTeamRows(buildTeamRows(response), "name");
    expect(sorted.map((row) => row.name)).toEqual(["Ayşe Yılmaz", "Barış Demir", "Cem Kaya"]);
  });

  it("tempo rozeti eşiğe göre renk sınıfı seçer", () => {
    expect(paceMeta(5).label).toBe("+5 puan");
    expect(paceMeta(-8).className).toContain("amber");
    expect(paceMeta(-40).className).toContain("red");
    expect(paceMeta(null).label).toBe("Hedef yok");
  });
});

describe("ay sonu tahmini ve hızlı aralıklar", () => {
  it("tempoyu ay sonuna uzatır", () => {
    // Ayın %50'sinde hedefin %40'ındaysa, aynı hızla ay sonunda %80 olur.
    expect(projectedPct(40, 50)).toBe(80);
    expect(projectedPct(75, 50)).toBe(150);
  });

  it("ayın başında ve kapanmış dönemde tahmin üretmez", () => {
    // İlk günlerde tek satış bile tahmini şişirir; kapanan ayda gerçekleşme kesindir.
    expect(projectedPct(10, 3)).toBeNull();
    expect(projectedPct(90, 100)).toBeNull();
    expect(projectedPct(null, 50)).toBeNull();
  });

  it("çeyrek ve yıl aralığını doğru kurar", () => {
    expect(quarterRange("2026-08")).toEqual({ from: "2026-07", to: "2026-09" });
    expect(quarterRange("2026-01")).toEqual({ from: "2026-01", to: "2026-03" });
    expect(quarterRange("2026-12")).toEqual({ from: "2026-10", to: "2026-12" });
    expect(yearRange("2026-08")).toEqual({ from: "2026-01", to: "2026-12" });
  });

  it("yıl aralığı 18 ay sınırına takılmaz", () => {
    const { from, to } = yearRange("2026-05");
    expect(monthRange(from, to)).toHaveLength(12);
  });
});
