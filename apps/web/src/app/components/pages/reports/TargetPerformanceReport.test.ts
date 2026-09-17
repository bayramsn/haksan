import { describe, expect, it } from "vitest";
import {
  analyzeTargetSubject,
  previousPeriod,
  targetPerformancePrintDoc,
  type TargetPrintPerson,
  type TargetSubjectRow,
} from "./TargetPerformanceReport";

const row = (overrides: Partial<TargetSubjectRow> = {}): TargetSubjectRow => ({
  subject: { kind: "user", id: "u1", name: "Ayşe Demir", departmentIds: ["d1"], departmentNames: ["Satış"] },
  hasTarget: true,
  metrics: {
    quoteTarget: { target: 10, actual: 6, pct: 60 },
    salesAmount: { target: 60000, actual: 41200, pct: 69 },
    visitTarget: { target: null, actual: 3, pct: null },
    digitalBudget: { target: 5000, actual: null, pct: null },
  },
  targetItems: [
    { activity: "Fuar ziyareti", target: "2", trackingMode: "manual", metricKey: null },
    { activity: "Kurulum", target: "4", actual: 4, pct: 100, trackingMode: "automatic", metricKey: "installationCompleted" },
  ],
  note: "Eylül odak: sac lazer",
  ...overrides,
});

describe("analyzeTargetSubject", () => {
  it("splits automatic metrics from manual goals and averages only the measured ones", () => {
    const analysis = analyzeTargetSubject(row(), 50, "2099-01");
    expect(analysis.metrics.map((m) => `${m.label} ${m.actual}/${m.target}${m.unit === "USD" ? " USD" : ""} %${m.pct}`)).toEqual([
      "Teklif 6/10 %60",
      "Satış cirosu 41200/60000 USD %69",
      "Kurulum 4/4 %100",
    ]);
    // Hedefi olmayan ziyaret ölçütü listeye girmez; dijital bütçe ve fuar manuel takiptir.
    expect(analysis.manual).toEqual([
      { label: "Dijital bütçe", target: "5.000 USD" },
      { label: "Fuar ziyareti", target: "2" },
    ]);
    expect(analysis.completionPct).toBe(Math.round((60 + 69 + 100) / 3));
    expect(analysis.status).toBe("scheduled");
  });

  it("does not list a target twice when the same metric arrives both as a metric and as an item", () => {
    const analysis = analyzeTargetSubject(row({
      metrics: {
        quoteTarget: { target: 10, actual: 6, pct: 60 },
        digitalBudget: { target: 5000, actual: null, pct: null },
      },
      targetItems: [
        // Sayıya çevrilemeyen hedef metni: üstte zaten ölçülüyor, manuele düşmemeli.
        { activity: "Teklif", target: "10-15", trackingMode: "automatic", metricKey: "quoteTarget" },
        // API manuel metrikleri hem metrics hem targetItems içinde döndürüyor.
        { activity: "Dijital bütçe", target: "5.000", trackingMode: "manual", metricKey: "digitalBudget" },
      ],
    }), 50, "2099-01");
    expect(analysis.metrics.map((m) => m.label)).toEqual(["Teklif"]);
    expect(analysis.manual).toEqual([{ label: "Dijital bütçe", target: "5.000 USD" }]);
  });

  it("reads goal numbers by the API's rule so screen and Excel agree", () => {
    const goal = (target: string) =>
      analyzeTargetSubject(row({ metrics: {}, targetItems: [{ activity: "Kurulum", target, actual: 3, trackingMode: "automatic" }] }), 50, "2099-01");
    expect(goal("1.500").metrics[0]).toMatchObject({ target: 1500 });
    expect(goal("1.500,50").metrics[0]).toMatchObject({ target: 1500.5 });
    // API `parseTargetItemNumber` bunları reddediyor; web de manuel takibe düşürmeli.
    expect(goal("1,500,000").metrics).toEqual([]);
    expect(goal("yaklaşık 10").metrics).toEqual([]);
  });

  it("reports manual-only and no-target subjects without a percentage", () => {
    expect(analyzeTargetSubject(row({ metrics: {}, targetItems: [{ activity: "Fuar", target: "1", trackingMode: "manual" }] }), 50, "2099-01").status).toBe("manual");
    expect(analyzeTargetSubject(row({ hasTarget: false, metrics: {}, targetItems: [] }), 50, "2099-01")).toMatchObject({ status: "no_target", completionPct: null });
  });
});

describe("previousPeriod", () => {
  it("steps back one month across the year boundary", () => {
    expect(previousPeriod("2026-01")).toBe("2025-12");
    expect(previousPeriod("2026-09")).toBe("2026-08");
  });
});

