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

  it("satış alanı kutusunu kapının dışında tutar, yalnız operasyon kartlarını kapatır", () => {
    // Kutu alan görevlerini ve TEK ilerletme düğmesini taşıyor. İsteğe bağlı
    // olursa sade modda hiç mount olmaz (kapı `!simpleOpportunity` ile kapalı
    // başlıyor) ve kullanıcı ilerletme düğmesini hiçbir yerde göremez.
    // İsteğe bağlı olan operasyon kartları; kutu değil.
    expect(workspaceSource).toContain("useState(() => !simpleOpportunity)");
    expect(workspaceSource).toContain("setOperationsExpanded(!simpleOpportunity)");
    expect(workspaceSource).toContain("{operationsExpanded && !simpleOpportunity && <div");
    // Sade modda düğmenin açacağı bir şey kalmadığı için gizlendi; eski
    // etiketler geri gelirse ölü düğme de geri gelmiş demektir.
    expect(workspaceSource).not.toContain("Tam süreç haritasını aç");
    expect(workspaceSource).toContain("Operasyon kartlarını kapat");
  });

  it("fırsat zaman çizelgesini doğru kaynaktan besler", () => {
    expect(workspaceSource).toContain('opportunityActivities.filter(isOpportunityTimelineActivity)');
    // Sistem olaylarını (aşama geçişi, onay, teklif, dosya) yalnız sade fırsat
    // görünümü topluyor. Lead akışı Trello kart yorumları gibi yalnız
    // kullanıcının girdiği kayıtları gösterir.
    // Aktivite akışı yalnız kullanıcının girdiği kayıtlar; sistem olayları
    // (aşama, nitelik, onay, teklif, ödeme, dosya) ayrı bir listede toplanır.
    // Tek akışta karıştıklarında temaslar sistem gürültüsünde kayboluyordu.
    expect(workspaceSource).toContain("const processTimeline = useMemo<TimelineItem[]>");
    expect(workspaceSource).toContain("if (!simpleOpportunity) return items;");
    // Aktivite memo'su sistem olaylarını toplamamalı.
    expect(workspaceSource).not.toContain('if (!isLead && !simpleOpportunity) return items.sort');
  });

  it("süreç bildirimlerini akışın altında ayrı bir alanda gösterir", () => {
    // Kullanıcı süreç geçmişini görmek isteyebilir ama akışın içinde değil:
    // kendi küçük alanında, kapalı başlayarak.
    expect(workspaceSource).toContain("Süreçler · {processTimeline.length}");
    expect(workspaceSource).toContain("{processTimeline.length > 0 && (");
    expect(workspaceSource).toContain("items={processTimeline.map(");
  });

  it("aktivite akışını Trello benzeri hızlı girişle yan panele verir", () => {
    // Sekmeler kaldırıldıktan sonra akışın tek yeri kalıcı yan panel; buraya
    // geçirilmezse aktivite arayüzden tamamen kaybolur.
    expect(workspaceSource).toContain("activityFeed={activityFeed}");
    // Fırsatta giriş yorum kutusu (Trello kart yorumu), lead'de tam aktivite
    // kaydı. Bu ayrım kalkarsa fırsatta gereksiz tip/tarih alanları geri gelir.
    expect(workspaceSource).toContain("commentOnly={!isLead}");
    expect(workspaceSource).toContain("Bu fırsat için henüz aktivite veya yorum yok.");
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
