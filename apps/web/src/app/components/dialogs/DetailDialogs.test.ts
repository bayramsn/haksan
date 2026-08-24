import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CompanyDetailDialog firma notları", () => {
  it("firma notunu satır sonlarını ve uzun kelimeleri koruyarak gösterir", () => {
    const source = readFileSync(new URL("./DetailDialogs.tsx", import.meta.url), "utf8");

    expect(source).toContain('aria-label="Firma notları"');
    expect(source).toContain("customer.initialNote?.trim()");
    expect(source).toContain("whitespace-pre-wrap");
    expect(source).toContain("break-words");
    expect(source).toContain("Bu firma için henüz not eklenmemiş.");
  });

  it("firma detayından yetkili kullanıcıyı doğrudan düzenleme formuna geçirir", () => {
    const source = readFileSync(new URL("./DetailDialogs.tsx", import.meta.url), "utf8");

    expect(source).toContain('hasPermission("companies.update")');
    expect(source).toContain("onClick={() => onEdit(customer)}");
    expect(source).toContain("Firma Düzenle");
    expect(source).toContain("<EditCustomerDialog customer={editingCompany}");
  });
});

describe("CompanyDetailDialog fırsat dışı aktiviteler", () => {
  it("firma kartından fırsat seçmeden yeni aktivite açar", () => {
    const source = readFileSync(new URL("./DetailDialogs.tsx", import.meta.url), "utf8");

    expect(source).toContain('hasPermission("activities.create")');
    expect(source).toContain("Fırsat Dışı Aktivite");
    expect(source).toContain("<LogActivityDialog");
    expect(source).toContain("customerId={customer.id}");
  });

  it("aktivite sekmesinde tüm temasları listeler, fırsat dışı olanları etiketler", () => {
    const source = readFileSync(new URL("./DetailDialogs.tsx", import.meta.url), "utf8");

    expect(source).toContain("activity.customerId === customer.id && !activity.salesCaseId");
    expect(source).toContain('hasPermission("activities.read")');
    expect(source).toContain("Aktiviteler ({firmActivities.length})");
    expect(source).toContain("isStandaloneActivity(activity) && <NonOpportunityBadge />");
    expect(source).toContain("Bu firmaya ait aktivite yok.");
  });

  it("fırsat dışı aktiviteyi fırsata dönüştürme düğmesi sunar", () => {
    const source = readFileSync(new URL("./DetailDialogs.tsx", import.meta.url), "utf8");

    expect(source).toContain("<ConvertActivityToOpportunity activity={activity}");
  });
});
