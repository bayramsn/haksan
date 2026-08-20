import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detailSource = readFileSync(new URL("./CustomerDetail.tsx", import.meta.url), "utf8");
const customersSource = readFileSync(new URL("./Customers.tsx", import.meta.url), "utf8");
const dialogsSource = readFileSync(new URL("../dialogs/DetailDialogs.tsx", import.meta.url), "utf8");

describe("müşteri detayına geçiş ve belgeler", () => {
  it("firma penceresinden tam müşteri detayına açık bir komutla geçer", () => {
    expect(customersSource).toContain("useDetailDialogs({ onOpenCompanyDetail: onSelect })");
    expect(dialogsSource).toContain("Müşteri Detayına Git");
    expect(dialogsSource).toContain("onOpenFullDetail(customer)");
  });

  it("firma ve fırsat belgelerini tek sekmede toplar", () => {
    expect(detailSource).toContain('item.companyId === customer.id || (item.salesCaseId && companyCaseIds.has(item.salesCaseId))');
    expect(detailSource).toContain('<TabsTrigger value="documents">Belgeler ({companyDocuments.length})</TabsTrigger>');
    expect(detailSource).toContain("<DocumentPreviewDialog doc={selectedDocument}");
  });

  it("yetkili kullanıcı için yüklemeyi doğrudan firmaya bağlar", () => {
    expect(detailSource).toContain('hasPermission("files.create")');
    expect(detailSource).toContain("defaultCompanyId={customer.id}");
    expect(detailSource).toContain("onUploaded={() => refresh()}");
  });
});
