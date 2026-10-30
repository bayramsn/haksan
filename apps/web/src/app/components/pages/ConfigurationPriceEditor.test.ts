import { describe, expect, it } from "vitest";
import { applyMarkup, parsePrice } from "./ConfigurationPriceEditor";

const row = (id: string, costPrice: number | null, salePrice: number | null = null) => ({
  id, productModelId: "base", baseName: "F Serisi", series: "F", sourceModelCode: "F-3015", powerKw: 3,
  salePrice, saleCurrencyCode: salePrice == null ? null : "USD", container: null, leadTimeDays: null, costPrice, costCurrencyCode: "USD",
});

describe("model × güç satış fiyatı", () => {
  it("maliyete kâr oranı uygular, tam birime yuvarlar, maliyetsiz satırı atlar", () => {
    const drafts = applyMarkup([row("a", 16000), row("b", 22333), row("c", null)], {}, 25, false);
    expect(drafts).toEqual({ a: { salePrice: "20000", currency: "USD" }, b: { salePrice: "27916", currency: "USD" } });
  });

  it("yalnız boş satırlar seçiliyse girilmiş fiyata dokunmaz", () => {
    const drafts = applyMarkup([row("a", 16000, 21000), row("b", 16000)], { }, 10, true);
    expect(drafts).toEqual({ b: { salePrice: "17600", currency: "USD" } });
  });

  it("Türkçe, binlik ve ondalık yazımları ayırt eder", () => {
    expect(parsePrice("30.000,50")).toBe(30000.5);
    expect(parsePrice("30.000")).toBe(30000);
    expect(parsePrice("30000.5")).toBe(30000.5);
    expect(parsePrice("  ")).toBeNull();
    expect(parsePrice("-5")).toBeUndefined();
    expect(parsePrice("abc")).toBeUndefined();
  });
});
