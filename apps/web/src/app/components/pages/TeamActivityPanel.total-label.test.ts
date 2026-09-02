import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./TeamActivityPanel.tsx", import.meta.url), "utf8");

describe("ekip aktivite tablosu toplam sütunu", () => {
  it("başlık toplamın yalnız faaliyetleri saydığını söyler", () => {
    // Sütun "Toplam" iken Kazanılan'ın dışarıda kalması yanıltıcı görünüyordu.
    expect(source).toContain("Toplam Faaliyet</TableHead>");
    expect(source).not.toContain(">Toplam</TableHead>");
  });

  it("dipnot formülü açıkça yazar", () => {
    expect(source).toContain("Toplam Faaliyet = Teklif + Aktivite + Yeni fırsat");
    expect(source).toContain("Kazanılan bir sonuç metriği olduğu için toplama katılmaz");
  });
});