describe("targetPerformancePrintDoc", () => {
  const person = (overrides: Partial<TargetPrintPerson>): TargetPrintPerson => ({
    id: "u1",
    rank: 1,
    name: "Ayşe Demir",
    departments: "Satış",
    completionPct: 76,
    previousPct: 62,
    status: "on_track",
    metrics: [{ label: "Teklif", target: 10, actual: 6, pct: 60, unit: "adet" }, { label: "Satış cirosu", target: 60000, actual: 41200, pct: 69, unit: "USD" }],
    manual: [{ label: "Fuar ziyareti", target: "2" }],
    note: "Eylül odak: sac lazer",
    ...overrides,
  });

  it("groups people under their department with metrics, trend, notes, ranking and a signature block", () => {
    const doc = targetPerformancePrintDoc({
      period: "2026-09",
      filter: "all",
      departmentFilterName: null,
      expectedPct: 55,
      averagePct: 64,
      previousAveragePct: 58,
      targetedPeople: 3,
      completedCount: 1,
      riskCount: 1,
      missedCount: 0,
      departments: [
        {
          name: "Satış",
          source: "Departman hedefi",
          memberCount: 2,
          problemCount: 1,
          completionPct: 70,
          previousPct: 80,
          status: "on_track",
          metrics: [{ label: "Satış cirosu", target: 120000, actual: 84000, pct: 70, unit: "USD" }],
          note: null,
          members: [person({}), person({ id: "u2", rank: 3, name: "Mehmet <Kaya>", completionPct: 31, previousPct: null, status: "at_risk", note: null, manual: [] })],
        },
      ],
      unassigned: [person({ id: "u3", rank: 2, name: "Serbest Kişi", departments: "", completionPct: 100, status: "completed" })],
      currencyNormalization: { base: "USD", rateDate: "2026-09-16", source: "live", live: true, unsupportedCurrencies: ["GBP"] },
      preparedBy: "Süper Yönetici",
      assetBase: "/print",
    });

    expect(doc.title).toBe("hedef-gerceklesme-2026-09");
    // Departman bloğu: başlık, ölçüt satırı, kıyas oku ve üyeler.
    expect(doc.body).toContain('<div class="dept-name">Satış</div>');
    expect(doc.body).toContain("84.000 / 120.000 USD (%70)");
    expect(doc.body).toContain('<span class="trend down">▼ %80</span>');
    expect(doc.body).toContain("6 / 10 (%60)");
    expect(doc.body).toContain("41.200 / 60.000 USD (%69)");
    expect(doc.body).toContain('<span class="trend up">▲ %62</span>');
    expect(doc.body).toContain("Fuar ziyareti: 2");
    expect(doc.body).toContain('<div class="note">Eylül odak: sac lazer</div>');
    expect(doc.body).toContain("Mehmet &lt;Kaya&gt;");
    // Departmansız kişi ayrı blokta, sıra numarası korunur.
    expect(doc.body).toContain('<div class="dept-name">Departmansız</div>');
    expect(doc.body).toContain('<td class="num rank">2</td>');
    // Öne çıkanlar: en iyi listede tamamlayan başta. Ayşe iki departman bloğunda
    // birden geçse de kimliğiyle tekilleşir, riskli kutusuna yolunda giden girmez.
    expect(doc.body).toMatch(/En iyi 3[\s\S]*Serbest Kişi[\s\S]*Ayşe Demir/);
    const riskBox = doc.body.split("En riskli 3")[1].split("</section>")[0];
    expect(riskBox).toContain("Mehmet &lt;Kaya&gt;");
    expect(riskBox).not.toContain("Ayşe Demir");
    // Değerlendirme + imza, sayfa numarası, kur notu.
    expect(doc.body).toContain("Yönetici değerlendirmesi");
    expect(doc.body).toContain("Hazırlayan<br><b>Süper Yönetici</b>");
    expect(doc.body).toContain("çevrilemeyen: GBP");
    expect(doc.body).toContain("Kapsam: Tüm kullanıcılar");
  });

  it("names the department filter in the scope line", () => {
    const doc = targetPerformancePrintDoc({
      period: "2026-09", filter: "problems", departmentFilterName: "Servis", expectedPct: 55, averagePct: null, previousAveragePct: null,
      targetedPeople: 0, completedCount: 0, riskCount: 0, missedCount: 0, departments: [], unassigned: [], currencyNormalization: null, preparedBy: null, assetBase: "/print",
    });
    expect(doc.body).toContain("Kapsam: Eksik ve riskli kullanıcılar · Departman: Servis");
    expect(doc.body).toContain("Departman kaydı bulunmuyor.");
  });
});
