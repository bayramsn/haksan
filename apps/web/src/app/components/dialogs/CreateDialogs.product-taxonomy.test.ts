import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { subcategoriesForProductCategory } from "./CreateDialogs";

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
