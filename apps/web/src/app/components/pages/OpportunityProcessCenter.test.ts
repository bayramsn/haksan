import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./OpportunityProcessCenter.tsx", import.meta.url), "utf8");
const checklistSource = readFileSync(new URL("./ProcessChecklistPanel.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("./SalesCaseDetail.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("./OpportunityWorkspace.tsx", import.meta.url), "utf8");

describe("OpportunityProcessCenter tek kutu sözleşmesi", () => {
  it("yalnız kartın şu anki satış alanını ve bir sonraki alanı okur", () => {
    expect(source).toContain("readiness?.currentQualificationStage");
    // Sıradaki alan = doğrusal sıradaki ilk "forward" nitelik hedefi.
    expect(source).toContain('target.axis === "qualification" && target.direction === "forward"');
  });

  it("operasyon akordeonunu ve sekmeli hedef seçim panelini içermez", () => {
    // Kutuda alan rayı VAR ama yalnız gezinme için (bkz. gezinme testi).
    // Kaldırılan şey sekmeli hedef seçim paneli + operasyon akordeonuydu:
    // onlar kutudan doğrudan alan DEĞİŞTİRMEYE (atlamalı geçişe) izin veriyordu.
    expect(source).not.toContain("renderSelectedTargetPanel");
    expect(source).not.toContain("data-selected-target-panel");
    expect(source).not.toContain("renderOperationGroups");
    expect(source).not.toContain("OPERATION_GROUPS");
    expect(source).not.toContain('role="tablist"');
    expect(source).not.toContain('role="tabpanel"');
    expect(source).not.toContain("process-target-");
  });

  it("operasyon eksenini ve alan→operasyon eşlemesini hiç kullanmaz", () => {
    expect(source).not.toContain("opportunityProcessGroups");
    expect(source).not.toContain("OPPORTUNITY_OPERATION_GROUP_STEPS");
    expect(source).not.toContain("operationGroupForStage");
    expect(source).not.toContain('axis === "operation"');
    expect(source).not.toContain("salesStageLabel");
  });

  it("alanlar arasında GEZİNMEYE izin verir ama geri GEÇİŞ yolunu açmaz", () => {
    // Ray'dan geçmiş bir alana bakmak ve görevlerini düzeltmek serbest;
    // kartı o alana geri TAŞIMAK değil. `direction === "backward"` yalnız
    // "bu alan tamamlandı" işaretinde kullanılır — geçiş çağrısında değil.
    expect(source).toContain("setSelectedStage");
    expect(source).not.toContain("requiresReason");
    expect(source).not.toContain("invalidatedApprovals");
    expect(source).not.toContain("opportunityService.changeStage");
    // İlerletme hâlâ tek adım ileri ve yalnız engeller temizken.
    expect(source).toContain('target.direction === "forward"');
    expect(source).toContain("!canUpdate || advancing || !nextTarget || closed || blockers.length > 0");
  });

  it("ileri alanları yalnız önizleme olarak gösterir", () => {
    // Sırası gelmemiş bir alanın görevini doldurmak sırayı atlamak olurdu.
    expect(source).toContain('viewedDirection === "forward"');
    expect(source).toContain("readOnly: viewedIsFuture");
  });
});

describe("OpportunityProcessCenter davranış eşdeğerliği", () => {
  it("eksik gereklilikleri ikinci kez kartlaştırmaz; tek kompakt görev listesine bırakır", () => {
    expect(source).toContain("blockers.length === 0");
    expect(source).not.toContain("onAction(blocker.actionKey)");
    expect(source).not.toContain("process-blocker-");
    expect(checklistSource).toContain("aria-haspopup={hasInlineEditor || (check.actionKey && DIALOG_ACTION_KEYS.has(check.actionKey))");
  });

  it("ilerletmeyi yalnız bütün gereklilikler tamamken ve ileri yönde açar", () => {
    expect(source).toContain("!canUpdate || advancing || !nextTarget || closed || blockers.length > 0");
    expect(source).toContain("opportunityService.changeQualificationStage");
    expect(source).toContain("await onRefresh()");
    expect(source).toContain("await load()");
  });

  it("Lead ilerletmesini genel derece PATCH'i yerine dönüştürme akışına yönlendirir", () => {
    expect(source).toContain('currentStage === "lead"');
    expect(source).toContain('[data-workspace-primary="convert"]');
  });

  it("durum değişimini kalıcı canlı bölgeden duyurur", () => {
    // Kaldırılan tablist'in canlı bölgesi de gitti; tek kutuda durum
    // değişimi ekran okuyucuya duyurulmaya devam etmeli. Bölge kart kökünde
    // ve KALICI: AT'ler yalnız var olan bölgenin sonraki değişimlerini okur.
    expect(source).toContain('<div aria-live="polite" className="sr-only">{liveAnnouncement}</div>');
    expect(source).toContain("Şu anki satış alanı:");
  });

  it("canlı bölgeyi yükleme ve veri yok dallarında da DOM'da tutar", () => {
    // Bölge içerikle BİRLİKTE eklenirse ilk durum duyurulmaz. Bu yüzden metin
    // erken dönüşlerin üstünde hesaplanır ve her dal bölgeyi render eder.
    expect(source.indexOf("const liveAnnouncement")).toBeLessThan(
      source.indexOf("if (loading && !readiness)"),
    );
    expect(source).toContain('if (!readiness) return "";');
    expect(source).toContain("if (!readiness) return liveRegion;");
    // Yükleme dalı da bölgeyi taşımalı; yoksa hazırlık geldiğinde bölge
    // "yeni eklenmiş" olur ve ilk alan duyurusu sessizce kaçar.
    const loadingBranch = source.slice(
      source.indexOf("if (loading && !readiness)"),
      source.indexOf("if (!readiness) return liveRegion;"),
    );
    expect(loadingBranch).toContain("{liveRegion}");
  });
});

describe("OpportunityProcessCenter tek ilerletme düğmesi", () => {
  it("ilerletmeyi yalnız kutu yürütür; görev listesinde ikinci düğme kalmaz", () => {
    // İki düğme vardı: biri kutuda, biri görev listesinde. Liste düğmesi kapalı
    // kartı ve sunucunun ürettiği engelleri bilmiyordu; tek düğme kutuda kaldı.
    expect(source).toContain("opportunityService.changeQualificationStage");
    expect(checklistSource).not.toContain("moveQualification");
    expect(checklistSource).not.toContain("opportunityTransitionErrorMessage");
    expect(checklistSource).not.toContain("İlerletiliyor…");
    expect(checklistSource).not.toContain("alanına geç`");
    expect(checklistSource).not.toContain("Fırsata dönüştür");
  });

  it("kalan düğme kapalı kartı ve engelleri kontrol eder", () => {
    expect(source).toContain("const advanceDisabled = !canUpdate || advancing || closed || blockers.length > 0");
    expect(source).toContain("disabled={advanceDisabled}");
  });
});

describe("OpportunityProcessCenter alan görev listesiyle ilişkisi", () => {
  it("alan görevlerini kendi gövdesinde render eder", () => {
    // Görevler kutunun İÇERİĞİ: prop olarak gelir, doğrudan burada render
    // edilir. Portal ve modül düzeyinde yuva kaydı kaldırıldı — geri gelmesi
    // eski kırılgan tasarıma dönüş demektir.
    expect(source).toContain("checklist?: (context: {");
    expect(source).toContain("checks?: ProcessCheck[];");
    // Render prop: kutu kendi tazelemesini panele veriyor, böylece görev
    // kaydedilince kutunun engelleri de güncelleniyor.
    expect(source).toContain("{checklist?.({");
    expect(source).not.toContain("checklistSlots");
    expect(source).not.toContain("publishChecklistSlot");
    expect(source).not.toContain("checklistSlotRef");
    // Görev listesi boşken kapsayıcı ne çerçeve ne boşluk bırakmalı.
    expect(source).toContain("empty:hidden");
    // "Görevlere git" kaydırmasının indiği çapa görev kapsayıcısında.
    expect(source).toContain('id="opportunity-process-actions"');
  });

  it("paneli kendisi mount etmez; üst bileşenin prop bağını korur", () => {
    // Kutu paneli kendi import edip mount etseydi `requestedAction`/
    // `onActionHandled` bağı kopar, dışarıdaki operasyon kısayolları sessizce
    // hiçbir şey yapmazdı. Element üst bileşende yaratılır, burada render edilir.
    expect(source).not.toContain('from "./ProcessChecklistPanel"');
    expect(source).not.toContain("<ProcessChecklistPanel");
    // Görevler kutunun dışında ikinci bir sarmalayıcıda durmamalı.
    expect(workspaceSource).not.toContain("processChecklist");
  });

  it("süreç merkezinin render edildiği her yolda görev listesini de mount eder", () => {
    // Dışarıdaki operasyon kısayolları `requestedProcessAction`'a yazar; onu
    // tüketen liste mount değilse istek sessizce kaybolur.
    const checklistMounts = detailSource.match(/<ProcessChecklistPanel/g)?.length ?? 0;
    const centerMounts = detailSource.match(/<OpportunityProcessCenter/g)?.length ?? 0;
    expect(checklistMounts).toBeGreaterThanOrEqual(1);
    expect(checklistMounts).toBeGreaterThanOrEqual(centerMounts);
    expect(detailSource).toContain("requestedAction={requestedProcessAction}");
  });

  it("SalesCaseDetail'in beklediği prop sözleşmesini korur", () => {
    expect(source).toContain("onRefresh: () => Promise<unknown>");
    expect(source).toContain("detail?: OpportunityProcessDetail | null");
    expect(source).toContain("onReload?: () => Promise<void>");
  });

  it("mevcut alanı da legacy store özeti yerine modern processReadiness kontrolleriyle besler", () => {
    expect(source).toContain('checks: checksByStage.get(viewedStage ?? "") ?? []');
    expect(source).not.toContain("checks: viewedIsCurrent ? undefined");
    expect(checklistSource).toContain("const availableChecks = checksOverride ?? readiness?.checks ?? []");
    expect(checklistSource).toContain("activeCheckKey\n    ? availableChecks.find");
  });

  it("A+ alanında ticari fatura ve kurulumu paralel WIN kapıları olarak birlikte gösterir", () => {
    expect(checklistSource).toContain('aria-label="WIN paralel kapanış koşulları"');
    expect(checklistSource).toContain("WIN için ticari fatura ve kurulum paralel takip edilir");
    expect(checklistSource).toContain('check.key === "commercial_invoice_file"');
    expect(checklistSource).toContain('check.key === "installation_completed"');
  });
});
