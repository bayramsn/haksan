import { readFileSync } from "node:fs";
import { fileLinkSchema } from "@haksan/shared";
import { describe, expect, it } from "vitest";

describe("firma bazlı doküman yükleme ve silme", () => {
  it("satış kartı verilmediyse firma bağlantısını varsayılan yapar", () => {
    const source = readFileSync(new URL("./DocumentUploadDialog.tsx", import.meta.url), "utf8");

    expect(source).toContain('const initialScope = defaultSalesCaseId ? "case" : "company"');
    expect(source).toContain("Satış kartı (firma otomatik)");
    expect(source).toContain("satış kartı gerekmez");
  });

  it("dış teklifi karta veya firmaya özel ve kısıtlı dosya tipleriyle yükler", () => {
    const source = readFileSync(new URL("./DocumentUploadDialog.tsx", import.meta.url), "utf8");

    expect(source).toContain('value: "ExternalQuote"');
    expect(source).toContain('documentTypeCode: "external_quote"');
    expect(source).toContain('const EXTERNAL_QUOTE_EXTENSIONS: UploadExt[] = ["pdf", "docx", "xlsx"]');
    expect(source).toContain('const lockedType = defaultType === "ExternalQuote"');
    expect(source).toContain("kart seçildiğinde firma otomatik eşleşir");
  });

  it("dış teklif bağlantısını yalnızca firma veya satış kartı için doğrular", () => {
    const base = {
      fileId: "11111111-1111-4111-8111-111111111111",
      entityId: "22222222-2222-4222-8222-222222222222",
      documentTypeCode: "external_quote" as const,
    };

    expect(fileLinkSchema.safeParse({ ...base, entityType: "company" }).success).toBe(true);
    expect(fileLinkSchema.safeParse({ ...base, entityType: "opportunity" }).success).toBe(true);
    expect(fileLinkSchema.safeParse({ ...base, entityType: "quote" }).success).toBe(false);
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

  it("satış kartı ve teklif ekranında dış teklifleri ayrı gösterir", () => {
    const salesCaseSource = readFileSync(
      new URL("../pages/SalesCaseDetail.tsx", import.meta.url),
      "utf8",
    );
    const offersSource = readFileSync(
      new URL("../pages/offers/OffersPage.tsx", import.meta.url),
      "utf8",
    );

    expect(salesCaseSource).toContain('const externalQuotes = docs.filter((d) => d.type === "ExternalQuote")');
    expect(salesCaseSource).toContain('defaultType="ExternalQuote"');
    expect(salesCaseSource).toContain("Bu satış kartına ve bağlı firmaya özel dosyalar");
    expect(offersSource).toContain('documentItem.type !== "ExternalQuote"');
    expect(offersSource).toContain("Firma veya satış kartı özelinde dışarıdan yüklenen teklif dosyaları");
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
