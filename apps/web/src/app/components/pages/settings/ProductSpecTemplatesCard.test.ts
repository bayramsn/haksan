import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("teknik bilgi yeni şablon akışı", () => {
  const source = readFileSync(new URL("./ProductSpecTemplatesCard.tsx", import.meta.url), "utf8");

  it("aktif kategori ve alt kategori dışındaki eski ürün tipini kullanmaz", () => {
    expect(source).toContain(
      "const selectedType = scopedTypes.find((type) => sameType(type.code, typeCode)) ?? scopedTypes[0]",
    );
  });

  it("CRM ürün kategorilerini sabit Tezgah seçimi yerine bağlı hiyerarşide gösterir", () => {
    expect(source).toContain("familyCategories");
    expect(source).toContain('label="Ürün Kategorisi" value={categoryCode} options={categories}');
    expect(source).toContain("type.categoryCode === categoryCode && type.subcategoryCode === subcategoryCode");
    expect(source).not.toContain('value="TEZGAH" options={[{ code: "TEZGAH", label: "Tezgah" }]}');
  });

  it("henüz kaydedilmemiş katalog satırlarını kaydedilecek değişiklik sayar", () => {
    expect(source).toContain("draftRows.some((row) => row.catalogOnly && !row.isDeleted)");
    expect(source).toContain('selectedTemplateExists ? "Seçili şablonu aç" : "Seçili taslağı aç"');
  });

  it("yeni ürün şablonunu CRM ürün tipiyle boş veya kopya başlangıçla açar", () => {
    expect(source).toContain("ŞABLON AÇMA İSTASYONU");
    expect(source).toContain("NewMachineTemplateDialog");
    expect(source).toContain('type TemplateStartMode = "blank" | "copy"');
    expect(source).toContain("adminService.bulkCreateProductSpecTemplates");
    expect(source).toContain("Şablonu aç");
    expect(source).toContain('htmlFor="machine-template-category">Ürün kategorisi');
    expect(source).toContain('htmlFor="machine-template-subcategory">Ürün alt kategorisi');
    expect(source).toContain('htmlFor="machine-template-product-type">Ürün tipi');
  });
});
