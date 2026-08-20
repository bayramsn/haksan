import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./LeadCaptureDialog.tsx", import.meta.url), "utf8");

describe("LeadCaptureDialog uzak firma ve kontak çözümleme", () => {
  it("global store katalogları yerine remote seçicileri kullanır", () => {
    expect(source).toContain("<RemoteCompanyCombobox");
    expect(source).toContain("<RemoteContactCombobox");
    expect(source).toContain("const { refresh } = useStore();");
    expect(source).not.toContain("customers.find");
    expect(source).not.toContain("contacts.find");
  });

  it("seçilen firma kimliğini tam detay sorgusundan hydrate eder", () => {
    expect(source).toContain("useCompanyDetail(companyId)");
    expect(source).toContain("company.id !== companyId");
    expect(source).toContain("setCompanyTitle(company.name)");
    expect(source).toContain("company.city");
    expect(source).toContain("company.district");
    expect(source).toContain("company.phone");
    expect(source).toContain("company.email");
  });

  it("seçilen eski kontak kimliğini detay sorgusuyla iletişim alanlarına taşır", () => {
    expect(source).toContain("useRemoteContactDetail(contactId)");
    expect(source).toContain("contact.id !== contactId");
    expect(source).toContain("contact.mobilePhone || contact.phone || contact.otherPhone");
    expect(source).toContain("contact.email || contact.personalEmail || contact.otherEmail");
  });
});
