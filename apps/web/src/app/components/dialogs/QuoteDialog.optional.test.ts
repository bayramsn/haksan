import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./QuoteDialog.tsx", import.meta.url), "utf8");

describe("teklifte opsiyonel donanım seçicisi", () => {
  it("uyumluluğu sunucudan sorar, satırın tezgahına göre", () => {
    // Seçici eskiden bölümdeki tüm opsiyonel donanımları listeliyordu; ECOCA
    // torna satırında LK Machinery donanımı da çıkıyordu.
    expect(source).toContain("productService\n        .compatibleOptionalEquipment(productId)");
    expect(source).toContain('l.categoryCode === "TEZGAH" && l.productId');
    expect(source).toContain("compatibleOptionalIds[l.productId]");
  });

  it("uyumluları ayrı grupta gösterir, kalanları erişilebilir bırakır", () => {
    expect(source).toContain("Bu tezgahla uyumlu");
    expect(source).toContain("Diğer donanımlar");
    // Uyumlu liste gelmeden hepsi tek listede kalmalı (compatIds undefined).
    expect(source).toContain("const others = compatIds");
  });

  it("aynı tezgah için tek istek atar", () => {
    expect(source).toContain("compatibleRequested.current.has(productId)");
    expect(source).toContain("compatibleRequested.current.add(productId)");
  });
});
