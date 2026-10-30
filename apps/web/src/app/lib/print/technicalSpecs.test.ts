import { describe, expect, it } from "vitest";
import type { Product } from "../mock";
import { dropForeignMachineSpecs } from "../productSpecTemplates";
import { fullProductSpecs, hasPrintableTechnicalSpecValue, printableTechnicalSpecs } from "./technicalSpecs";

describe("quote technical specs completeness", () => {
  const giyotin = { productTypeCode: "GIYOTIN_MAKAS", specs: [
    { key: "Kesme Boyu", value: "3100", unit: "mm" },
    { key: "Tabla Ölçüsü", value: "3200 x 600", unit: "mm" },
    { key: "Tabla Yük Kapasitesi", value: "-" },
  ] } as unknown as Product;

  it("keeps filled fields that also exist in another machine template, drops only dash/blank leftovers", () => {
    expect(dropForeignMachineSpecs("GIYOTIN_MAKAS", giyotin.specs!).map((spec) => spec.key)).toEqual(["Kesme Boyu", "Tabla Ölçüsü"]);
  });

  it("prints quote-only specs that are not on the product card, without the equipment row", () => {
    const keys = fullProductSpecs(giyotin, [
      { key: "Kesme Boyu", value: "4100" },
      { key: "Kesme Kafası", value: "Raytools BM110" },
      { key: "Standart Donanım", value: "Ayna" },
    ])!.map((spec) => `${spec.key}=${spec.value}`);
    expect(keys).toEqual(expect.arrayContaining(["Kesme Boyu=4100", "Tabla Ölçüsü=3200 x 600", "Kesme Kafası=Raytools BM110"]));
    expect(keys.some((entry) => entry.startsWith("Standart Donanım"))).toBe(false);
  });
});

describe("printable technical specs", () => {
  it("treats blank and dash sentinels as unused while preserving real zero values", () => {
    expect(hasPrintableTechnicalSpecValue("")).toBe(false);
    expect(hasPrintableTechnicalSpecValue(" - ")).toBe(false);
    expect(hasPrintableTechnicalSpecValue("—")).toBe(false);
    expect(hasPrintableTechnicalSpecValue("0")).toBe(true);
  });

  it("filters only the PDF projection and leaves the source list untouched", () => {
    const source = [
      { key: "Karşı Ayna Devri", value: "-" },
      { key: "Canlı Takım Devri", value: "4500", unit: "dev/dk" },
      { key: "", value: "100" },
    ];

    expect(printableTechnicalSpecs(source)).toEqual([
      { key: "Canlı Takım Devri", value: "4500", unit: "dev/dk" },
    ]);
    expect(source).toHaveLength(3);
  });
});
