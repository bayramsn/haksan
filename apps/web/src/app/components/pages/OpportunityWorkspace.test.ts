import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// Saf modülden import: bileşenin .tsx grafiğini (Radix, lucide, sonner) çekmez.
import { isOpportunityTimelineActivity } from "../../lib/opportunityTimeline";

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
    // Denetim etiketleri saf `lib/opportunityAudit.ts` modülüne taşındı.
    expect(readFileSync(new URL("../../lib/opportunityAudit.ts", import.meta.url), "utf8"))
      .toContain('"opportunity.owner_changed": "Sorumlu değiştirildi"');
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

  it("fırsat zaman çizelgesini doğru kaynaktan besler", () => {
    expect(workspaceSource).toContain('opportunityActivities.filter(isOpportunityTimelineActivity)');
    // Sistem olaylarını (aşama geçişi, onay, teklif, dosya) yalnız sade fırsat
    // görünümü topluyor. Lead akışı Trello kart yorumları gibi yalnız
    // kullanıcının girdiği kayıtları gösterir.
    expect(workspaceSource).toContain('if (!simpleOpportunity) return items.sort');
    expect(workspaceSource).not.toContain('if (!isLead && !simpleOpportunity) return items.sort');
    expect(workspaceSource).toContain('Müşteri temasları ile salt okunur süreç, ticari belge ve onay olayları.');
    expect(workspaceSource).toContain('"Elle eklenen yorumlar ile detay yazılmış müşteri temasları gösterilir."');
  });
});

// Predicate'in kendisi saf ve export edilmiş; davranışını kaynak metni yerine
// doğrudan test ediyoruz. Önceki sürüm yalnız çağrı yerinde adının geçtiğini
// doğruluyordu, kuralın kendisi tamamen korumasızdı.
describe("isOpportunityTimelineActivity", () => {
  const manual = (extra: Record<string, unknown>) =>
    ({ type: "", origin: "manual" as const, ...extra });

  it("elle eklenen yorumu detay olmasa da gösterir", () => {
    expect(isOpportunityTimelineActivity(manual({ typeCode: "note" }))).toBe(true);
    expect(isOpportunityTimelineActivity({ type: "Yorum", origin: "manual" })).toBe(true);
    expect(isOpportunityTimelineActivity({ type: "Not", origin: "manual" })).toBe(true);
  });

  it("sistem kaynaklı kayıtları detay yazılmış olsa da gizler", () => {
    expect(isOpportunityTimelineActivity({ type: "", typeCode: "outgoing_call", origin: "system", note: "otomatik" })).toBe(false);
  });

  it("detay yazılmış her müşteri temasını gösterir", () => {
    for (const typeCode of ["outgoing_call", "customer_visit", "incoming_call", "online_meeting", "showroom_meeting", "email"]) {
      expect(isOpportunityTimelineActivity(manual({ typeCode, note: "görüşüldü" })), typeCode).toBe(true);
    }
  });

  it("detayı olmayan temas kaydını gizler", () => {
    expect(isOpportunityTimelineActivity(manual({ typeCode: "outgoing_call" }))).toBe(false);
    expect(isOpportunityTimelineActivity(manual({ typeCode: "online_meeting", note: "   ", result: "  " }))).toBe(false);
  });

  it("detay yalnız sonuç alanında yazılmışsa da gösterir", () => {
    expect(isOpportunityTimelineActivity(manual({ typeCode: "customer_visit", result: "teklif istendi" }))).toBe(true);
  });
});
