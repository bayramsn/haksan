import { test, expect } from "@playwright/test";
import { E2E_EMAIL, E2E_PASSWORD, login, navigateTo } from "./helpers";

const e2eApiBase = process.env.E2E_API_URL ?? "http://localhost:3000/api/v1";

test("fırsatlar listelenir ve detay açılır", async ({ page }) => {
  await login(page);
  await navigateTo(page, "Fırsatlar");

  // Sayfa varsayılan olarak Kanban açılır; liste görünümünü açıkça seç.
  await page.getByRole("tab", { name: "Liste" }).click();
  const table = page.locator("table").first();
  await expect(table).toBeVisible();

  const firstRow = table.locator("tbody tr").first();
  // Kayıt varsa detay dialog'unu aç ve kapanışını doğrula.
  if (await firstRow.count()) {
    await firstRow.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Fırsat nabzı", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Tam çalışma alanını aç" })).toBeVisible();
    await expect(page).toHaveURL(/[?&]opportunity=[^&]+/);

    await page.reload();
    await expect(dialog.getByText("Fırsat nabzı", { exact: true })).toBeVisible();

    await dialog.getByRole("button", { name: "Tam çalışma alanını aç" }).click();
    await expect(dialog.getByText("Kayıt çalışma alanı", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("tab", { name: "Özet", exact: true })).toHaveAttribute("data-state", "active");
    await expect(dialog.getByText("Deterministik skor; her bileşen CRM verisinden hesaplanır.")).toBeVisible();
    await dialog.getByRole("button", { name: "Özet hazırla", exact: true }).click();
    await expect(dialog.getByText(/^(AI özeti|CRM veri özeti)$/)).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole("tab", { name: "Aktivite", exact: true }).click();
    await expect(dialog.getByText("Birleşik zaman çizelgesi", { exact: true })).toBeVisible();
    await dialog.getByRole("tab", { name: "Ticari", exact: true }).click();
    await expect(dialog.getByText("Ödeme ve tahsilat", { exact: true })).toBeVisible();
    await dialog.getByRole("tab", { name: "Operasyon", exact: true }).click();
    await expect(dialog.getByText("Birleşik süreç merkezi", { exact: true })).toBeVisible();
    await dialog.getByRole("tab", { name: "Dosya & Geçmiş", exact: true }).click();
    await expect(dialog.getByText("Değişiklik günlüğü", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Hızlı özete dön", exact: true }).first().click();
    await expect(dialog.getByText("Fırsat nabzı", { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => (await dialog.boundingBox())?.width).toBeLessThanOrEqual(390);
    const mobileBounds = await dialog.boundingBox();
    expect(mobileBounds?.x).toBeGreaterThanOrEqual(0);
    await expect(dialog.getByRole("button", { name: "Tam çalışma alanını aç" })).toBeVisible();
    await dialog.getByRole("button", { name: "Tam çalışma alanını aç" }).click();
    const mobileWorkspaceBounds = await dialog.boundingBox();
    expect(mobileWorkspaceBounds?.x).toBeGreaterThanOrEqual(-0.5);
    expect(mobileWorkspaceBounds?.width).toBeLessThanOrEqual(390.5);
    expect(mobileWorkspaceBounds?.height).toBeLessThanOrEqual(844);
    await expect(dialog.getByRole("button", { name: "Hızlı özete dön", exact: true }).last()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]opportunity=/);
  }
});

test("liste filtresi kanban görünümüne de uygulanır", async ({ page }) => {
  await login(page);
  await navigateTo(page, "Fırsatlar");

  const search = page.getByPlaceholder("Firma / kontak / ürün ara...");
  await expect(search).toBeVisible();
  await search.fill("__eslesmeyecek_kanban_filtresi__");
  await page.getByRole("tab", { name: "Kanban" }).click();

  await expect(search).toBeVisible();
  await expect(page.locator('[data-testid^="sales-kanban-card-"]')).toHaveCount(0);
});

test("lead kartı onay alınarak silinir", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const contactName = `Silme Test Lead ${suffix}`;
  const product = `Silme Test Ürünü ${suffix}`;

  await login(page);
  await navigateTo(page, "Leadler");
  await page.getByRole("button", { name: "Hızlı Lead", exact: true }).click();
  await page.getByLabel("Kontak ismi *").fill(contactName);
  await page.locator("#lead-phone").fill("05325550002");
  await page.locator("#lead-city").fill("İstanbul");
  await page.getByLabel("İstenen ürün *").fill(product);
  await page.getByRole("button", { name: "Lead Kartı Oluştur" }).click();

  const search = page.getByPlaceholder("Firma, kontak, telefon veya ürün ara...");
  await search.fill(contactName);
  const deleteButton = page.getByRole("button", { name: `${contactName} lead kartını sil` });
  await expect(deleteButton).toBeVisible();
  await deleteButton.click();

  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation.getByText("Lead kartı silinsin mi?", { exact: true })).toBeVisible();
  await confirmation.getByRole("button", { name: "Lead Kartını Sil", exact: true }).click();

  await expect(confirmation).toBeHidden();
  await expect(deleteButton).toHaveCount(0);
});

