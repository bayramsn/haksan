import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("firma bazlı doküman yükleme ve silme", () => {
  it("satış kartı verilmediyse firma bağlantısını varsayılan yapar", () => {
    const source = readFileSync(new URL("./DocumentUploadDialog.tsx", import.meta.url), "utf8");

    expect(source).toContain('const initialScope = defaultSalesCaseId ? "case" : "company"');
    expect(source).toContain("Satış kartı (opsiyonel)");
    expect(source).toContain("satış kartı gerekmez");
  });

  it("yüklenen belge türünü klasörler arasında kalıcı olarak ayırır", () => {
    const dialogSource = readFileSync(new URL("./DocumentUploadDialog.tsx", import.meta.url), "utf8");
    const storeSource = readFileSync(new URL("../../lib/store.tsx", import.meta.url), "utf8");

    expect(dialogSource).toContain('documentTypeCode: "accounting_invoice_pdf"');
    expect(dialogSource).toContain('documentTypeCode: "delivery_form"');
    expect(dialogSource).toContain('documentTypeCode: "installation_form"');
    expect(storeSource).toContain("if (code === 'accounting_invoice_pdf') return 'AccountingInvoice'");
    expect(storeSource).toContain("if (code === 'delivery_form') return 'DeliveryForm'");
    expect(storeSource).toContain("if (code === 'installation_form') return 'InstallationForm'");
  });

  it("ticari belge merkezini erişilebilir belge klasörlerine ayırır", () => {
    const source = readFileSync(
      new URL("../pages/documents/DocumentsPage.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("function DocumentFolderButton");
    expect(source).toContain("Belge klasörleri");
    expect(source).toContain('aria-controls="document-folder-contents"');
    expect(source).toContain('id="document-folder-contents"');
    expect(source).toContain("defaultType={initialType ?? activeFolderType ?? undefined}");
    expect(source).toContain("Tüm belgeler");
  });

  it("yüklenen dosyayı dosya kimliğiyle siler", () => {
    const source = readFileSync(
      new URL("../pages/documents/DocumentsPage.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('d.source === "uploaded_file" && d.fileId');
    expect(source).toContain("await fileService.remove(d.fileId)");
    expect(source).toContain('d.source === "uploaded_file" || d.type === "Proforma"');
    expect(source).toContain('deletingDocumentId ? "Siliniyor…" : "Belgeyi Sil"');
  });

  it("satış kartının doküman sekmesinde de yüklenen dosyayı silebilir", () => {
    const source = readFileSync(
      new URL("../pages/SalesCaseDetail.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("const deleteUploadedDocument");
    expect(source).toContain("await fileService.remove(documentItem.fileId)");
    expect(source).toContain('d.source === "uploaded_file" && d.fileId');
    expect(source).toContain('title="Dosyayı sil"');
    expect(source).toContain('deletingDocumentId ? "Siliniyor…" : "Dosyayı sil"');
  });

  it("dosya yüklemelerinde ikinci bir ticari kayıt oluşturmaz", () => {
    const source = readFileSync(new URL("../../lib/store.tsx", import.meta.url), "utf8");
    const addDocument = source.slice(
      source.indexOf("const addDocument: Store['addDocument']"),
      source.indexOf("const value = useMemo<Store>"),
    );

    expect(addDocument).toContain("Dosya bağlantısı /files/link ile zaten kalıcılaştırılır");
    expect(addDocument).not.toContain("createProforma");
    expect(addDocument).not.toContain("createContract");
    expect(addDocument).not.toContain("createCommercialInvoice");
  });
});
