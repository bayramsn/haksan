import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";

// Every API request is fulfilled in memory. No CRM account, backend or seed
// database is used, including when testing saves and failure responses.
const opportunityId = "00000000-0000-4000-8000-000000000101";
const companyId = "00000000-0000-4000-8000-000000000102";
const userId = "00000000-0000-4000-8000-000000000103";
const divisionId = "00000000-0000-4000-8000-000000000104";
const companyName = "Örnek Makine Test Firması";
const initialDescription = "Müşteri iki CNC makinesi için teslim süresini ve teknik özellikleri görüşmek istiyor.";
const uploadedFileId = "00000000-0000-4000-8000-000000000105";
const uploadedFilename = "musteri-teknik-cizim.pdf";
const quoteNumber = "TEST-TEKLIF-001";
const paginated = (data: unknown[] = []) => ({ data, meta: { total: data.length, page: 1, pageSize: 200, totalPages: 1 } });

type FixtureOptions = {
  readOnly?: boolean;
  detailError?: boolean;
  qualificationStage?: "lead" | "b" | "lost";
  leadFollowUpStatus?: "new" | "disqualified";
  closed?: boolean;
  documents?: boolean;
};

async function mockOpportunityApi(page: Page, options: FixtureOptions = {}) {
  const mutations: Array<{ path: string; method: string; body: Record<string, unknown> }> = [];
  const unhandledMutations: string[] = [];
  const reads: string[] = [];
  const company = {
    id: companyId, legalTitle: companyName, shortName: companyName,
    companyType: "company", relationType: { code: "prospect", name: "Potansiyel" },
    customerStatus: { code: "potential", name: "Potansiyel" },
    primaryPhone: "02120000000", primaryEmail: "test@example.test",
    addresses: [], divisions: [{ id: divisionId, code: "CNC", name: "CNC" }],
    createdAt: "2026-09-01T10:00:00.000Z",
  };
  const qualificationStage = options.qualificationStage ?? "b";
  const blocker = options.documents
    ? { key: "machine", label: "İstenen makine belirlenmeli", complete: false, actionKey: "edit_machine", qualificationStage: "b" }
    : { key: "quote", label: "Teklif hazırlanmalı", complete: false, actionKey: "create_quote", qualificationStage: "b" };
  const checks = [blocker,
    ...(options.documents ? [{ key: "quote", label: "Teklif hazırlandı", complete: true, actionKey: "create_quote", qualificationStage: "b" }] : []),
    { key: "contract", label: "Sözleşme hazırlanmalı", complete: false, actionKey: "create_contract", qualificationStage: "a" },
  ];
  const opportunity = {
    id: opportunityId, companyId, company, divisionId, ownerUserId: userId,
    title: "İki CNC makinesi", description: initialDescription,
    requestedMachine: "Örnek CNC 850", qualificationStage,
    leadFollowUpStatus: options.leadFollowUpStatus ?? "new",
    stage: { code: qualificationStage === "lead" ? "lead" : qualificationStage === "lost" ? "cancelled" : "quote", name: "Teklif" }, estimatedValue: "85000", currency: { code: "EUR" },
    expectedCloseDate: "2099-10-01", closedAt: options.closed ? "2026-09-17T10:00:00.000Z" : null,
    lostReason: qualificationStage === "lost" ? { code: "other", name: "Diğer" } : null,
    lostUnmetConditions: qualificationStage === "lost" ? "Sentetik test: müşteri alımı erteledi." : null,
    probability: 50, createdAt: "2026-09-01T10:00:00.000Z", paymentMethod: "wire_transfer",
    paymentTerms: "Siparişte %30, teslimde %70", paymentTermDays: 30,
    nextAction: "Teslim süresini müşteriyle görüş", nextActionAt: "2099-09-20T09:00:00.000Z",
    products: [{ id: "machine-1", machineName: "Örnek CNC 850", quantity: 2 }],
    qualificationReadiness: { checks, blockers: [blocker], nextStage: qualificationStage === "lead" ? "c" : "a", health: { nextAction: "Teslim süresini müşteriyle görüş", nextActionAt: "2099-09-20T09:00:00.000Z", contactAttemptCount: 1 } },
  };
  const activities: Record<string, unknown>[] = [{
    id: "activity-1", opportunityId, companyId, type: { code: "note", name: "Not" }, origin: "manual",
    subject: "İlk görüşme", description: "Teknik özellikler paylaşıldı; müşteri teslim süresini soruyor.",
    activityDate: "2026-09-17T09:00:00.000Z", createdBy: userId,
  }];
  const permissions = [
    "opportunities.read", "companies.read", "contacts.read", "activities.read", "users.read",
    "tasks.read", "quotes.read", "products.read", "files.read", "contracts.read", "proformas.read",
    "payments.read", "shipments.read", "installations.read", "commercial_invoices.read",
    ...(!options.readOnly ? ["opportunities.update", "activities.create", "activities.update", "tasks.create", "quotes.create"] : []),
  ];
  const user = {
    id: userId, email: "popup@example.test", fullName: "Örnek Satış Sorumlusu", tenantId: "test-tenant",
    departmentId: null, roles: ["sales"], permissions, mfaEnabled: false,
    divisions: [{ id: divisionId, code: "CNC", name: "CNC", isPrimary: true }],
    departments: [], accessScopes: [], canViewAllDivisions: true,
  };
  let detailError = Boolean(options.detailError);
  let authenticated = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const method = request.method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/refresh") return authenticated
      ? json({ accessToken: "synthetic-popup-token", user })
      : json({ message: "Sentetik oturum yok" }, 401);
    if (path === "/auth/login") {
      authenticated = true;
      return json({ accessToken: "synthetic-popup-token", user });
    }
    if (path === "/auth/me") return json({ user, tenant: { id: "test-tenant", name: "Test CRM", slug: "test-crm" } });
    if (method !== "GET") {
      const body = request.postDataJSON() ?? {};
      mutations.push({ path, method, body });
      if (path === `/opportunities/${opportunityId}` && method === "PATCH") {
        Object.assign(opportunity, body);
        return json(opportunity);
      }
      if (path === "/activities" && method === "POST") {
        const activity = { ...body, id: `activity-${activities.length + 1}`, type: { code: body.activityTypeCode ?? "note", name: "Not" }, origin: "manual", createdBy: userId };
        activities.push(activity);
        return json(activity, 201);
      }
      if (path === "/files/signed-download-url" && method === "POST") {
        return json({ downloadUrl: new URL("/__test__/uploaded.pdf", request.url()).href, filename: uploadedFilename, mimeType: "application/pdf" });
      }
      unhandledMutations.push(`${method} ${path}`);
      return json({ message: "Bu işlem sentetik testte tanımlı değil" }, 400);
    }
    reads.push(path);
    if (path === "/opportunities") return json(paginated((url.searchParams.get("view") === "closed") === Boolean(options.closed) ? [opportunity] : []));
    if (path === "/opportunities/assignees") return json([{ id: userId, name: user.fullName, divisionIds: [divisionId] }]);
    if (path === `/opportunities/${opportunityId}`) {
      if (detailError) return json({ message: "Fırsat bilgileri şu anda yüklenemiyor." }, 503);
      return json({
        ...opportunity, history: [], qualificationHistory: [], approvals: [],
        processReadiness: {
          currentQualificationStage: qualificationStage, currentOperationStage: opportunity.stage.code, closed: Boolean(options.closed), checks,
          targets: ["lead", "c", "b", "a", "a_plus", "win"].map((code, index) => ({
            axis: "qualification", code, direction: index < (qualificationStage === "lead" ? 0 : 2) ? "backward" : code === qualificationStage ? "current" : "forward",
            selectable: true, canTransition: false, requiresReason: false,
            blockers: index > 2 ? [blocker] : [], invalidatedApprovals: [],
          })),
        },
      });
    }
    if (path === `/companies/${companyId}`) return json(company);
    if (path === "/companies") return json(paginated([company]));
    if (path === "/companies/summary") return json({ total: 1, byRelation: { prospect: 1 }, byStatus: { potential: 1 }, cities: [], sectors: [] });
    if (path === "/users") return json([{ ...user, roles: [{ code: "sales", name: "Satış" }], status: "active" }]);
    if (path === "/activities") return json(paginated(activities));
    if (path === "/quotes") return json(paginated(options.documents ? [{
      id: "quote-1", opportunityId, companyId, company, documentNo: quoteNumber, revisionNo: 1,
      quoteDate: "2026-09-17", grandTotal: "85000", currency: { code: "EUR" }, status: { code: "sent", name: "Gönderildi" },
    }] : []));
    if (path === "/files/links") return json(paginated(options.documents ? [{
      id: "file-link-1", entityType: "opportunity", entityId: opportunityId,
      documentType: { code: "other", name: "Diğer" },
      file: { id: uploadedFileId, originalFilename: uploadedFilename, mimeType: "application/pdf", sizeBytes: 1024, uploadedBy: userId, createdAt: "2026-09-17T10:00:00.000Z" },
    }] : []));
    if (path === "/tasks/assignees") return json([{ id: userId, fullName: user.fullName }]);
    if (path === "/tenant") return json({ id: "test-tenant", name: "Test CRM" });
    if (path.startsWith("/lookups/") || path.startsWith("/admin/lookups/") || path === "/note-templates") return json([]);
    return json(paginated([]));
  });
  // Realtime connections are not needed by this fixture either.
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.routeWebSocket("**/socket.io/**", (socket) => socket.close());
  await page.route("**/health/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok" }) }));
  await page.route("**/__test__/uploaded.pdf", (route) => route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\n1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj\n2 0 obj<</Type /Pages /Kids [] /Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF" }));
  return { mutations, unhandledMutations, reads, opportunity, recoverDetail: () => { detailError = false; } };
}

