import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTRACT_NOTE_VARIANTS, QUOTE_NOTE_VARIANTS, fillNotePlaceholders } from "../../lib/print";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");
const editor = read("./DocumentTermsTemplateEditor.tsx");

describe("belge şart şablonları", () => {
  it("hazır şablonu her ekrana kendi setinden verir", () => {
    // Varsayılan `true` olan `includeBuiltInVariants` yüzünden TEKLİF şablonları
    // proforma ve sözleşme pencerelerine de düşüyordu.
    expect(editor).toContain("builtInVariants = [],");
    // Eski boolean prop kalmamalı (yorumdaki gerekçe metni hariç).
    expect(editor).not.toContain("includeBuiltInVariants?:");
    expect(editor).not.toContain("includeBuiltInVariants =");
    // Editör artık hiçbir seti kendi içinden çekmiyor.
    expect(editor).not.toContain("QUOTE_NOTE_VARIANTS");
  });

  it("teklif setini yalnız teklif penceresine bağlar", () => {
    expect(read("./QuoteDialog.tsx")).toContain("builtInVariants={QUOTE_NOTE_VARIANTS}");
    for (const proforma of ["./CreateProformaDialog.tsx", "./QuickProformaDialog.tsx"]) {
      expect(read(proforma)).not.toContain("builtInVariants={QUOTE_NOTE_VARIANTS}");
    }
  });

  it("sözleşme setini sözleşme pencerelerine bağlar", () => {
    for (const contract of [
      "./CreateContractDialog.tsx",
      "./QuickContractDialog.tsx",
      "./ContractActionsDialogs.tsx",
    ]) {
      expect(read(contract)).toContain("builtInVariants={CONTRACT_NOTE_VARIANTS}");
    }
    expect(read("./EditDocumentDialog.tsx")).toContain("builtInVariants: CONTRACT_NOTE_VARIANTS");
  });

  it("sözleşme seti proformadaki iki teslim şeklini karşılar", () => {
    expect(CONTRACT_NOTE_VARIANTS.map((v) => v.key)).toEqual(["cif-istanbul", "isletme-teslim"]);
    // Teklif setiyle karışmasın: sözleşme metni "Sözleşme …" diye başlar.
    expect(CONTRACT_NOTE_VARIANTS[0].odeme.join(" ")).toContain("Sözleşme toplam bedelinin");
    expect(QUOTE_NOTE_VARIANTS.some((v) => v.odeme.join(" ").includes("Sözleşme toplam bedelinin"))).toBe(false);
  });

  it("kontrol ünitesi markasını yer tutucudan doldurur", () => {
    const [filled] = fillNotePlaceholders(["{{KONTROL_MARKA}} garantisi"], { kontrolMarka: "MITSUBISHI" });
    expect(filled).toBe("MITSUBISHI garantisi");
    // Marka bilinmiyorsa belgeye yanlış marka basmaktansa nötr kalır.
    expect(fillNotePlaceholders(["{{KONTROL_MARKA}}"], {})[0]).toBe("üretici");
  });
});
