import { describe, expect, it } from "vitest";
import { applyOptionSpecOverrides } from "./optionSpecOverrides";
import type { Product } from "./mock";

const machineSpecs = [
  { key: "Fener Mili Devri", value: "8.000 rpm" },
  { key: "Takım Magazini", value: "24" },
];
const templates = {
  SPINDLE: [{ specKey: "Fener Mili Devri", defaultValue: "10.000 rpm" }],
  MAGAZIN: [{ specKey: "Takım Magazini", defaultValue: "30" }],
  SOGUTMA: [{ specKey: "Soğutma Tankı", defaultValue: "200 L" }],
};
const option = (productTypeCode: string, specs: Array<{ key: string; value: string }> = []) =>
  ({ productTypeCode, specs }) as unknown as Product;

describe("opsiyonel donanımın tezgah teknik bilgisine etkisi", () => {
  it("opsiyonun kendi değerini, yoksa şablon başlangıcını yazar", () => {
    const result = applyOptionSpecOverrides(machineSpecs, [
      option("SPINDLE", [{ key: "fener mili devri", value: "12.000 rpm" }]),
      option("MAGAZIN"),
    ], templates);
    expect(result.map((s) => s.value)).toEqual(["12.000 rpm", "30"]);
  });

  it("tezgahta olmayan alanı etkilemez, seçim yoksa tablo aynı kalır", () => {
    expect(applyOptionSpecOverrides(machineSpecs, [option("SOGUTMA")], templates)).toBe(machineSpecs);
    expect(applyOptionSpecOverrides(machineSpecs, [], templates)).toBe(machineSpecs);
  });
});
