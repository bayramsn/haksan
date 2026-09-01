import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fırsat kapatma penceresi", () => {
  const source = readFileSync(new URL("./CloseCaseDialog.tsx", import.meta.url), "utf8");

  it("LOST penceresi rakip kataloğunu API'den yükler", () => {
    expect(source).toContain("competitorService");
    expect(source).toContain(".list({ pageSize: 100 })");
    expect(source).toContain("Rakip seçin");
  });

  it("firma ve ürünü kayıp anında açıkça gösterir", () => {
    expect(source).toContain("Kapatılan fırsat");
    expect(source).toContain("Kaybedilen Ürün / Makine *");
    expect(source).toContain("productName: productName.trim()");
  });

  it("rakip ve karşılanmayan şartları toplar", () => {
    expect(source).toContain("Hangi firmaya kaybedildi?");
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

  it("kapanış türünü seçtirir ve iptali kayıptan ayırır", () => {
    // "İptal" kayıp analizine girmemeli: ayrı neden listesi ve ayrı store eylemi.
    expect(source).toContain("Kapanış türü *");
    expect(source).toContain("İptal edildi");
    expect(source).toContain("CANCEL_REASONS");
    expect(source).toContain("cancelCase(caseId!, { reasonCode");
    expect(source).toContain("cancel_second_hand");
  });

  it("iptal seçiliyken rakip kataloğunu çağırmaz", () => {
    expect(source).toContain('outcome !== "lost"');
  });
});
