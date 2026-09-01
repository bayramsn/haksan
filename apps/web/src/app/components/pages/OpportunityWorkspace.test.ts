import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// Saf modülden import: bileşenin .tsx grafiğini (Radix, lucide, sonner) çekmez.
import { isOpportunityTimelineActivity } from "../../lib/opportunityTimeline";

describe("lead ve fırsat çalışma alanı sorumlu değişikliği", () => {
  const railSource = readFileSync(new URL("./LeadWorkspaceControls.tsx", import.meta.url), "utf8");
  const workspaceSource = readFileSync(new URL("./OpportunityWorkspace.tsx", import.meta.url), "utf8");
  const detailSource = readFileSync(new URL("./SalesCaseDetail.tsx", import.meta.url), "utf8");
  const shellSource = readFileSync(new URL("../shared/KanbanDetailDialogShell.tsx", import.meta.url), "utf8");
  const storeSource = readFileSync(new URL("../../lib/store.tsx", import.meta.url), "utf8");
  const dialogsSource = readFileSync(new URL("../dialogs/CreateDialogs.tsx", import.meta.url), "utf8");

  it("nitelendirme formunu yalnız başka bir karta geçilince sunucu değeriyle ezer", () => {
    // Bağımlılık `salesCase` nesnesiyken store'un her tazelemesi yeni referans
    // üretiyor, efekt de kullanıcının o an yazdığı metni siliyordu: girilen
    // bilgi kaybolup "kaydet" eski değeri gönderiyordu.
    expect(railSource).toContain("}, [salesCase.id]);");
    expect(railSource).not.toContain("}, [salesCase]);");
  });

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

  it("firma ve primary kontağı store kataloglarından bağımsız hydrate eder", () => {
    expect(workspaceSource).toContain("useCompanyDetail(sc.customerId)");
    expect(workspaceSource).toContain("loadAllCompanyContacts(sc.customerId as string, signal)");
    expect(workspaceSource).toContain("useRemoteContactDetail(sc.primaryContactId)");
    expect(workspaceSource).toContain("contactQueryKeys.companyContacts(contactScope");
    expect(workspaceSource).toContain('tenantId: user?.tenantId ?? "anonymous"');
    expect(workspaceSource).toContain('userId: user?.id ?? "anonymous"');
    expect(workspaceSource).not.toContain("customers.find");
    expect(workspaceSource).not.toContain("contacts.filter");
  });

  it("süreç bildirimlerini akışın altında ayrı bir alanda gösterir", () => {
    // Kullanıcı süreç geçmişini görmek isteyebilir ama akışın içinde değil:
    // kendi küçük alanında, kapalı başlayarak.
    expect(workspaceSource).toContain("Süreçler · {processTimeline.length}");
    expect(workspaceSource).toContain("{processTimeline.length > 0 && (");
    expect(workspaceSource).toContain("items={processTimeline.map(");
  });

  it("aktivite girişini üst karar aksiyonuna taşır ve akışı tek kopya tutar", () => {
    // Sekmeler kaldırıldıktan sonra akışın tek yeri kalıcı yan panel; buraya
    // geçirilmezse aktivite arayüzden tamamen kaybolur.
    expect(workspaceSource).toContain("activityFeed={activityFeed}");
    // Tam aktivite formu üstteki eski aksiyon planlama yuvasındadır; akışın
    // içinde ikinci bir ekleme düğmesi oluşmaz.
    expect(workspaceSource).not.toContain("commentOnly=");
    expect(workspaceSource).toContain("const decisionPrimaryAction");
    expect(workspaceSource).toContain("Aktivite Ekle</Button>");
    expect(workspaceSource.match(/<AddActivityDialog/g)).toHaveLength(1);
    expect(workspaceSource).not.toContain("<NextActionDialog");
    expect(workspaceSource).toContain("Bu fırsat için henüz aktivite veya yorum yok.");
  });

  it("aktivitede seçilen kişiyi ileri tarihli görev sorumlusu olarak API'ye taşır", () => {
    expect(storeSource).toContain("assignedToUserId: a.byUserId || undefined");
    expect(dialogsSource).toContain("İleri tarihli aktiviteler seçilen kişiye görev olarak atanır.");
  });

  it("aktivite sorumlusu listesini izinle daraltılmış genel kullanıcı store'u yerine fırsat atama listesinden alır", () => {
    expect(dialogsSource).toContain("opportunityService\n      .assignees()");
    expect(dialogsSource).toContain("assignableActivityUsers.map");
    expect(dialogsSource).not.toContain("{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}");
  });

  it("mevcut fırsat açıklamasını en üstte okunabilir ve düzenlenebilir tutar", () => {
    expect(workspaceSource).toContain('data-testid="opportunity-summary-card"');
    expect(workspaceSource).toContain("Fırsat Açıklaması");
    expect(workspaceSource).toContain('updateCase(sc.id, { description: summaryDraft.trim() || null })');
    expect(workspaceSource).toContain("Açıklamayı Kaydet");
    const descriptionIndex = workspaceSource.indexOf('<Card className="border-primary/15" data-testid="opportunity-summary-card">');
    const sharedViewIndex = workspaceSource.indexOf("Ortak fırsat görünümü");
    const decisionIndex = workspaceSource.indexOf("<WorkspaceDecisionSummary");
    expect(descriptionIndex).toBeGreaterThan(-1);
    expect(descriptionIndex).toBeLessThan(sharedViewIndex);
    expect(descriptionIndex).toBeLessThan(decisionIndex);
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
