import { describe, expect, it } from "vitest";
import { specsForSelectedProductType } from "./CreateDialogs";

// Ayarlardan eklenen bir tezgah tipi ("C Axis Box Ways") için Excel'den yüklenen
// şablon. Alan adları CNC Yatay Torna katalogunda da geçtiği için, tipin şablonu
// bilinmediğinde tamamı "başka tezgaha ait" sayılıp eleniyordu.
const importedTemplate = [
  { key: "Ayna Ölçüsü", value: '15"', unit: '"', specUnit: '"', groupCode: "KAPASITE" },
  { key: "Maks. Çevirme Kapasitesi", value: "Ø 830", unit: "mm", specUnit: "mm", groupCode: "KAPASITE" },
  { key: "Fener Mili Devri", value: "2.500", unit: "dv/dk", specUnit: "dv/dk", groupCode: "FENER_MILI" },
  { key: "X Eksen Hareketi", value: "410", unit: "mm", specUnit: "mm", groupCode: "EKSENLER" },
  { key: "Taret Tipi", value: "Tahrikli Taret", unit: "", specUnit: "", groupCode: "TARET" },
  { key: "Tezgah Ağırlığı", value: "12.700", unit: "kg", specUnit: "kg", groupCode: "GENEL" },
];
const NEW_TYPE = "c_axis_box_ways";

describe("specsForSelectedProductType", () => {
  it("katalogda olmayan ürün tipinde sabit liste DB şablonundan gelir", () => {
    const result = specsForSelectedProductType([], NEW_TYPE, "", importedTemplate);
    expect(result.map((spec) => spec.key)).toEqual(importedTemplate.map((spec) => spec.key));
    expect(result.map((spec) => spec.unit)).toEqual(importedTemplate.map((spec) => spec.unit));
  });

  it("şablonu bilinen tipte silinen alan sabit listeden geri gelir", () => {
    const afterDelete = specsForSelectedProductType([], NEW_TYPE, "", importedTemplate).slice(2);
    const completed = specsForSelectedProductType(afterDelete, NEW_TYPE, "", importedTemplate);
    expect(completed).toHaveLength(importedTemplate.length);
  });

  it("katalog tipinde sabit liste koddan gelir", () => {
    expect(specsForSelectedProductType([], "CNC_YATAY_TORNA_TEZGAHI").length).toBeGreaterThan(40);
  });
});
