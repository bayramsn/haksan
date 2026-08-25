import { describe, expect, it } from "vitest";
import { applyPastedBlock } from "./technical-workbook";

type Row = { clientId: string; specKey: string; defaultValue: string; unit: string };

const sheet = (): Row[] => [
  { clientId: "a", specKey: "Ayna Ölçüsü", defaultValue: "", unit: "" },
  { clientId: "b", specKey: "Fener Mili Devri", defaultValue: "", unit: "" },
];
let seq = 0;
const blank = (): Row => ({ clientId: `new-${++seq}`, specKey: "", defaultValue: "", unit: "" });

describe("applyPastedBlock", () => {
  it("tek hücrede tarayıcıya karışmaz", () => {
    expect(applyPastedBlock(sheet(), 0, "defaultValue", "210", blank)).toBeNull();
  });

  it("yapıştırılan hücreden başlayarak sütunları sırayla doldurur", () => {
    const result = applyPastedBlock(sheet(), 0, "defaultValue", "210\tmm\n6.000\trpm", blank)!;
    expect(result.map((row) => [row.defaultValue, row.unit])).toEqual([["210", "mm"], ["6.000", "rpm"]]);
    expect(result[0].specKey).toBe("Ayna Ölçüsü");
  });

  it("blok sayfadan uzunsa eksik satırları açar", () => {
    const result = applyPastedBlock(sheet(), 1, "specKey", "Taret Tipi\t12\tist\nX Ekseni\t560\tmm", blank)!;
    expect(result).toHaveLength(3);
    expect(result[1]).toMatchObject({ clientId: "b", specKey: "Taret Tipi", defaultValue: "12", unit: "ist" });
    expect(result[2]).toMatchObject({ specKey: "X Ekseni", defaultValue: "560", unit: "mm" });
  });

  it("son sütundan taşan hücreleri yok sayar ve boşlukları kırpar", () => {
    const result = applyPastedBlock(sheet(), 0, "unit", " mm \tkullanılmaz\nrpm", blank)!;
    expect(result.map((row) => row.unit)).toEqual(["mm", "rpm"]);
    expect(Object.keys(result[0])).toEqual(["clientId", "specKey", "defaultValue", "unit"]);
  });
});