test("lead kartından yeni firma OSM araması üst formu göndermeden açık kalır", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const companyTitle = `OSM Form Regresyon ${suffix}`;
  const product = `Test Makinesi ${suffix}`;
  let companyCreateRequests = 0;

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/v1/companies") {
      companyCreateRequests += 1;
    }
  });
  await page.route("**/api/v1/companies/osm-search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: `osm-${suffix}`,
          displayName: `${companyTitle}, İstanbul, Türkiye`,
          latitude: 41.0082,
          longitude: 28.9784,
          type: "company",
          category: "office",
          importance: 0.8,
          matchQuality: "exact",
          matchScore: 96,
          matchReason: "Firma ünvanı ve şehir eşleşti.",
        },
      ]),
    });
  });

  await login(page);
  await navigateTo(page, "Leadler");
  await page.getByRole("button", { name: "Hızlı Lead", exact: true }).click();
  await page.getByLabel("Kontak ismi *").fill(`OSM Test ${suffix}`);
  await page.locator("#lead-phone").fill("05325551212");
  await page.locator("#lead-city").fill("İstanbul");
  await page.getByText("Kayıtlı firmadan seçin veya yazın", { exact: true }).click();
  await page.getByPlaceholder("Firma ara…").fill(companyTitle);
  await page.getByRole("option", { name: `"${companyTitle}" firmasını lead olarak yaz` }).click();
  await page.getByLabel("İstenen ürün *").fill(product);
  await page.getByRole("button", { name: "Lead Kartı Oluştur" }).click();

  const search = page.getByPlaceholder("Firma, kontak, telefon veya ürün ara...");
  await search.fill(companyTitle);
  const card = page.locator("button.w-full.text-left").filter({ hasText: companyTitle }).first();
  await expect(card).toBeVisible();
  await card.click();

  const opportunityDialog = page.getByRole("dialog");
  await expect(opportunityDialog.getByText("Fırsat nabzı", { exact: true })).toBeVisible();
  await opportunityDialog.getByRole("button", { name: "Tam çalışma alanını aç" }).click();
  await page.getByRole("button", { name: "Yeni Firma Oluştur" }).click();
  const companyDialog = page.getByRole("dialog", { name: "Yeni Firma" });
  await expect(companyDialog).toBeVisible();
  await companyDialog.getByRole("button", { name: "OSM'de ara" }).click();

  await expect(companyDialog).toBeVisible();
  await expect(companyDialog.getByText(`${companyTitle}, İstanbul, Türkiye`)).toBeVisible();
  expect(companyCreateRequests).toBe(0);
});

