import { describe, expect, it } from "vitest";
import { productFamilyLabel } from "./Operations";
import type { Product } from "../../lib/mock";

const product = (fields: Partial<Product>) => ({ model: "", ...fields }) as Product;

describe("productFamilyLabel", () => {
  it("üniversal tornayı CNC torna ailesine yerleştirmez", () => {
    expect(productFamilyLabel(product({ model: "C-11 MT", productGroupCode: "UNIVERSAL", categoryCode: "TEZGAH", productTypeCode: "HM_UNIVERSAL_UNIVERSAL_TORNA_TEZGAHLARI", type: "Üniversal Torna Tezgahları" }))).toBe("Üniversal Torna Tezgahları");
  });
  it("üniversal model önekini CNC işleme merkezi olarak sınıflandırmaz", () => {
    expect(productFamilyLabel(product({ model: "MT-100", productGroupCode: "UNIVERSAL", categoryCode: "TEZGAH", productTypeCode: "HM_UNIVERSAL_KALIPCI_FREZE_TEZGAHLARI", type: "Kalıpçı Freze Tezgahları" }))).toBe("Kalıpçı Freze Tezgahları");
  });
  it("sac makinesinin CNC ile çakışan seri önekinde kendi tipini gösterir", () => {
    expect(productFamilyLabel(product({ model: "C-320", productGroupCode: "SAC_ISLEME", categoryCode: "TEZGAH", productTypeCode: "ABKANT_PRES", type: "Abkant Pres" }))).toBe("Abkant Pres");
  });
  it("tezgah dışı kalemi kendi kategorisinde bırakır", () => {
    // "C-…" modeli tezgah seri önekiyle eşleşiyor; kategori tezgah olmadığı için
    // aile kuralları uygulanmamalı.
    expect(productFamilyLabel(product({
      model: "C-320 Chip Conveyor",
      categoryCode: "OPSIYONEL_DONANIM",
      category: "Opsiyonel Donanım",
    }))).toBe("Opsiyonel Donanım");
  });

  it("tezgahı seri önekinden aileye yerleştirir", () => {
    expect(productFamilyLabel(product({
      model: "MV-1050",
      categoryCode: "TEZGAH",
      category: "Tezgah",
    }))).toBe("CNC Dik İşleme Merkezleri");
  });
});
