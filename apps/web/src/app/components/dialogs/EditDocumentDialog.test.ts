import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./EditDocumentDialog.tsx", import.meta.url), "utf8");
const documentsPage = readFileSync(
  new URL("../pages/documents/DocumentsPage.tsx", import.meta.url),
  "utf8",
);

describe("proforma / sözleşme düzenleyicisi", () => {
  it("iki belge türünü tek bileşenden açar", () => {
    // Ayrı dosyalardayken biri diğerinden geride kalıyordu: iskonto yalnız
    // proformaya, şartlar hiçbirine gelmişti.
    expect(source).toContain('document.type === "Contract" ? "contract" : "proforma"');
    expect(documentsPage.match(/<EditDocumentDialog/g) ?? []).toHaveLength(2);
    expect(documentsPage).not.toContain("EditProformaPricesDialog");
    expect(documentsPage).not.toContain("EditContractPricesDialog");
  });

  it("her iki türde de ürüne özel ve belge geneli iskonto girilir", () => {
    expect(source).toContain("<ProformaItemsEditor");
    expect(source).toContain("<DocumentDiscountFields");
    expect(source).toContain("headerDiscountAmount: documentDiscount.amount");
    expect(source).toContain("headerDiscountPercent: documentDiscount.percent");
    expect(source).toContain("discountAmount: row.discountAmount");
  });

  it("her iki türde de şartlar teklifteki editörle düzenlenir", () => {
    expect(source).toContain("<DocumentTermsTemplateEditor");
    expect(source).toContain('templateScope: "proforma_terms"');
    expect(source).toContain('templateScope: "contract_terms"');
    // Dokunulmayan şart gönderilmez; belge teklifin şartlarıyla basılmaya devam eder.
    expect(source).toContain("...(termsDirty");
  });

  it("2.6 / 3.3 madde seçimlerini yalnız sözleşmede gösterir", () => {
    // Proforma çıktısı bu maddeleri basmaz; orada anahtar göstermek yalan olurdu.
    expect(source).toContain('{kind === "contract" && (');
    expect(source).toContain("vatIncluded: next");
    expect(source).toContain("freightPaidBySeller: next");
  });
});
