import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const proforma = readFileSync(new URL("./proformaPrint.ts", import.meta.url), "utf8");
const editDialog = readFileSync(
  new URL("../../components/dialogs/EditDocumentDialog.tsx", import.meta.url),
  "utf8",
);
const contractPrint = readFileSync(new URL("./contractPrint.ts", import.meta.url), "utf8");

describe("belge metnindeki üretim yılı", () => {
  it("yılı belge tarihinden değil ürün kartından alır", () => {
    // "Üretim yılı 2023 olup yeni ve kullanılmamıştır" cümlesi belge tarihinden
    // türetilince 2023 üretimi bir tezgah 2026 yazıyordu.
    expect(proforma).toContain("const documentProductionYear = (");
    expect(proforma).toContain("products.find((product) => product.id === String(id ?? \"\"))?.productionYear");
    expect(contractPrint).toContain("yil: product?.productionYear");
    expect(editDialog).toContain("contractTermsFillContext(document.documentSnapshot, products)");
  });

  it("ürün kartında yıl boşsa eski davranışa düşer", () => {
    expect(proforma).toContain("return fallbackYear;");
    // İki üretim yolu da (anlık görüntü / canlı teklif) aynı yardımcıyı çağırır.
    expect(proforma.match(/documentProductionYear\(\n/g) ?? []).toHaveLength(2);
  });
});
