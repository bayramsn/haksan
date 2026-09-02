import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// Saf modülden import: bileşenin .tsx grafiğini (Radix, lucide, sonner) çekmez.
import { isOpportunityTimelineActivity } from "../../lib/opportunityTimeline";

describe("lead ve fırsat çalışma alanı sorumlu değişikliği", () => {
  const railSource = readFileSync(new URL("./LeadWorkspaceControls.tsx", import.meta.url), "utf8");
  const workspaceSource = readFileSync(new URL("./OpportunityWorkspace.tsx", import.meta.url), "utf8");
  const detailSource = readFileSync(new URL("./SalesCaseDetail.tsx", import.meta.url), "utf8");
  const taskSectionSource = readFileSync(new URL("./tasks/TaskRecordSection.tsx", import.meta.url), "utf8");
  const shellSource = readFileSync(new URL("../shared/KanbanDetailDialogShell.tsx", import.meta.url), "utf8");
  const recordWorkspaceSource = readFileSync(new URL("../shared/RecordWorkspace.tsx", import.meta.url), "utf8");
  const commercialRailSource = readFileSync(new URL("../shared/CommercialDocumentRail.tsx", import.meta.url), "utf8");
  const checklistSource = readFileSync(new URL("./ProcessChecklistPanel.tsx", import.meta.url), "utf8");
  const focusSource = readFileSync(new URL("../../lib/workspaceFocus.ts", import.meta.url), "utf8");

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

  it("takibe alma eylemini fırsat görevleri kartında gösterir", () => {
    expect(detailSource).toContain("taskActions={canFollowUp ? (");
    expect(workspaceSource).toContain("headerActions={taskActions}");
    expect(taskSectionSource).toContain("{headerActions}");
    // Sağ komut panelindeki eski kopya kaldırılmalı; eylem görev kartında tek
    // bir bağlam altında kalır.
    const otherActions = detailSource.slice(
      detailSource.indexOf("const workspaceOtherActions"),
      detailSource.indexOf("const content"),
    );
    expect(otherActions).not.toContain("Takibe al");
  });

  it("satış alanı kutusunu kapının dışında tutar, bölümleri duruma göre katlar", () => {
    // Kutu alan görevlerini ve TEK ilerletme düğmesini taşıyor; hiçbir kapağın
    // arkasında olamaz, yoksa kullanıcı ilerletme düğmesini hiç göremez.
    expect(workspaceSource).toContain("{renderProcessCenter ? renderProcessCenter({ detail, loading: detailLoading, reload: loadDetail }) : processCenter}");
    expect(workspaceSource).not.toContain("<WorkspaceSection\n      id=\"opportunity-process");
    // Katlanan bölümler duruma göre açılır: bakılacak bir şey varsa açık.
    expect(workspaceSource).toContain("useSectionOpen(hasFieldRecords || operationBlockers.length > 0, sc.id)");
    expect(taskSectionSource).toContain("useSectionOpen(open.length > 0, paramKey)");
    expect(commercialRailSource).toContain("open={chain.readyCount > 0}");
    expect(checklistSource).toContain("availableChecks.some((check) => !check.complete)");
    // Kancalar erken dönüşlerin üstünde çağrılmalı; altına inerse kanca sayısı
    // veri geldiğinde değişir ve React kaydı çökertir.
    // Satır başındaki biçim aranıyor: aynı metin açıklama satırlarında da geçiyor.
    expect(taskSectionSource.indexOf("const sectionOpen = useSectionOpen(")).toBeLessThan(taskSectionSource.indexOf("\n  if (!canRead) return null;"));
    expect(checklistSource.indexOf("const checksOpen = useSectionOpen(")).toBeLessThan(checklistSource.indexOf("\n  if (!readiness && !checksOverride) return null;"));
    // Üç aşamanın durumu kapak kapalıyken de okunur; sade/tam mod ayrımı yok.
    expect(workspaceSource).toContain('aria-label="Saha operasyonu özeti"');
    expect(workspaceSource).not.toContain("{simpleOpportunity && (() => {");
    // Eski etiketler geri gelirse ölü/çift düğmeler de geri gelmiş demektir.
    expect(workspaceSource).not.toContain("Tam süreç haritasını aç");
    expect(workspaceSource).not.toContain("Operasyon kartlarını aç");
  });

  it("kapalı bölüm de durumunu söyler ve derin bağlantı kapağı açar", () => {
    // Kapağın tek maliyeti "içeride ne var?" sorusu olmalı; bölüm kapalıyken
    // bile durumunu yazmazsa kullanıcı hepsini tek tek açmak zorunda kalır.
    expect(recordWorkspaceSource).toContain("status && <div className=\"mt-0.5 truncate text-xs text-muted-foreground\">{status}</div>");
    expect(workspaceSource).toContain("const fieldStatusLine = hasFieldRecords");
    expect(taskSectionSource).toContain("`${open.length} açık görev`");
    // Bölüm bir kez açıldıysa son görev/engel bitince altından kapanmaz.
    expect(recordWorkspaceSource).toContain("export function useSectionOpen");
    expect(commercialRailSource).toContain("`${chain.readyCount}/4 hazır`");
    expect(checklistSource).toContain("{completedCount}/{checks.length} tamamlandı");
    // Engel düğmeleri, "Engelleri çöz" ve aktivite derin bağlantıları kapalı
    // bölümdeki hedeflere gidiyor; kapak açılmazsa boş başlığa iniyorlar.
    expect(focusSource).toContain("function openCollapsedAncestors");
    expect(focusSource).toContain("openCollapsedAncestors(target);");
  });

  it("aynı bilgiyi ikinci kez basan yüzeyleri geri getirmez", () => {
    // Karar özetinin iki varyantı vardı; `default` olan aynı üç bilgiyi iki
    // katı yükseklikte gösterip satış alanı kutusunu ekran dışına itiyordu.
    expect(recordWorkspaceSource).not.toContain('variant?: "default" | "compact"');
    expect(recordWorkspaceSource).not.toContain("Sıradaki iş ve risk");
    expect(workspaceSource).not.toContain('variant={simpleOpportunity ? "compact" : "default"}');
    // Geçiş engelleri ait olduğu eksenin (operasyon) içinde tek yerde durur;
    // kendi başına bir kart olarak ikinci kez çizilmez.
    expect(workspaceSource).toContain("const operationBlockers = nextOperationTarget?.blockers ?? [];");
    expect(workspaceSource).not.toContain('<Card className="overflow-hidden border-primary/15">');
    // Dialogda gizlenip yine de çizilen iki ağır alt ağaç geri gelmemeli.
    expect(detailSource).toContain("right={null}");
    expect(detailSource).toContain('aside={mode === "dialog" ? null : (');
  });

  it("ray ile mobil işlemler sayfasını tek tanımdan besler", () => {
    // İki yüzey ayrı yazıldığı sürece ayrışıyordu: "Tahmini kapanış" tarihi
    // yalnız mobil sayfaya yazılmıştı, masaüstünde alanın hiçbir düzenleyicisi
    // yoktu. Ray artık aynı `actionContents` bloğunu basıyor.
    const railBlock = railSource.slice(railSource.indexOf("  const rail = ("), railSource.indexOf("  const mobileDock = ("));
    expect(railBlock).toContain("{actionContents}");
    expect(railSource).toContain("<div className=\"px-4 pb-4\">{actionContents}</div>");
    // Tek düzenleyici; ikinci bir kopya eklenirse iki alan birbirini ezer.
    expect(railSource.match(/aria-label="Tahmini kapanış tarihi"/g)).toHaveLength(1);
    expect(railSource.match(/>Ana kontak</g)).toHaveLength(1);
    // Aksiyon planlama düğmesi tek yerden yönetiliyor: karar özeti aynı
    // dialogu basıyorsa ray basmaz, "Engelleri çöz" ya da lead dönüşümü
    // basıyorsa (planlamayan komutlar) rayınki tek kapı olarak kalır.
    expect(railSource).toContain("{canUpdate && !simpleMode && showPlanAction && (");
    expect(workspaceSource).toContain("const planActionCovered = !useLeadConversionAsPrimary && decisionPrimary?.plansAction === true;");
    expect(workspaceSource).toContain("showPlanAction={!planActionCovered}");
    // Rayın kendi yedek aksiyon dialogu kalkmalı; yoksa kapanmış kartta iki
    // kopya çıkar.
    expect(railSource).not.toContain("primaryAction ?? (!isLead && canUpdate ? (");
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

  it("aktivite akışını Trello benzeri hızlı girişle yan panele verir", () => {
    // Sekmeler kaldırıldıktan sonra akışın tek yeri kalıcı yan panel; buraya
    // geçirilmezse aktivite arayüzden tamamen kaybolur.
    expect(workspaceSource).toContain("activityFeed={activityFeed}");
    // Fırsat akışı da lead gibi TAM aktivite girişi alır: `commentOnly` geri
    // gelirse tür seçimi (ziyaret, arama, toplantı...) kaybolur ve kullanıcı
    // yeniden yalnız yorum yazabilir.
    expect(workspaceSource).not.toContain("commentOnly=");
    expect(workspaceSource).toContain('"Aktivite gir…"');
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
