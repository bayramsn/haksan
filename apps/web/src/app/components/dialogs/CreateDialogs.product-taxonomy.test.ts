import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isNewLaserBaseCard, preserveProductCategorySelection, sameProductCategory, subcategoriesForProductCategory, uniqueProductCategoryOptions } from "./CreateDialogs";

const createDialogsSource = readFileSync(new URL("./CreateDialogs.tsx", import.meta.url), "utf8");

const subcategories = [
  { code: "ISLEME_MERKEZI", label: "İşleme Merkezi", categoryCode: "TEZGAH" },
  { code: "TORNA", label: "Torna", categoryCode: "TEZGAH" },
  { code: "SAC_BUKME", label: "Bükme", categoryCode: "TEZGAH" },
  { code: "SAC_KESME", label: "Kesme", categoryCode: "TEZGAH" },
];

const productTypes = [
  { code: "CNC_DIK", label: "CNC Dik", categoryCode: "TEZGAH", subcategoryCode: "ISLEME_MERKEZI", productGroupCode: "CNC" },
  { code: "CNC_TORNA", label: "CNC Torna", categoryCode: "TEZGAH", subcategoryCode: "TORNA", productGroupCode: "CNC" },
  { code: "ABKANT", label: "Abkant", categoryCode: "TEZGAH", subcategoryCode: "SAC_BUKME", productGroupCode: "SAC_ISLEME" },
  { code: "GIYOTIN", label: "Giyotin", categoryCode: "TEZGAH", subcategoryCode: "SAC_KESME", productGroupCode: "SAC_ISLEME" },
];

