import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ContractActionsDialogs.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../pages/OpportunityWorkspace.tsx", import.meta.url), "utf8");

describe("fırsattaki sözleşme işlemleri", () => {
  it("imzalı nüshayı PDF ve 25 MB ile sınırlar, fırsata bağlar", () => {
    // Doğrulama saf fonksiyonda; davranışı OpportunityContractList.test.ts kanıtlar.
    expect(source).toContain("signedContractFileError(file)");
    expect(source).toContain("MAX_SIGNED_CONTRACT_BYTES = 25 * 1024 * 1024");
    expect(source).toContain('bucket: "erp-contract-documents"');
    expect(source).toContain('entityType: "opportunity"');
    expect(source).toContain('documentTypeCode: "contract_pdf"');
  });

  it("aynı sözleşmeyi imzalı duruma getirir ve fırsattan görüntüler", () => {
    expect(source).toContain("documentService.updateContract(document.id");
    expect(source).toContain('statusCode: "signed"');
    expect(workspaceSource).toContain("<SignedContractUploadDialog");
    // Aynı yükleyici süreç adımının altındaki sözleşme listesinde de kullanılır.
    expect(
      readFileSync(new URL("../pages/OpportunityContractList.tsx", import.meta.url), "utf8"),
    ).toContain("<SignedContractUploadDialog");
    expect(workspaceSource).toContain("setSelectedFileDocument(document)");
    expect(workspaceSource).toContain("onOpenOffer={(offer) => onOpenOffer?.(offer.id)}");
  });

  it("taslak sözleşmenin değiştirilebilir şartlarını kaydeder", () => {
    expect(source).toContain("paymentTermsText: payment.trim()");
    expect(source).toContain("deliveryTermsText: delivery.trim()");
    expect(source).toContain("warrantyTermsText: warranty.trim()");
    expect(workspaceSource).toContain('hasPermission("contracts.update") && !document.fileId');
  });

  it("K.D.V. ve nakliye maddelerini seçtirir, kalan şartları silmez", () => {
    // Metin kutuları dışındaki şartlar (teslim yeri/süresi, ithalat masrafı) aynı
    // alanda durur; yalnız üç metni göndermek onları siliyordu.
    expect(source).toContain("...carriedTerms,");
    // NULL sütunlar geri gönderilmez: zod `.optional()` null'ı reddeder ve
    // `estimatedDeliveryDays*: null` 0'a coerce olup uydurma teslim ayı doğurur.
    expect(source).toContain("filter(([, value]) => value !== null)");
    expect(source).toContain("vatIncluded,");
    expect(source).toContain("freightPaidBySeller,");
  });
});
