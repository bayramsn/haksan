import { test, expect } from "@playwright/test";
import { login, navigateTo } from "./helpers";

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
