import { test, expect } from "@playwright/test";
import { login, navigateTo } from "./helpers";

test("satış kartları listelenir ve detay açılır", async ({ page }) => {
  await login(page);
  await navigateTo(page, "Satış Kartları");

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
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
});

test("liste filtresi kanban görünümüne de uygulanır", async ({ page }) => {
  await login(page);
  await navigateTo(page, "Satış Kartları");

  const search = page.getByPlaceholder("Firma / kontak / ürün ara...");
  await expect(search).toBeVisible();
  await search.fill("__eslesmeyecek_kanban_filtresi__");
  await page.getByRole("tab", { name: "Kanban" }).click();

  await expect(search).toBeVisible();
  await expect(page.locator('[data-testid^="sales-kanban-card-"]')).toHaveCount(0);
});

test("satış kartından yeni firma OSM araması üst formu göndermeden açık kalır", async ({ page }) => {
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
  await navigateTo(page, "Satış Kartları");
  await page.getByRole("button", { name: "Hızlı Lead" }).click();
  await page.getByLabel("Kontak ismi *").fill(`OSM Test ${suffix}`);
  await page.getByLabel("Firma ünvanı").fill(companyTitle);
  await page.getByLabel("İstenen ürün *").fill(product);
  await page.getByRole("button", { name: "Lead Kartı Oluştur" }).click();

  await page.getByRole("tab", { name: "Liste" }).click();
  const search = page.getByPlaceholder("Firma / kontak / ürün ara...");
  await search.fill(companyTitle);
  const row = page.locator("tbody tr").filter({ hasText: companyTitle }).first();
  await expect(row).toBeVisible();
  await row.click();

  await page.getByRole("button", { name: "Yeni Firma Oluştur" }).click();
  const companyDialog = page.getByRole("dialog", { name: "Yeni Firma" });
  await expect(companyDialog).toBeVisible();
  await companyDialog.getByRole("button", { name: "OSM'de ara" }).click();

  await expect(companyDialog).toBeVisible();
  await expect(companyDialog.getByText(`${companyTitle}, İstanbul, Türkiye`)).toBeVisible();
  expect(companyCreateRequests).toBe(0);
});
