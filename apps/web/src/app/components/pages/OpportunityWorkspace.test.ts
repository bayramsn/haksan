import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("lead ve fırsat çalışma alanı sorumlu değişikliği", () => {
  const railSource = readFileSync(new URL("./LeadWorkspaceControls.tsx", import.meta.url), "utf8");
  const workspaceSource = readFileSync(new URL("./OpportunityWorkspace.tsx", import.meta.url), "utf8");

  it("Karar Rayı içinde izin kontrollü sorumlu seçimi sunar", () => {
    expect(railSource).toContain("canAssignOwner");
    expect(railSource).toContain("Lead sorumlusu değiştirildi");
    expect(railSource).toContain("Fırsat sorumlusu değiştirildi");
    expect(railSource).toContain('value={salesCase.assignedUserId || "__none__"}');
    expect(railSource).toContain("Sahipsiz havuz");
  });

  it("mobil Karar Rayı ve Türkçe geçmiş görünümünü günceller", () => {
    expect(railSource).toContain("lg:hidden");
    expect(railSource).toContain("onOwnerChanged");
    expect(workspaceSource).toContain('"opportunity.owner_changed": "Sorumlu değiştirildi"');
    expect(workspaceSource).toContain('hasRole("sales") || hasRole("super_admin")');
  });

  it("fırsat zaman çizelgesinde yalnızca elle eklenen yorumları gösterir", () => {
    expect(workspaceSource).toContain('activity.origin === "manual"');
    expect(workspaceSource).toContain('activity.typeCode === "note"');
    expect(workspaceSource).toContain('opportunityActivities.filter(isManualTimelineComment)');
    expect(workspaceSource).toContain('if (!isLead) return items.sort');
    expect(workspaceSource).toContain('"Yalnızca kullanıcıların elle eklediği yorumlar gösterilir."');
  });
});