test("Lead Workspace V2 akışı otomatik atamadan gerekçeli fırsat dönüşümüne ilerler", async ({ page, request }) => {
  const suffix = Date.now().toString(36);
  const city = `V2-${suffix}`;
  const product = `HAXAN-V2-${suffix}`;
  const contactName = `Lead V2 ${suffix}`;

  const apiLogin = await request.post(`${e2eApiBase}/auth/login`, {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  });
  expect(apiLogin.ok()).toBeTruthy();
  const token = (await apiLogin.json()).accessToken as string;
  const headers = { Authorization: `Bearer ${token}` };
  const usersResponse = await request.get(`${e2eApiBase}/users`, { headers });
  expect(usersResponse.ok()).toBeTruthy();
  const users = await usersResponse.json() as Array<{
    id: string;
    fullName: string;
    status: string;
    roles: Array<{ code: string }>;
    divisions: Array<{ id: string; name: string }>;
  }>;
  const assignee = users.find((candidate) =>
    candidate.status === "active" &&
    candidate.roles.some((role) => role.code === "sales") &&
    candidate.divisions.length > 0
  );
  expect(assignee, "E2E için bölüme bağlı aktif satış kullanıcısı gerekli").toBeTruthy();
  const division = assignee!.divisions[0];

  const ruleResponse = await request.post(`${e2eApiBase}/lead-assignment-rules`, {
    headers,
    data: {
      name: `Playwright Lead V2 ${suffix}`,
      priority: 0,
      divisionId: division.id,
      criteria: { cities: [city], productTerms: [product], sourceCodes: [] },
      assigneeUserIds: [assignee!.id],
    },
  });
  expect(ruleResponse.status()).toBe(201);
  const ruleId = (await ruleResponse.json()).id as string;

  try {
    await page.addInitScript((divisionId) => {
      window.localStorage.setItem("haksan_active_division", divisionId);
    }, division.id);
    await login(page);
    await navigateTo(page, "Leadler");

    await page.getByRole("button", { name: "Hızlı Lead", exact: true }).click();
    await page.getByLabel("Kontak ismi *").fill(contactName);
    await page.locator("#lead-phone").fill("05325550123");
    await page.locator("#lead-city").fill(city);
    await page.getByLabel("İstenen ürün *").fill(product);
    await page.getByLabel("İlk takip aksiyonu").fill("Teknik keşif görüşmesini gerçekleştir");
    await page.getByLabel("Takip zamanı").fill("2030-02-01T10:30");
    await page.getByRole("button", { name: "Lead Kartı Oluştur" }).click();

    const search = page.getByPlaceholder("Firma, kontak, telefon veya ürün ara...");
    await search.fill(contactName);
    const row = page.getByRole("row").filter({ hasText: contactName });
    await expect(row).toBeVisible();
    await expect(row).toContainText(assignee!.fullName);
    await row.click();

    const recordDialog = page.getByRole("dialog", { name: new RegExp(product) });
    await expect(recordDialog).toBeVisible();
    await recordDialog.getByRole("button", { name: "Tam çalışma alanını aç" }).click();
    await expect(recordDialog.getByText("Lead çalışma alanı", { exact: true })).toBeVisible();
    await expect(recordDialog.getByRole("tab", { name: "Özet", exact: true })).toHaveAttribute("data-state", "active");
    await expect(recordDialog.getByRole("tab", { name: "Temas", exact: true })).toBeVisible();
    await expect(recordDialog.getByRole("tab", { name: "Nitelendirme", exact: true })).toBeVisible();
    await expect(recordDialog.getByRole("tab", { name: "Aktivite", exact: true })).toHaveCount(0);

    await recordDialog.getByRole("tab", { name: "Temas", exact: true }).click();
    await recordDialog.getByRole("button", { name: "Temas sonucunu kaydet", exact: true }).click();
    const contactDialog = page.getByRole("dialog", { name: "Temas sonucunu kaydet" });
    await contactDialog.getByLabel("Kısa not").fill("Karar verici teknik demo ve fiyat çalışması istedi.");
    await contactDialog.getByLabel("Sonraki aksiyon").fill("Demo takvimini ve teknik föyü gönder");
    await contactDialog.getByLabel("Takip zamanı").fill("2030-02-02T10:30");
    await contactDialog.getByRole("button", { name: "Sonucu kaydet" }).click();
    await expect(contactDialog).toBeHidden();

    await recordDialog.getByRole("tab", { name: "Nitelendirme", exact: true }).click();
    await recordDialog.getByLabel("İhtiyaç özeti").fill("Yeni kapasite yatırımı için otomasyonlu işleme merkezi gerekiyor.");
    await recordDialog.getByRole("combobox", { name: "Karar verici" }).click();
    await page.getByRole("option", { name: "Karar verici", exact: true }).click();
    await recordDialog.getByRole("combobox", { name: "Bütçe" }).click();
    await page.getByRole("option", { name: "Bütçe yok", exact: true }).click();
    await recordDialog.getByRole("combobox", { name: "Satın alma zamanı" }).click();
    await page.getByRole("option", { name: "0–3 ay", exact: true }).click();
    await recordDialog.getByRole("combobox", { name: "Teknik uyum" }).click();
    await page.getByRole("option", { name: "İnceleme gerekli", exact: true }).click();
    await recordDialog.getByLabel("Teknik not").fill("Demo parçası ile çevrim süresi doğrulanacak.");
    await recordDialog.getByRole("button", { name: "Nitelendirmeyi kaydet" }).click();

    await recordDialog.getByRole("button", { name: "Fırsata dönüştür", exact: true }).click();
    const overrideDialog = page.getByRole("dialog", { name: "Gerekçeli dönüşüm" });
    await expect(overrideDialog).toBeVisible();
    await overrideDialog.getByLabel("Dönüşüm gerekçesi").fill("Bütçe yatırım komitesinde; demo sonucu teklif sürecini başlatmak için yeterli.");
    await overrideDialog.getByRole("button", { name: "Gerekçeyle dönüştür" }).click();
    await expect(overrideDialog).toBeHidden();

    await expect(recordDialog.getByText("Ortak fırsat görünümü", { exact: true })).toBeVisible();
    await expect(recordDialog.getByRole("tab", { name: "Aktivite", exact: true })).toBeVisible();
    await expect(recordDialog.getByRole("tab", { name: "Ticari", exact: true })).toBeVisible();
    await expect(recordDialog.getByRole("tab", { name: "Operasyon", exact: true })).toBeVisible();
    await expect(recordDialog.getByRole("tab", { name: "Temas", exact: true })).toHaveCount(0);

    await page.setViewportSize({ width: 768, height: 1024 });
    const tabletBounds = await recordDialog.boundingBox();
    expect(tabletBounds?.x).toBeGreaterThanOrEqual(-0.5);
    expect(tabletBounds?.width).toBeLessThanOrEqual(768.5);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileBounds = await recordDialog.boundingBox();
    expect(mobileBounds?.x).toBeGreaterThanOrEqual(-0.5);
    expect(mobileBounds?.width).toBeLessThanOrEqual(390.5);
    const overflow = await recordDialog.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    const mobileAction = recordDialog.getByRole("button", { name: "Aksiyon planla" }).last();
    await expect(mobileAction).toBeVisible();
    const mobileActionBounds = await mobileAction.boundingBox();
    expect(mobileActionBounds?.height).toBeGreaterThanOrEqual(44);
    expect((mobileActionBounds?.y ?? 0) + (mobileActionBounds?.height ?? 0)).toBeLessThanOrEqual(844);
    await mobileAction.focus();
    await expect(mobileAction).toBeFocused();
    const transitionDuration = await recordDialog
      .getByRole("tab", { name: "Ticari", exact: true })
      .evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.001);
  } finally {
    await request.delete(`${e2eApiBase}/lead-assignment-rules/${ruleId}`, { headers });
  }
});
