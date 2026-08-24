import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("teklif PDF adresi düzenleme", () => {
  it("teklif kaydından önce değişen firma ve PDF adresini otomatik kaydeder", () => {
    const source = readFileSync(new URL("./QuoteDialog.tsx", import.meta.url), "utf8");

    expect(source).toContain("if (companyDetailsDirty)");
    expect(source).toContain("await saveCompanyDetails({ notify: false })");
    expect(source.match(/companyAddressId: resolvedCompanyAddressId \|\| undefined/g)).toHaveLength(2);
    expect(source).toContain("Firma Bilgilerini Kaydet");
  });

  it("ürün kaskadındaki alt kategori, grup ve tip seçeneklerini gerçek ürün kapsamına daraltır", () => {
    const source = readFileSync(new URL("./QuoteDialog.tsx", import.meta.url), "utf8");

    expect(source).toContain("productsForSubcategories");
    expect(source).toContain("availableSubcategoryCodes.has(option.code)");
    expect(source).toContain("availableGroupCodes.has(option.code)");
    expect(source).toContain("availableTypeCodes.has(option.code)");
  });
});
