import { describe, expect, it } from "vitest";
import { hasPrintableTechnicalSpecValue, printableTechnicalSpecs } from "./technicalSpecs";

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