describe("ürün taksonomisi bölüm filtresi", () => {
  it("farklı bölümlerdeki aynı kategoriyi bir kez gösterir ve ilk gerçek kodu korur", () => {
    const options = [
      { code: "tezgah", label: "Tezgah" },
      { code: "TEZGAH", label: "Tezgah" },
      { code: "AKSESUAR", label: "Aksesuar" },
      { code: "aksesuar", label: "Aksesuar" },
      { code: "ISCILIK", label: "İşçilik" },
    ];

    expect(uniqueProductCategoryOptions(options)).toEqual([options[0], options[2], options[4]]);
    expect(options).toHaveLength(5);
  });

  it("farklı eski kodlarla kayıtlı aynı kategoriyi tek seçenek yapar", () => {
    const options = [
      { code: "cnc_machine", label: "Tezgah" },
      { code: "TEZGAH", label: "Tezgah" },
      { code: "universal_machine", label: "tezgah " },
      { code: "cnc_accessory", label: "Aksesuar" },
      { code: "AKSESUAR", label: "Aksesuar" },
    ];
    expect(uniqueProductCategoryOptions(options)).toEqual([options[1], options[4]]);
  });

  it("eski kategori koduyla düzenlenen ürünün seçimini ve bağlantılarını korur", () => {
    const options = [
      { code: "TEZGAH", label: "Tezgah" },
      { code: "universal_machine", label: "Tezgah" },
      { code: "AKSESUAR", label: "Aksesuar" },
    ];
    expect(uniqueProductCategoryOptions(options, "universal_machine")).toEqual([options[1], options[2]]);
    expect(uniqueProductCategoryOptions(options, "tezgah")).toEqual([options[0], options[2]]);
  });

  it("tek kategori altında CNC ve Üniversal eski kodlarının alt kategorilerini erişilebilir tutar", () => {
    const categories = [
      { code: "TEZGAH", label: "Tezgah" },
      { code: "universal_machine", label: "Tezgah" },
      { code: "accessory", label: "Aksesuar" },
    ];
    const linkedSubcategories = [
      { code: "CNC_TORNA", label: "CNC Torna", categoryCode: "TEZGAH", productGroupCode: "CNC" },
      { code: "UNI_TORNA", label: "Üniversal Torna", categoryCode: "universal_machine", productGroupCode: "UNIVERSAL" },
      { code: "TOOL", label: "Takım", categoryCode: "accessory", productGroupCode: "UNIVERSAL" },
    ];
    const visibleCategory = uniqueProductCategoryOptions(categories)[0].code;
    expect(subcategoriesForProductCategory(visibleCategory, [], linkedSubcategories, "UNIVERSAL", categories))
      .toEqual([linkedSubcategories[1]]);
    expect(subcategoriesForProductCategory(visibleCategory, [], linkedSubcategories, "CNC", categories))
      .toEqual([linkedSubcategories[0]]);
    expect(sameProductCategory(categories, "universal_machine", visibleCategory)).toBe(true);
    expect(sameProductCategory(categories, "accessory", visibleCategory)).toBe(false);
    expect(linkedSubcategories[1].categoryCode).toBe("universal_machine");
  });

  it("eski kategori kodundaki tezgah ve opsiyonel donanım davranışını korur", () => {
    const categories = [
      { code: "universal_machine", label: "Tezgah" },
      { code: "legacy_optional", label: "Opsiyonel Donanım" },
    ];
    expect(sameProductCategory(categories, "universal_machine", "TEZGAH")).toBe(true);
    expect(sameProductCategory(categories, "legacy_optional", "OPSIYONEL_DONANIM")).toBe(true);
    expect(sameProductCategory(categories, "unknown", "TEZGAH")).toBe(false);
  });

  it("uyumlu kategorilerin çoklu seçiminde eski kodları koruyup aynı adı bir kez gösterir", () => {
    const options = [
      { code: "TEZGAH", label: "Tezgah" },
      { code: "universal_machine", label: "Tezgah" },
      { code: "AKSESUAR", label: "Aksesuar" },
    ];
    const previous = ["universal_machine", "TEZGAH"];
    const visible = uniqueProductCategoryOptions(options, previous);
    expect(visible).toHaveLength(2);
    expect(preserveProductCategorySelection(options, previous, [visible[0].code, "AKSESUAR"]))
      .toEqual(["universal_machine", "TEZGAH", "AKSESUAR"]);
    expect(preserveProductCategorySelection(options, previous, ["AKSESUAR"]))
      .toEqual(["AKSESUAR"]);
    expect(uniqueProductCategoryOptions(options, ["universal_machine"])[0].code).toBe("universal_machine");
    expect(preserveProductCategorySelection(options, ["other_division_category"], ["other_division_category", "AKSESUAR"]))
      .toEqual(["other_division_category", "AKSESUAR"]);
  });

  it("farklı adlara sahip kategorileri ayrı tutar", () => {
    const options = [
      { code: "YEDEK_PARCA", label: "Yedek Parça" },
      { code: "AKSESUAR", label: "Aksesuar" },
    ];
    expect(uniqueProductCategoryOptions(options)).toEqual(options);
  });

  it("Türkçe harflerle yazılan kategori kodlarını tekilleştirir", () => {
    const options = [
      { code: "işçilik", label: "İşçilik" },
      { code: "ISCILIK", label: "İşçilik" },
      { code: "opsiyonel_donanım", label: "Opsiyonel Donanım" },
      { code: "OPSIYONEL_DONANIM", label: "Opsiyonel Donanım" },
    ];
    expect(uniqueProductCategoryOptions(options)).toEqual([options[0], options[2]]);
  });

  it("fırsat sorumlusu listesinde rol ayırmadan tüm kullanıcıları gösterir", () => {
    expect(createDialogsSource).toContain("{users.map((u) => (");
    expect(createDialogsSource).not.toContain('users.filter((u) => u.role === "Sales" || u.role === "Admin")');
  });

  it("Tümü kapsamında ürün grubu seçilmeden alt kategori göstermez", () => {
    const result = subcategoriesForProductCategory("TEZGAH", productTypes, subcategories, "");
    expect(result).toEqual([]);
  });

  it("CNC grubunda Sac İşleme alt kategorilerini göstermez", () => {
    const result = subcategoriesForProductCategory("TEZGAH", productTypes, subcategories, "CNC");
    expect(result.map((item) => item.label)).toEqual(["İşleme Merkezi", "Torna"]);
  });

  it("Sac İşleme grubunda yalnız Bükme ve Kesme gösterir", () => {
    const result = subcategoriesForProductCategory("TEZGAH", productTypes, subcategories, "SAC_ISLEME");
    expect(result.map((item) => item.label)).toEqual(["Bükme", "Kesme"]);
  });

  it("departman değiştiğinde CRM lookup kayıtlarını yeniden yükler", () => {
    expect(createDialogsSource).toContain("const { activeDivision, activeDepartment } = useAuth();");
    expect(createDialogsSource).toContain("[name, activeDivision, activeDepartment, exactDivision]");
  });
});


describe("yeni lazer baz kartı", () => {
  it("sac ve boru lazerlerinde sabit ölçü/güç seçimi yerine seri kartı oluşturur", () => {
    expect(isNewLaserBaseCard('create', 'FIBER_LAZER_KESIM')).toBe(true);
    expect(isNewLaserBaseCard('create', 'BORU_LAZER_KESIM')).toBe(true);
    expect(isNewLaserBaseCard('edit', 'FIBER_LAZER_KESIM')).toBe(false);
  });
  it("fiber kaynakta baz kart oluşturur; temizleme ve lazer dışı akışları korur", () => {
    expect(isNewLaserBaseCard('create', 'FIBER_LAZER_KAYNAK')).toBe(true);
    expect(isNewLaserBaseCard('create', 'LAZER_TEMIZLEME')).toBe(false);
    expect(isNewLaserBaseCard('create', 'ABKANT')).toBe(false);
  });
});