async function openPopup(page: Page, options: Parameters<typeof mockOpportunityApi>[1] = {}) {
  const fixture = await mockOpportunityApi(page, options);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => window.localStorage.setItem("haksan:onboarding:v1", "seen"));
  await page.goto("/");
  await page.getByTestId("login-identifier").fill("popup@example.test");
  await page.locator("#login-password").fill("synthetic-password");
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.getByRole("tab", { name: options.closed ? /^Geçmiş/ : "Liste", exact: !options.closed }).click();
  const row = page.locator("tbody tr").filter({ hasText: companyName });
  await row.hover();
  const opener = options.closed ? row : row.getByTitle("Detay", { exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: /^Fırsat çalışma alanı/ });
  await expect(dialog).toBeVisible();
  await expect.poll(() => fixture.reads.includes(`/opportunities/${opportunityId}`)).toBe(true);
  return { ...fixture, dialog, opener };
}

test("sentetik fırsat popup açılır; masaüstü ve mobil görünüm taşmaz", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { dialog, unhandledMutations, opener } = await openPopup(page);
  await expect(dialog.getByText(companyName, { exact: true }).first()).toBeVisible();
  await expect(dialog.getByTestId("workspace-decision-summary")).toBeVisible();
  // Açıklama iki yerde: başlıkta fiyatın altındaki kısa brifing ve gövdedeki
  // düzenlenebilir tam metin. İkisi de görünmeli.
  await expect(dialog.locator("[data-record-dialog-header]").getByText(initialDescription)).toBeVisible();
  await expect(dialog.getByTestId("opportunity-summary").getByText(initialDescription)).toBeVisible();
  await expect(dialog.getByTestId("workspace-decision-summary")).toBeFocused();
  const initialBounds = await dialog.boundingBox();
  await dialog.getByRole("button", { name: "Pencereyi büyüt", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Pencereyi küçült", exact: true })).toBeVisible();
  await expect.poll(async () => (await dialog.boundingBox())?.width ?? 0).toBeGreaterThan(initialBounds!.width);
  await dialog.getByRole("button", { name: "Pencereyi küçült", exact: true }).click();
  await expect.poll(async () => (await dialog.boundingBox())?.height ?? 0).toBeCloseTo(initialBounds!.height, 0);
  await expect.poll(async () => (await dialog.boundingBox())?.width ?? 0).toBeCloseTo(initialBounds!.width, 0);
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const body = dialog.getByRole("region", { name: "Kayıt çalışma alanı içeriği" });
    await expect.poll(async () => {
      const dimensions = await body.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
      return dimensions.scroll - dimensions.client;
    }).toBeLessThanOrEqual(1);
    await expect.poll(async () => (await dialog.boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(-0.5);
    await expect.poll(async () => (await dialog.boundingBox())?.width ?? Infinity).toBeLessThanOrEqual(viewport.width + 1);
    await expect.poll(async () => (await dialog.boundingBox())?.height ?? Infinity).toBeLessThanOrEqual(viewport.height + 1);
    const title = dialog.getByRole("heading", { name: companyName, exact: true });
    const stages = dialog.getByRole("group", { name: /Satış (alanları|aşamaları)/ });
    // Measure against the popup itself so viewport recentering is not confused
    // with the header scrolling away with the content.
    const titleTop = (await title.boundingBox())!.y - (await dialog.boundingBox())!.y;
    const stagesTop = (await stages.boundingBox())!.y - (await dialog.boundingBox())!.y;
    await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(title).toBeInViewport();
    await expect(stages).toBeInViewport();
    expect((await title.boundingBox())!.y - (await dialog.boundingBox())!.y).toBeCloseTo(titleTop, 0);
    expect((await stages.boundingBox())!.y - (await dialog.boundingBox())!.y).toBeCloseTo(stagesTop, 0);
    await body.evaluate((element) => { element.scrollTop = 0; });
    const screenshot = testInfo.outputPath(`opportunity-popup-${viewport.width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach(`popup-${viewport.width}`, { path: screenshot, contentType: "image/png" });
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(page).not.toHaveURL(/[?&]opportunity=/);
  expect(unhandledMutations).toEqual([]);
});

test("aşama görüntülemek kayıt yazmaz ve engelli ilerletme kapalı kalır", async ({ page }) => {
  const { dialog, mutations } = await openPopup(page);
  const stages = dialog.getByRole("group", { name: /Satış (alanları|aşamaları)/ });
  await stages.getByRole("button", { name: /^A(?:\s|$)/ }).click();
  await expect(dialog.getByText(/yalnız önizleme/)).toBeVisible();
  await stages.getByRole("button", { name: /^B(?:\s|$)/ }).click();
  await expect(dialog.getByRole("button", { name: /A (alanına|aşamasına) geç/ })).toBeDisabled();
  expect(mutations).toEqual([]);
});

test("açıklama ve not sentetik API'ye kaydolur, tekrar açıldığında korunur", async ({ page }) => {
  const { dialog, mutations, unhandledMutations, opportunity, opener } = await openPopup(page);
  const conversation = dialog.getByRole("region", { name: "Notlar ve görüşmeler", exact: true });
  const description = "Yeni açıklama: teslim süresi görüşüldü, teknik dosya bekleniyor.";
  await dialog.getByRole("button", { name: "Açıklamayı düzenle", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Fırsat açıklaması", exact: true }).fill(description);
  await dialog.getByRole("button", { name: "Açıklamayı kaydet", exact: true }).click();
  await expect.poll(() => opportunity.description).toBe(description);
  const note = "Müşteri teknik dosyayı yarın paylaşacak.";
  await dialog.getByRole("textbox", { name: "Not yaz", exact: true }).fill(note);
  await dialog.getByRole("button", { name: "Not ekle", exact: true }).click();
  await expect.poll(() => mutations.some((item) => item.path === "/activities" && item.body.description === note)).toBe(true);
  await expect(conversation.getByText(note, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(dialog.getByTestId("workspace-decision-summary")).toBeFocused();
  await expect(dialog.getByTestId("opportunity-summary").getByText(description, { exact: true })).toBeVisible();
  await expect(dialog.locator("[data-record-dialog-header]").getByText(description, { exact: true })).toBeVisible();
  await expect(conversation.getByText(note, { exact: true })).toBeVisible();
  expect(unhandledMutations).toEqual([]);
});

test("salt okunur kullanıcı kaydı görebilir fakat düzenleyemez", async ({ page }) => {
  const { dialog, mutations } = await openPopup(page, { readOnly: true });
  await expect(dialog.getByTestId("opportunity-summary").getByText(initialDescription)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Açıklamayı düzenle", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Not ekle", exact: true })).toHaveCount(0);
  const advance = dialog.getByRole("button", { name: /A (alanına|aşamasına) geç/ });
  if (await advance.count()) await expect(advance).toBeDisabled();
  expect(mutations).toEqual([]);
});

test("detay yükleme hatası tekrar denendiğinde toparlanır", async ({ page }) => {
  const { dialog, recoverDetail, mutations } = await openPopup(page, { detailError: true });
  await expect(dialog.getByRole("alert")).toBeVisible();
  recoverDetail();
  await dialog.getByRole("button", { name: "Tekrar dene", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByRole("group", { name: /Satış (alanları|aşamaları)/ })).toBeVisible();
  expect(mutations).toEqual([]);
});

test("tamamlanan işler gizlenir ve belgeler yalnız ortak listede gösterilir", async ({ page }) => {
  const { dialog, mutations } = await openPopup(page, { documents: true });
  const process = dialog.getByRole("region", { name: "Fırsatın yapılacakları", exact: true });
  const completed = process.getByRole("button", { name: "Teklif hazırlandı Belgeleri gör", exact: true });
  const documents = dialog.locator("#opportunity-documents");
  await expect(completed).toHaveCount(0);
  await expect(documents).not.toHaveAttribute("open", "");
  await process.getByRole("button", { name: "Tamamlananları göster (1)", exact: true }).click();
  await expect(completed).toBeVisible();
  await expect(process.getByText(quoteNumber, { exact: false })).toHaveCount(0);
  await completed.click();
  await expect(documents).toHaveAttribute("open", "");
  await expect(documents.getByRole("button", { name: new RegExp(quoteNumber) })).toHaveCount(1);
  await expect(documents.getByRole("button", { name: new RegExp(uploadedFilename) })).toHaveCount(1);
  await process.getByRole("button", { name: "Tamamlananları gizle", exact: true }).click();
  await expect(completed).toHaveCount(0);
  expect(mutations).toEqual([]);
});

// Teklif bir kere verilip bitmiyor: revizyon, ikinci makine veya yeni fiyat
// için aynı fırsatta tekrar açılır. Süreç adımı ilk teklifte tamamlandığı için
// giriş belgeler bölümünde kalıcı olmalı.
test("teklif verilmiş fırsatta yeniden teklif açılabilir", async ({ page }) => {
  const { dialog } = await openPopup(page, { documents: true });
  const documents = dialog.locator("#opportunity-documents");
  await documents.locator("summary").click();
  await expect(documents.getByRole("button", { name: new RegExp(quoteNumber) })).toHaveCount(1);
  await expect(documents.getByRole("button", { name: "Yeni teklif oluştur", exact: true })).toBeVisible();
});

test("teklifi olmayan fırsatta da teklif oluşturma girişi durur", async ({ page }) => {
  const { dialog } = await openPopup(page);
  const documents = dialog.locator("#opportunity-documents");
  await documents.locator("summary").click();
  await expect(documents.getByText("Henüz teklif veya belge yok.", { exact: true })).toBeVisible();
  await expect(documents.getByRole("button", { name: "Teklif oluştur", exact: true })).toBeVisible();
});

test("salt okunur kullanıcıya teklif oluşturma girişi gösterilmez", async ({ page }) => {
  const { dialog } = await openPopup(page, { readOnly: true, documents: true });
  const documents = dialog.locator("#opportunity-documents");
  await documents.locator("summary").click();
  await expect(documents.getByRole("button", { name: /teklif oluştur/i })).toHaveCount(0);
});

test("yüklenen PDF satırı imzalı indirme yoluyla önizlenir", async ({ page }) => {
  const { dialog, mutations, reads, unhandledMutations } = await openPopup(page, { documents: true });
  const documents = dialog.locator("#opportunity-documents");
  await documents.locator("summary").click();
  await documents.getByRole("button", { name: new RegExp(uploadedFilename) }).click();
  const preview = page.getByRole("dialog", { name: uploadedFilename, exact: true });
  await expect(preview).toBeVisible();
  await expect.poll(() => mutations.filter((item) => item.path === "/files/signed-download-url")).toEqual([
    { path: "/files/signed-download-url", method: "POST", body: { fileId: uploadedFileId } },
  ]);
  await expect(preview.locator("iframe")).toHaveAttribute("src", /\/__test__\/uploaded\.pdf$/);
  expect(reads.filter((path) => /^\/(contracts|proformas|commercial-invoices|quotes)\//.test(path))).toEqual([]);
  expect(unhandledMutations).toEqual([]);
});

test("lead kartında masaüstü ve mobilde tek görünür dönüşüm komutu bulunur", async ({ page }) => {
  const { dialog, mutations } = await openPopup(page, { qualificationStage: "lead" });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const conversion = dialog.getByRole("button", { name: "Fırsata dönüştür", exact: true });
    await expect(conversion).toHaveCount(1);
    await expect(conversion).toBeEnabled();
    await expect(dialog.getByTestId("workspace-decision-summary").getByRole("button")).toHaveCount(0);
  }
  expect(mutations).toEqual([]);
});

test("elenmiş lead dönüşümü masaüstü ve mobilde devre dışıdır", async ({ page }) => {
  const { dialog, mutations } = await openPopup(page, { qualificationStage: "lead", leadFollowUpStatus: "disqualified" });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const conversion = dialog.getByRole("button", { name: "Fırsata dönüştür", exact: true });
    await expect(conversion).toHaveCount(1);
    await expect(conversion).toBeDisabled();
    await expect(dialog.getByTestId("workspace-decision-summary").getByRole("button")).toHaveCount(0);
  }
  expect(mutations).toEqual([]);
});

for (const state of ["closed", "lost"] as const) {
  test(`${state} kartta birincil iş açılamaz ve aşama ilerletilemez`, async ({ page }) => {
    const { dialog, mutations } = await openPopup(page, state === "closed" ? { closed: true } : { qualificationStage: "lost" });
    const summary = dialog.getByTestId("workspace-decision-summary");
    await expect(summary.getByText("Fırsat durumu", { exact: true })).toBeVisible();
    await expect(summary.getByRole("button")).toHaveCount(0);
    const process = dialog.getByRole("region", { name: "Fırsatın yapılacakları", exact: true });
    if (state === "closed") {
      await expect(process.getByRole("button", { name: /A alanına geç/ })).toBeDisabled();
      await expect(process.getByText("Kart kapalı. Düzenlemek için önce geri açın.", { exact: true })).toBeVisible();
    } else {
      await expect(process.getByRole("button", { name: /alanına geç/ })).toHaveCount(0);
      await expect(process.getByText("Kart kaybedildi olarak kapatıldı; alan ilerletilemez.", { exact: true })).toBeVisible();
    }
    expect(mutations).toEqual([]);
  });
}

test("açıklama ve hedef tarihi temizlemek null PATCH gönderir", async ({ page }) => {
  const { dialog, mutations, opportunity, opener } = await openPopup(page);
  await dialog.getByRole("button", { name: "Açıklamayı düzenle", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Fırsat açıklaması", exact: true }).fill("   ");
  await dialog.getByRole("button", { name: "Açıklamayı kaydet", exact: true }).click();
  await expect.poll(() => mutations.some((item) => item.path === `/opportunities/${opportunityId}` && item.body.description === null)).toBe(true);
  await expect(dialog.getByText("Henüz açıklama eklenmedi.", { exact: true })).toBeVisible();
  const closeDate = dialog.getByLabel("Hedef kapanış", { exact: true });
  await expect(closeDate).toHaveValue("2099-10-01");
  await closeDate.fill("");
  await closeDate.blur();
  await expect.poll(() => mutations.some((item) => item.path === `/opportunities/${opportunityId}` && item.body.expectedCloseDate === null)).toBe(true);
  expect(opportunity.description).toBeNull();
  expect(opportunity.expectedCloseDate).toBeNull();
  await page.keyboard.press("Escape");
  await opener.click();
  await expect(dialog.getByText("Henüz açıklama eklenmedi.", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Hedef kapanış", { exact: true })).toHaveValue("");
});

test("açık popup ciddi veya kritik erişilebilirlik ihlali üretmez", async ({ page }) => {
  const { dialog } = await openPopup(page);
  await expect(dialog.getByRole("group", { name: /Satış (alanları|aşamaları)/ })).toBeVisible();
  // Load axe into its intended browser environment; importing the bundled axe
  // source through the local Node runtime attempts to read window.document.
  await page.addScriptTag({ path: createRequire(import.meta.url).resolve("axe-core/axe.min.js") });
  const result = await page.evaluate(async () => (window as any).axe.run('[role="dialog"]', {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
  }));
  expect(result.violations.filter((item: { impact: string }) => item.impact === "critical" || item.impact === "serious")).toEqual([]);
});
