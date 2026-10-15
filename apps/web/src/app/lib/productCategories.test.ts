import { describe, expect, it } from "vitest";
import { displayProductCategoryOptions, sameProductCategory, uniqueProductCategoryOptions, productCategoriesForGroup, productCategoryCodeForGroup } from "./productCategories";

const categories = [
  { code: "TEZGAH", label: "Tezgah" },
  { code: "cnc_machine", label: "Tezgah" },
  { code: "universal_machine", label: "Tezgah" },
  { code: "AKSESUAR", label: "Aksesuar" },
];

describe("CRM ortak kategori seçimleri", () => {
  const scoped = [
    { code: "TEZGAH", label: "Tezgah", productGroupCode: "CNC" },
    { code: "universal_machine", label: "Tezgah", productGroupCode: "UNIVERSAL" },
    { code: "sac_machine", label: "Tezgah", productGroupCode: "SAC_ISLEME" },
    { code: "AKSESUAR", label: "Aksesuar" },
  ];
  it("kategori tekilleştirmeden önce seçili bölümün gerçek kodlarını ayırır", () => {
    for (const [group, code] of [["CNC", "TEZGAH"], ["UNIVERSAL", "universal_machine"], ["SAC_ISLEME", "sac_machine"]]) {
      expect(uniqueProductCategoryOptions(productCategoriesForGroup(scoped, group), "TEZGAH").map((o) => o.code)).toEqual([code, "AKSESUAR"]);
    }
  });
  it("grup değişiminde aynı etiketin hedef bölümdeki kodunu seçer", () => {
    expect(productCategoryCodeForGroup(scoped, "UNIVERSAL", "TEZGAH")).toBe("universal_machine");
    expect(productCategoryCodeForGroup(scoped, "SAC_ISLEME", "universal_machine")).toBe("sac_machine");
    expect(productCategoryCodeForGroup(scoped, "CNC", "sac_machine")).toBe("TEZGAH");
    expect(productCategoryCodeForGroup(scoped, "UNIVERSAL", "AKSESUAR")).toBe("AKSESUAR");
    expect(productCategoryCodeForGroup(scoped, "UNIVERSAL", "missing")).toBe("");
  });
  it("iki teklif satırında tek kategori gösterirken her satırın gerçek kodunu korur", () => {
    for (const selected of ["cnc_machine", "universal_machine"]) {
      const options = uniqueProductCategoryOptions(categories, selected);
      expect(options.filter((option) => option.label === "Tezgah")).toEqual([{ code: selected, label: "Tezgah" }]);
    }
  });

  it("tek Tezgah filtresi tüm eski kategori kodlarındaki ürünlere ulaşır", () => {
    const products = [
      { id: "cnc", categoryCode: "cnc_machine" },
      { id: "universal", categoryCode: "universal_machine" },
      { id: "accessory", categoryCode: "AKSESUAR" },
    ];
    expect(products.filter((product) => sameProductCategory(categories, product.categoryCode, "TEZGAH"))
      .map((product) => product.id)).toEqual(["cnc", "universal"]);
    expect(products.map((product) => product.categoryCode)).toEqual(["cnc_machine", "universal_machine", "AKSESUAR"]);
  });

  it("UUID ile seçilen yönetim kaydını korur ve aynı adlı ebeveynleri eşleştirir", () => {
    const options = [{ code: "id-common", label: "Tezgah" }, { code: "id-division", label: "TEZGAH " }];
    expect(uniqueProductCategoryOptions(options, "id-division")).toEqual([options[1]]);
    expect(sameProductCategory(options, "id-common", "id-division")).toBe(true);
    expect(sameProductCategory(options, "id-common", "missing-id")).toBe(false);
  });
});

describe("bölüme özel makine kategori başlıkları", () => {
  it("başlık değişse de gerçek kod ve eski kategori eşlemesi korunur", () => {
    const options = displayProductCategoryOptions(categories, "UNIVERSAL");
    expect(options[0].label).toBe("Üniversal Tezgahlar");
    expect(options[0].code).toBe("TEZGAH");
    expect(sameProductCategory(options, "universal_machine", "TEZGAH")).toBe(true);
    expect(options.find((option) => option.code === "AKSESUAR")?.label).toBe("Aksesuar");
  });
  it("bütün bölümler görünürken aynı adlı bölüm kayıtları birleşmez", () => {
    const options = [{ code: "TEZGAH", label: "Tezgah", productGroupCode: "CNC" },
      { code: "TEZGAH", label: "Tezgah", productGroupCode: "SAC_ISLEME" }];
    expect(displayProductCategoryOptions(uniqueProductCategoryOptions(options)).map((option) => option.label))
      .toEqual(["CNC Tezgahları", "Sac İşleme Tezgahları"]);
  });
});

describe("ana makine kategorisi kapsamı", () => {
  it("kaynak, hava ve taşıma Tezgah kategorilerini değiştirmez veya birleştirmez", () => {
    const options = ["TEZGAH", "HM_KAYNAK_TEZGAH", "HM_HAVA_TEZGAH", "HM_TASIMA_TEZGAH"].map((code) => ({ code, label: "Tezgah" }));
    const displayed = displayProductCategoryOptions(options, "SAC_ISLEME");
    expect(displayed.map((option) => option.label)).toEqual(["Sac İşleme Tezgahları", "Tezgah", "Tezgah", "Tezgah"]);
    expect(uniqueProductCategoryOptions(displayed)).toHaveLength(4);
    for (const code of options.slice(1).map((option) => option.code)) expect(sameProductCategory(displayed, code, "TEZGAH")).toBe(false);
  });
  it("veritabanında yeniden adlandırılan başlıklarda eski makine kodlarını eşdeğer tutar", () => {
    const options = [{ code: "TEZGAH", label: "CNC Tezgahları" }, { code: "universal_machine", label: "Üniversal Tezgahlar" }, { code: "sac_machine", label: "Sac İşleme Tezgahları" }];
    expect(sameProductCategory(options, "universal_machine", "TEZGAH")).toBe(true);
    expect(sameProductCategory(options, "sac_machine", "TEZGAH")).toBe(true);
  });
});
