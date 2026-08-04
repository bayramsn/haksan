import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("lead ve fırsat çalışma alanı sorumlu değişikliği", () => {
  const railSource = readFileSync(new URL("./LeadWorkspaceControls.tsx", import.meta.url), "utf8");
  const workspaceSource = readFileSync(new URL("./OpportunityWorkspace.tsx", import.meta.url), "utf8");
  const detailSource = readFileSync(new URL("./SalesCaseDetail.tsx", import.meta.url), "utf8");
  const shellSource = readFileSync(new URL("../shared/KanbanDetailDialogShell.tsx", import.meta.url), "utf8");

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

  it("tablet genişliğinde tek işlem dock'unu ve aktivite yetkilerini korur", () => {
    expect(shellSource).toContain("lg:hidden");
    expect(detailSource).toContain('hasPermission("activities.create")');
    expect(detailSource).toContain('hasPermission("activities.update")');
    expect(detailSource).toContain('hasPermission("activities.delete")');
    expect(detailSource).toContain("{canCreateActivity && (");
  });

  it("legacy süreç merkezini korur, sade görünümde tam haritayı kapalı başlatır", () => {
    expect(workspaceSource).toContain("useState(() => !simpleOpportunity)");
    expect(workspaceSource).toContain("setOperationsExpanded(!simpleOpportunity)");
    expect(workspaceSource).toContain("Tam süreç haritasını aç");
    expect(workspaceSource).toContain("Tam süreç raylarını kapat");
  });

  it("fırsat zaman çizelgesinde yorumları ve not yazılmış B aktivitelerini gösterir", () => {
    expect(workspaceSource).toContain('activity.origin === "manual"');
    expect(workspaceSource).toContain('activity.typeCode === "note"');
    expect(workspaceSource).toContain('opportunityActivities.filter(isOpportunityTimelineActivity)');
    expect(workspaceSource).toContain('activity.typeCode === "outgoing_call"');
    expect(workspaceSource).toContain('activity.typeCode === "customer_visit"');
    expect(workspaceSource).toContain('activity.note?.trim() || activity.result?.trim()');
    expect(workspaceSource).toContain('if (!isLead && !simpleOpportunity) return items.sort');
    expect(workspaceSource).toContain('Müşteri temasları ile salt okunur süreç, ticari belge ve onay olayları.');
    expect(workspaceSource).toContain('"Elle eklenen yorumlar ile not yazılmış arama ve ziyaret kayıtları gösterilir."');
  });
});
