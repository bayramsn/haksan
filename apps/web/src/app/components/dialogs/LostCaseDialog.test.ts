import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("kaybedilen fırsat ayrıntıları", () => {
  const source = readFileSync(new URL("./LostCaseDialog.tsx", import.meta.url), "utf8");

  it("LOST penceresi rakip kataloğunu API'den yükler", () => {
    expect(source).toContain("competitorService");
    expect(source).toContain(".list({ pageSize: 100 })");
    expect(source).toContain("Rakip seçin");
  });

  it("firma ve ürünü kayıp anında açıkça gösterir", () => {
    expect(source).toContain("Kaybedilen firma");
    expect(source).toContain("Kaybedilen Ürün / Makine *");
    expect(source).toContain("productName: productName.trim()");
  });

  it("rakip ve karşılanmayan şartları toplar", () => {
    expect(source).toContain("Rakip Kim?");
    expect(source).toContain("Rakip yok / bilinmiyor");
    // Tek combobox: listeden seç ya da yazdığını elle kaydet.
    expect(source).toContain("<Combobox");
    expect(source).toContain("Listede yok — \"${query}\" olarak kaydet");
    expect(source).toContain('competitorName: competitorId === "__manual__" ? competitorName.trim() : undefined');
    expect(source).toContain('maxLength={255}');
    expect(source).toContain("Hangi Şartlarımız Uymadı? *");
    expect(source).toContain("unmetConditions: unmetConditions.trim()");
  });

  it("rakip kataloğu yüklenemezse hatayı sessizce gizlemez", () => {
    expect(source).toContain("competitorLoadError");
    expect(source).toContain("Rakip kataloğu alınamadı");
    expect(source).toContain('role="alert"');
  });
});
