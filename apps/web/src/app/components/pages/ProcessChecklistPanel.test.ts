import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ProcessChecklistPanel.tsx", import.meta.url), "utf8");

describe("ProcessChecklistPanel teklif adımı", () => {
  it("B sürecindeki teklif kontrolünü teklif penceresine bağlar", () => {
    expect(source).toContain('case "quote":');
    expect(source).toContain("<QuoteDialog");
    expect(source).toContain("defaultCaseId={sc.id}");
    expect(source).toContain("Teklif oluştur");
  });

  it("firma ve teklif oluşturma yetkisini doğrular", () => {
    expect(source).toContain('hasPermission("quotes.create")');
    expect(source).toContain("Tekliften önce firma bağlanmalı.");
    expect(source).toContain("Teklif oluşturma yetkiniz bulunmuyor.");
  });
});

describe("ProcessChecklistPanel ilerletme güvenliği", () => {
  it("Lead ilerletmesini genel derece PATCH'i yerine özel dönüşüm akışına yönlendirir", () => {
    expect(source).toContain('if (grade === "lead")');
    expect(source).toContain('[data-workspace-primary="convert"]');
  });

  it("güncelleme yetkisi olmayan kullanıcı için kayıt ve ilerletme işlemlerini kapatır", () => {
    expect(source).toContain('hasPermission("opportunities.update")');
    expect(source).toContain("if (!canUpdate || advancing");
    expect(source).toContain("disabled={!canUpdate || !readiness.ready || advancing}");
  });
});
