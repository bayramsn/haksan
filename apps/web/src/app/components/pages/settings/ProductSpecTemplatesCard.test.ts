import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("teknik bilgi yeni şablon akışı", () => {
  const source = readFileSync(new URL("./ProductSpecTemplatesCard.tsx", import.meta.url), "utf8");

  it("aktif aile dışındaki eski ürün tipini yeni şablon için kullanmaz", () => {
    expect(source).toContain(
      "const selectedType = scopedTypes.find((type) => sameType(type.code, typeCode)) ?? scopedTypes[0] ?? familyTypes[0]",
    );
  });

  it("henüz kaydedilmemiş katalog satırlarını kaydedilecek değişiklik sayar", () => {
    expect(source).toContain("draftRows.some((row) => row.catalogOnly && !row.isDeleted)");
    expect(source).toContain('selectedTemplateExists ? "Seçili şablonu aç" : "Seçili taslağı aç"');
  });

  it("yeni makine şablonunu boş veya kopya başlangıçla açar", () => {
    expect(source).toContain("ŞABLON AÇMA İSTASYONU");
    expect(source).toContain("NewMachineTemplateDialog");
    expect(source).toContain('type TemplateStartMode = "blank" | "copy"');
    expect(source).toContain("adminService.createMachineTemplate");
    expect(source).toContain("Şablonu oluştur ve aç");
  });
});
