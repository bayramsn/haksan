import { describe, expect, it } from "vitest";

type P = { productGroup?: string; category?: string; subcategory?: string; type?: string };
type Tax = { group: string; category: string; subcategory: string; type: string };

// Operations.tsx içindeki kuralın aynısı; kaskad davranışını burada sabitliyoruz.
const matches = (p: P, t: Tax, upTo: 0 | 1 | 2 | 3 | 4) =>
  (upTo < 1 || t.group === "all" || (p.productGroup ?? "") === t.group) &&
  (upTo < 2 || t.category === "all" || (p.category ?? "") === t.category) &&
  (upTo < 3 || t.subcategory === "all" || (p.subcategory ?? "") === t.subcategory) &&
  (upTo < 4 || t.type === "all" || (p.type ?? "") === t.type);

const ALL: Tax = { group: "all", category: "all", subcategory: "all", type: "all" };
const torna: P = { productGroup: "CNC", category: "Tezgah", subcategory: "Torna", type: "CNC Yatay Torna Tezgahı" };
const dik: P = { productGroup: "CNC", category: "Tezgah", subcategory: "İşleme Merkezi", type: "CNC Dik İşleme Merkezi" };
const donanim: P = { productGroup: "CNC", category: "Opsiyonel Donanım" };

describe("ürün taksonomi filtresi", () => {
  it("filtre yokken hepsi geçer", () => {
    for (const p of [torna, dik, donanim]) expect(matches(p, ALL, 4)).toBe(true);
  });

  it("her seviye ayrı ayrı daraltır", () => {
    expect(matches(torna, { ...ALL, subcategory: "Torna" }, 4)).toBe(true);
    expect(matches(dik, { ...ALL, subcategory: "Torna" }, 4)).toBe(false);
    expect(matches(donanim, { ...ALL, category: "Tezgah" }, 4)).toBe(false);
  });

  it("seviyeler VE ile birleşir", () => {
    const t: Tax = { group: "CNC", category: "Tezgah", subcategory: "İşleme Merkezi", type: "CNC Dik İşleme Merkezi" };
    expect(matches(dik, t, 4)).toBe(true);
    expect(matches(torna, t, 4)).toBe(false);
  });

  it("üst seviye seçenekleri alt filtrelerden etkilenmez (kaskad yönü)", () => {
    // upTo=1 yalnız grubu uygular: kategori seçeneklerini türetirken kullanılır.
    const t: Tax = { ...ALL, group: "CNC", category: "Tezgah" };
    expect(matches(donanim, t, 1)).toBe(true);
    expect(matches(donanim, t, 2)).toBe(false);
  });

  it("alanı boş ürün, o alanda filtre varken elenir", () => {
    expect(matches(donanim, { ...ALL, subcategory: "Torna" }, 4)).toBe(false);
  });
});
