import { describe, expect, it } from "vitest";
import { configurationPriceFor, matrixPriceRow, type ConfigurationSet } from "./ProductConfigurationOptions";

const sets: ConfigurationSet[] = [
  { id: "table", name: "Boru kapasitesi", configurationKind: "table", values: [{ id: "v12", value: "V12-65", priceDelta: "0", currencyCode: "USD", sourceModelCode: "V12-65" }] },
  { id: "power", name: "Rezonatör Gücü", configurationKind: "power", values: [{ id: "p3", value: "3 kW", priceDelta: "0", currencyCode: "USD", powerKw: 3 }] },
];
const row = { id: "r1", sourceModelCode: "V12-65", powerKw: 3, salePrice: 30000, saleCurrencyCode: "USD", container: "40HC", leadTimeDays: 7 };
const pick = (setId: string, valueId: string) => ({ optionSetId: setId, optionValueId: valueId, name: "", value: "", priceDelta: "0", currencyCode: "USD" });

describe("matris fiyatlı baz kart seçimi", () => {
  it("seçili model ve gücün matris satırını bulur", () => {
    expect(matrixPriceRow(sets, [pick("table", "v12"), pick("power", "p3")], [row])).toEqual({ sourceModelCode: "V12-65", powerKw: 3, row });
  });
  it("güç seçilmeden fiyat satırı vermez", () => {
    expect(matrixPriceRow(sets, [pick("table", "v12")], [row])).toEqual({ sourceModelCode: "V12-65", powerKw: undefined, row: undefined });
  });

  it("teslim şekline karşılık gelen lazer listesinin liste fiyatını, yoksa kartın satış fiyatını kullanır", () => {
    const listed = { ...row, listPrices: [{ code: "LAZER-MILLI-IST" as const, name: "Milli", listPrice: 47125, cashPrice: 45313 }] };
    expect(configurationPriceFor(listed, "LAZER-MILLI-IST")).toEqual({ salePrice: 47125, currencyCode: "USD", cashPrice: 45313, priceListCode: "LAZER-MILLI-IST" });
    expect(configurationPriceFor(listed, "LAZER-CIF-IST")).toEqual({ salePrice: 30000, currencyCode: "USD" });
    expect(configurationPriceFor(listed, null)).toEqual({ salePrice: 30000, currencyCode: "USD" });
    expect(configurationPriceFor({ ...row, salePrice: null }, "LAZER-CIF-IST")).toBeNull();
  });
});
