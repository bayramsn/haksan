import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ProcessChecklistPanel.tsx", import.meta.url), "utf8");
const centerSource = readFileSync(new URL("./OpportunityProcessCenter.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("./SalesCaseDetail.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("./OpportunityWorkspace.tsx", import.meta.url), "utf8");
const createDialogsSource = readFileSync(new URL("../dialogs/CreateDialogs.tsx", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../../lib/store.tsx", import.meta.url), "utf8");

describe("ProcessChecklistPanel teklif adımı", () => {
  it("B sürecindeki teklif kontrolünü doğrudan mevcut teklif penceresine bağlar", () => {
    expect(source).toContain('quote: "Teklif oluştur"');
    expect(source).toContain("onAction?.(check.actionKey)");
    expect(source).not.toContain('case "quote":');
    expect(detailSource).toContain("<QuoteDialog");
    expect(detailSource).toContain('open={requestedProcessAction === "create_quote"}');
  });

  it("firma ve teklif oluşturma yetkisini doğrular", () => {
    expect(detailSource).toContain('actionKey === "create_quote"');
    expect(detailSource).toContain('hasPermission("quotes.create")');
    expect(source).toContain("canPerformAction?.(check.actionKey)");
  });

  it("oluşturulan teklifleri B alanındaki tamamlanmış adımın içinde gösterir", () => {
    expect(source).toContain('check.key === "quote" && opportunityOffers.length > 0');
    expect(source).toContain("<OpportunityQuoteList offers={opportunityOffers} onOpenOffer={onOpenOffer} />");
    expect(detailSource).toContain("offers={offs}");
    expect(detailSource).toContain("onOpenOffer={setSelectedOfferId}");
  });
});

describe("ProcessChecklistPanel firma ve kontak çözümleme", () => {
  it("firma detayını eski kimlik için on-demand yükler", () => {
    expect(source).toContain("useCompanyDetail(sc.customerId)");
    expect(source).not.toContain("customers.find");
  });

  it("kontak seçimini store anlık görüntüsü yerine remote aramayla yapar", () => {
    expect(source).toContain("<RemoteContactCombobox");
    expect(source).toContain("companyId={sc.customerId}");
    expect(source).toContain("value={sc.primaryContactId ?? \"\"}");
    expect(source).not.toContain("contacts.filter");
  });

  it("C aşamasında il ve ilçeyi Türkiye listelerinden seçtirir", () => {
    expect(source).toContain('import { districtsForCountry, provincesForCountry } from "../../lib/geoByCountry"');
    expect(source).toContain('provincesForCountry("Türkiye")');
    expect(source).toContain('districtsForCountry("Türkiye", draft)');
    expect(source).toContain('placeholder="İl seçin"');
    expect(source).toContain('placeholder={draft ? "İlçe seçin" : "Önce il seçin"}');
    expect(source).toContain('setDraft2("")');
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
    expect(centerSource).toContain("checklist?: (context: {");
    expect(centerSource).toContain("{checklist?.({");
    // Bağ üst bileşende kurulmalı, yoksa engel düğmeleri sessizce çalışmaz olur.
    expect(detailSource).toContain("checklist={");
    expect(detailSource).toContain("requestedAction={requestedProcessAction}");
  });

  it("formları sayfada sürekli açık tutmak yerine operasyon düğmesinden dialog içinde açar", () => {
    expect(source).toContain("aria-haspopup={hasInlineEditor || (check.actionKey && DIALOG_ACTION_KEYS.has(check.actionKey))");
    expect(source).toContain("onClick={() => handleCheckOpen(check)}");
    expect(source).toContain("setActiveCheckKey(key)");
    expect(source).toContain('<DialogContent className="max-w-xl">');
    expect(source).toContain("<CheckEditor");
    expect(source).not.toContain("editingKeys");
    expect(source).not.toContain('id={`process-check-${check.key}`}');
  });

  it("teklif gibi kendi penceresi olan ticari adımları ikinci bir dialog içine sarmaz", () => {
    expect(source).toContain("INLINE_EDITOR_CHECK_KEYS.has(check.key)");
    expect(source).toContain("onAction?.(check.actionKey)");
    expect(source).toContain("check.actionKey ?? CHECK_ACTION_BY_KEY[check.key]");
    const inlineEditors = source.slice(
      source.indexOf("const INLINE_EDITOR_CHECK_KEYS"),
      source.indexOf("const CHECK_ACTION_LABELS"),
    );
    expect(inlineEditors).not.toContain('"quote"');
    expect(inlineEditors).not.toContain('"installation"');
  });

  it("üstteki hızlı işlem isteğini ilgili operasyon penceresine yönlendirir", () => {
    expect(source).toContain("OPPORTUNITY_CHECK_BY_ACTION[requestedAction]");
    expect(source).toContain("setActiveCheckKey(key)");
    expect(source).toContain("onActionHandled?.()");
    // Modal açılırken sayfa görev listesine atlamamalı.
    expect(detailSource).not.toContain('getElementById("opportunity-process-actions")');
  });

  it("kaydetmeden sonra hem store'u hem kutunun hazırlık verisini tazeler", () => {
    // Panel ile kutu modern `processReadiness` listesini kullanıyor; store
    // özeti eski ekranların fallback'i. Tazeleme tek tek düzenleyicilere
    // bırakılınca bazıları tazeliyor bazıları tazelemiyordu ve kullanıcıya
    // "yapılan görev kabul edilmedi" diye görünen hata oluşuyordu.
    // Kutunun tazelemesi ortak `run()` sarmalayıcısında, tek yerde olmalı.
    expect(source).toContain("await onSaved?.();");
    // Store tarafı: `run()` içinde ikinci bir tam çekim yapılmıyor; `updateCase`
    // sunucudan dönen kaydı doğrudan store'a yazıyor, diğer iki eylem kendi
    // içinde tazeliyor. Buraya `refresh()` geri eklenirse her görev kaydı iki
    // tam store çekimi (20+ liste x2) yapar ve düğme saniyelerce kilitlenir.
    expect(source).not.toContain("await refresh();");
    expect(storeSource).toContain("const saved = await opportunityService.update(id, body);");
    expect(storeSource).toContain("setCases(patchList);");
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
    // Workspace içindeki "Görevlere git" kısayolları bu id'yi arıyor. Detay
    // ekranındaki doğrudan adım eylemleri ise modal açtığı için kaydırmamalı.
    expect(centerSource).toContain('id="opportunity-process-actions"');
    expect(source).not.toContain("PROCESS_ACTIONS_ANCHOR_ID");
    expect(workspaceSource).toContain('getElementById("opportunity-process-actions")');
    expect(detailSource).not.toContain('getElementById("opportunity-process-actions")');
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
    expect(source).toContain("disabled={readOnly || !canUpdate || busyKey !== null}");
  });
});

describe("ProcessChecklistPanel B aşaması aktiviteleri", () => {
  it("aramayı isteğe bağlı notla tiklenebilir aktivite olarak kaydeder", () => {
    expect(source).toContain('import { Checkbox } from "../ui/checkbox"');
    expect(source).toContain('hasPermission("activities.create")');
    expect(source).toContain('activityTypeCode: "outgoing_call"');
    expect(source).toContain("description: draft.trim() || undefined");
    expect(source).toContain("Not yazmak zorunlu değildir. Yazılan not Aktivite bölümünde görünür.");
    expect(source).toContain("props.canCreateActivity,");
  });

  it("ziyaret durumunu Yapılmadı ve Yapıldı seçenekli listeden kaydeder", () => {
    expect(source).toContain("const visitStatusCheck = () =>");
    expect(source).toContain('<SelectItem value="not_done">Yapılmadı</SelectItem>');
    expect(source).toContain('<SelectItem value="done">Yapıldı</SelectItem>');
    expect(source).toContain('activityTypeCode: "customer_visit"');
    expect(source).toContain("value={props.visitStatus}");
    expect(source).toContain('value !== "done" && value !== "not_done"');
    expect(source).toContain("result: OPPORTUNITY_VISIT_STATUS_RESULT[visitStatus]");
    expect(source).toContain('<SelectValue placeholder="Durum seçin" />');
    expect(source).toContain("Yapıldı veya Yapılmadı seçimi ziyaret kararını kaydeder ve adımı tamamlar.");
  });
});

describe("A+ fatura ve kurulum paralel kapanışı", () => {
  it("A+ onaylarını Yapıldı veya yorumlu Yapılmadı kararıyla kaydeder", () => {
    expect(source).toContain('setApprovalDecision("approved")');
    expect(source).toContain('setApprovalDecision("rejected")');
    expect(source).toContain('placeholder="Karar hakkında yorum yazın"');
    expect(source).toContain('approvalDecision === "rejected" && !approvalNote.trim()');
    expect(source).toContain('approvalDecision as "approved" | "rejected"');
    expect(source).toContain("Yapılmadı seçildiğinde yorum zorunludur ve adım tamamlanmış sayılmaz.");
  });

  it("fatura ile kurulumu sıralı bir ok yerine iki paralel WIN kapısı olarak gösterir", () => {
    expect(source).toContain("Ticari Fatura ∥ Kurulum paralel kapanış");
    expect(source).toContain('aria-label="WIN paralel kapanış koşulları"');
    expect(source).toContain("WIN için ticari fatura ve kurulum paralel takip edilir");
  });

  it("A+ alanından çıkmadan fırsata bağlı kurulum planı oluşturur", () => {
    expect(detailSource).toContain('sc.qualificationStage === "a_plus"');
    expect(detailSource).toContain('data-opportunity-installation-create="true"');
    expect(detailSource).toContain("defaultOpportunityId={sc.id}");
    expect(createDialogsSource).toContain("opportunityId: defaultOpportunityId");
    expect(createDialogsSource).toContain("quoteId: defaultQuoteId");
    expect(detailSource).not.toContain("Önce Kurulum operasyon adımına geçerek servis kaydını oluşturun.");
  });
});
