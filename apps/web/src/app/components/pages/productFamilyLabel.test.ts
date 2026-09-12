import { describe, expect, it } from "vitest";
import { productFamilyLabel } from "./Operations";
import type { Product } from "../../lib/mock";

const product = (fields: Partial<Product>) => ({ model: "", ...fields }) as Product;

describe("productFamilyLabel", () => {
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
