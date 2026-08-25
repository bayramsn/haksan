import { describe, expect, it } from "vitest";
import { stageDrilldown } from "./Dashboard";
import { buildFunnelFromCases, buildPipelineFunnel, buildPipelineStagePie } from "../../lib/chartAggregates";
import type { SalesCase } from "../../lib/mock";

describe("grafik drill-down", () => {
  it("operasyon aşamasını satış derecesi filtresine çevirir", () => {
    expect(stageDrilldown("quote")).toEqual({
      kind: "navigate",
      nav: "sales-cases",
      query: "qualification:b",
    });
    expect(stageDrilldown("shipping")).toEqual({
      kind: "navigate",
      nav: "sales-cases",
      query: "qualification:a_plus",
    });
    expect(stageDrilldown("delivered")).toEqual({
      kind: "navigate",
      nav: "sales-cases",
      query: "qualification:win",
    });
  });

  it("bilinmeyen veya boş aşamada filtresiz listeye düşer", () => {
    expect(stageDrilldown(null)).toEqual({ kind: "navigate", nav: "sales-cases" });
    expect(stageDrilldown("uydurma_asama")).toEqual({ kind: "navigate", nav: "sales-cases" });
  });

  it("grafik verileri drill-down için aşama kodunu taşır", () => {
    const apiRows = [{ stageCode: "quote", stageName: "Teklif", count: 3, sortOrder: 2 }];
    expect(buildPipelineFunnel(apiRows)[0]).toMatchObject({ name: "Teklif", stage: "quote", value: 3 });
    expect(buildPipelineStagePie(apiRows)[0]).toMatchObject({ name: "Teklif", stage: "quote", count: 3 });

    const cases = [{ stage: "quote", isLost: false } as SalesCase];
    expect(buildFunnelFromCases(cases, { quote: "Teklif" })[0]).toMatchObject({ name: "Teklif", stage: "quote" });
  });
});
