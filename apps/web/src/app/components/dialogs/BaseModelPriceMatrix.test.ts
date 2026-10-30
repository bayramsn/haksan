import { describe, expect, it } from "vitest";
import { groupPriceRows } from "./BaseModelPriceMatrix";

const row = (sourceModelCode: string, powerKw: number) => ({
  id: `${sourceModelCode}-${powerKw}`, sourceModelCode, powerKw, salePrice: null, saleCurrencyCode: null, container: null, leadTimeDays: null,
});

describe("baz kart fiyat tablosu", () => {
  it("modelleri baz kartın alt model sırasıyla, güçleri artan sırada gruplar", () => {
    const groups = groupPriceRows([row("F-6020", 12), row("F-3015", 6), row("F-6020", 3), row("F-9999", 1.5), row("F-3015", 1.5)], ["F-3015", "F-6020"]);
    expect(groups.map((group) => group.model)).toEqual(["F-3015", "F-6020", "F-9999"]);
    expect(groups[0]!.rows.map((entry) => entry.powerKw)).toEqual([1.5, 6]);
    expect(groups[1]!.rows.map((entry) => entry.powerKw)).toEqual([3, 12]);
  });
});
