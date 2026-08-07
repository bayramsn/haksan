import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ProcessChecklistPanel.tsx", import.meta.url), "utf8");
const centerSource = readFileSync(new URL("./OpportunityProcessCenter.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("./SalesCaseDetail.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("./OpportunityWorkspace.tsx", import.meta.url), "utf8");

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

describe("ProcessChecklistPanel satış alanı kutusunun içeriği", () => {
  it("kutuya prop olarak geçer; portal ve yuva kaydı kullanmaz", () => {
    // Element üst bileşende yaratılıp kutuya prop olarak veriliyor: engel
    // düğmelerinin `requestedAction` bağı orada kurulduğu için korunuyor, ama
    // render kutuda. Portal'a, modül düzeyinde yuva Map'ine ve gizlenen
    // sarmalayıcıya gerek yok — bunların geri gelmesi eski kırılgan tasarımdır.
    expect(source).not.toContain("createPortal");
    expect(source).not.toContain("useSyncExternalStore");
    expect(source).not.toContain("getChecklistSlot");
    expect(centerSource).not.toContain("checklistSlots");
    expect(centerSource).not.toContain("publishChecklistSlot");
    // Kutu görevleri kendi gövdesinde render eder.
    expect(centerSource).toContain("checklist?: (context: { reload: () => Promise<void> }) => ReactNode");
    expect(centerSource).toContain("{checklist?.({ reload: load })}");
    // Bağ üst bileşende kurulmalı, yoksa engel düğmeleri sessizce çalışmaz olur.
    expect(detailSource).toContain("checklist={");
    expect(detailSource).toContain("requestedAction={requestedProcessAction}");
  });

  it("kaydetmeden sonra hem store'u hem kutunun hazırlık verisini tazeler", () => {
    // Panel `sc.qualificationReadiness`'i (store), kutu kendi detay
    // çağrısındaki `processReadiness`'i okuyor. Tazeleme tek tek
    // düzenleyicilere bırakılınca bazıları tazeliyor bazıları tazelemiyordu ve
    // görev tikli görünürken kutu eski engeli göstermeye devam ediyordu —
    // kullanıcıya "yapılan görev kabul edilmedi" diye görünen hata buydu.
    // Tazeleme ortak `run()` sarmalayıcısında, tek yerde olmalı.
    expect(source).toContain("await refresh();");
    expect(source).toContain("await onSaved?.();");
    // Kutunun kendi tazelemesi panele bağlanmalı, yoksa yalnız store güncellenir.
    expect(detailSource).toContain("onSaved={reloadReadiness}");
  });

  it("görevleri ayrı bir bölüm gibi ikinci kez etiketlemez", () => {
    // Görevler kutunun kendi içeriği; ayrı bir "Alan görevleri" başlığı ve alan
    // rozeti tek kutuyu iki kez etiketlerdi. Kimliği kutunun başlığı söyler.
    expect(source).not.toContain("Alan görevleri");
    expect(source).not.toContain("QUALIFICATION_STAGE_LABELS[grade]} alanı");
    expect(centerSource).toContain("stageLabel(currentStage)");
    expect(centerSource).toContain("stageDescription(currentStage)");
    // İlerleme sayacı kalıyor: kaç görevin bittiği kutunun içinde görünmeli.
    expect(source).toContain("tamamlandı");
  });

  it("kaydırma çapası kutunun görev kapsayıcısında durur", () => {
    // "Görevlere git" bu id'yi arıyor. Çapa kutuya taşındı; panelde kalsaydı
    // kaydırma görevlerin dışına inerdi.
    expect(centerSource).toContain('id="opportunity-process-actions"');
    expect(source).not.toContain("PROCESS_ACTIONS_ANCHOR_ID");
    expect(workspaceSource).toContain('getElementById("opportunity-process-actions")');
    expect(detailSource).toContain('getElementById("opportunity-process-actions")');
  });
});

describe("ProcessChecklistPanel ilerletme güvenliği", () => {
  it("ikinci bir ilerletme yolu bırakmaz", () => {
    // Tek düğme kutuda. Buradaki düğme kapalı kartı ve sunucu engellerini
    // bilmediği için ikinci bir kapı açıyordu.
    expect(source).not.toContain("moveQualification");
    expect(source).not.toContain("advancing");
    expect(source).not.toContain('[data-workspace-primary="convert"]');
  });

  it("Lead dönüşümünü kutudaki düğme hâlâ derece PATCH'i yerine dönüşüm akışına yönlendirir", () => {
    // Güvence panelden kutuya taşındı; kaybolmadığı burada da doğrulanır.
    expect(centerSource).toContain('currentStage === "lead"');
    expect(centerSource).toContain('[data-workspace-primary="convert"]');
  });

  it("güncelleme yetkisi olmayan kullanıcı için kayıt işlemlerini kapatır", () => {
    expect(source).toContain('hasPermission("opportunities.update")');
    expect(source).toContain("if (!authorized || busyKey) return;");
    expect(source).toContain("disabled={!canUpdate || busyKey !== null}");
  });
});

describe("ProcessChecklistPanel B aşaması aktiviteleri", () => {
  it("arama ve ziyareti isteğe bağlı notla tiklenebilir aktivite olarak kaydeder", () => {
    expect(source).toContain('import { Checkbox } from "../ui/checkbox"');
    expect(source).toContain('hasPermission("activities.create")');
    expect(source).toContain('activityTypeCode: "outgoing_call"');
    expect(source).toContain('activityTypeCode: "customer_visit"');
    expect(source).toContain("description: draft.trim() || undefined");
    expect(source).toContain("Not yazmak zorunlu değildir. Yazılan not Aktivite bölümünde görünür.");
    expect(source).toContain("props.canCreateActivity,");
  });
});
