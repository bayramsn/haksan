import { expect, test, type Page } from "@playwright/test";

const apiPrefix = "/api/v1";
const divisionId = "00000000-0000-4000-8000-000000000001";

const paginated = (data: unknown[] = []) => ({
  data,
  meta: { total: data.length, page: 1, pageSize: 200, totalPages: 1 },
});

async function mockApi(
  page: Page,
  onBatchSave: (body: any) => void,
  taxonomy: Record<string, unknown[]> = {},
) {
  await page.route(`**${apiPrefix}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice(apiPrefix.length) || "/";
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (path === "/auth/refresh") return json({ message: "Oturum yok" }, 401);
    if (path === "/auth/login") return json({
      accessToken: "e2e-access-token",
      user: {
        id: "user-1",
        email: "superadmin@haksan.local",
        fullName: "Süper Yönetici",
        tenantId: "tenant-1",
        roles: ["super_admin"],
      },
    });
    if (path === "/auth/me") return json({
      user: {
        id: "user-1",
        email: "superadmin@haksan.local",
        fullName: "Süper Yönetici",
        tenantId: "tenant-1",
        departmentId: null,
        roles: ["super_admin"],
        permissions: ["tenants.read", "tenants.update", "products.read"],
        mfaEnabled: false,
        divisions: [{ id: divisionId, code: "CNC", name: "CNC", isPrimary: true }],
        departments: [],
        accessScopes: [],
        canViewAllDivisions: true,
      },
      tenant: { id: "tenant-1", name: "HAKSAN", slug: "haksan" },
    });
    if (path === "/companies/summary") return json({
      total: 0,
      byRelation: { customer: 0, supplier: 0, prospect: 0, competitor: 0, unknown: 0 },
      byStatus: { active: 0, passive: 0, blacklisted: 0, unknown: 0 },
      cities: [],
      sectors: [],
    });
    if (path === "/reports/team-activity") return json({
      period: "week",
      scope: "team",
      canSeeTeam: true,
      range: { from: "2026-08-10T00:00:00.000Z", to: "2026-08-17T00:00:00.000Z" },
      previousRange: { from: "2026-08-03T00:00:00.000Z", to: "2026-08-10T00:00:00.000Z" },
      bucket: "day",
      totals: { quotes: 0, visits: 0, calls: 0, activities: 0, opportunitiesCreated: 0, won: 0, wonValue: 0 },
      previousTotals: { quotes: 0, visits: 0, calls: 0, activities: 0, opportunitiesCreated: 0, won: 0 },
      timeline: [],
      users: [],
    });
    if (path === "/tenant") return json({ id: "tenant-1", name: "HAKSAN" });
    if (path === "/admin/product-spec-templates" && request.method() === "GET") return json([]);
    if (path === "/admin/product-spec-templates/batch" && request.method() === "PUT") {
      const body = request.postDataJSON();
      onBatchSave(body);
      return json({
        ok: true,
        rows: body.items.map((item: any, index: number) => ({
          ...item,
          id: item.id ?? `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        })),
      });
    }
    if (path === "/products") return json(paginated([]));
    if (path === "/users") return json([]);
    if (path.startsWith("/admin/lookups/")) return json(taxonomy[path] ?? []);
    if (path.startsWith("/lookups/")) return json([]);
    if (path === "/admin/lookups") return json({ available: [] });
    return json(paginated([]));
  });
}

test("teknik alanda bölüm, sıra ve silme birlikte kaydedilir", async ({ page }) => {
  let savedBody: any = null;
  await mockApi(page, (body) => {
    savedBody = body;
  });
  await page.setViewportSize({ width: 900, height: 1100 });
  await page.addInitScript(() => {
    window.localStorage.setItem("haksan:onboarding:v1", "seen");
  });

  await page.goto("/");
  await page.getByTestId("login-identifier").fill("superadmin@haksan.local");
  await page.locator("#login-password").fill("superadmin12345");
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  // Giriş sonrası açılış sayfası artık Fırsat panosu (App.tsx varsayılanı), gösterge
  // paneli değil. Bu testin konusu teknik alan çalışma sayfası; burada yalnız uygulama
  // kabuğunun yüklendiğini doğrulamak yeterli — helpers.ts'teki login() ile aynı ölçüt.
  await expect(page.getByRole("button", { name: "Hızlı Oluştur" })).toBeVisible();

  await page.getByRole("button", { name: "Hesap menüsü" }).click();
  await page.getByRole("menuitem", { name: "Ayarlar", exact: true }).click();
  await page.getByRole("tab", { name: /Teknik Bilgi/ }).click();
  await page.getByRole("button", { name: /Çalışma sayfasını aç/ }).first().click();

  await page.getByRole("button", { name: "Tabla Ölçüsü alanının ayarlarını aç" }).click();
  const inspector = page.getByRole("dialog", { name: "Alan ayarları" });
  await expect(inspector).toBeVisible();
  const selects = inspector.locator("select");
  await selects.nth(0).selectOption("EKSENLER");
  await selects.nth(1).selectOption("0");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "T Slot Ölçü ve Sayısı alanını sil" }).click();
  await page.getByRole("button", { name: "Alanı sil", exact: true }).click();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();

  await expect.poll(() => savedBody).not.toBeNull();
  const moved = savedBody.items.find((item: any) => item.specKey === "Tabla Ölçüsü");
  const deleted = savedBody.items.find((item: any) => item.specKey === "T Slot Ölçü ve Sayısı");
  expect(moved.specGroupCode).toBe("EKSENLER");
  expect(deleted.isDeleted).toBe(true);
  expect(deleted.isActive).toBe(false);
});

test("CRM kategori zinciri Teknik Bilgi ve yeni şablon seçimleriyle eşleşir", async ({ page }) => {
  const groupId = "10000000-0000-4000-8000-000000000001";
  const categoryId = "10000000-0000-4000-8000-000000000002";
  const subcategoryId = "10000000-0000-4000-8000-000000000003";
  const emptyCategoryId = "10000000-0000-4000-8000-000000000005";
  await mockApi(page, () => undefined, {
    "/admin/lookups/product-groups": [
      { id: groupId, code: "CNC", name: "CNC", divisionId, isActive: true },
    ],
    "/admin/lookups/product-categories": [
      { id: categoryId, code: "YEDEK_PARCA", name: "Yedek Parça", divisionId, productGroupId: groupId, isActive: true },
      { id: emptyCategoryId, code: "AKSESUAR", name: "Aksesuar", divisionId, productGroupId: groupId, isActive: true },
    ],
    "/admin/lookups/product-subcategories": [
      { id: subcategoryId, code: "LINEER_SISTEM", name: "Lineer Sistem", divisionId, categoryId, isActive: true },
    ],
    "/admin/lookups/product-types": [
      { id: "10000000-0000-4000-8000-000000000004", code: "LINEER_KIZAK", name: "Lineer Kızak", divisionId, subcategoryId, isActive: true },
    ],
  });
  await page.addInitScript(() => {
    window.localStorage.setItem("haksan:onboarding:v1", "seen");
  });

  await page.goto("/");
  await page.getByTestId("login-identifier").fill("superadmin@haksan.local");
  await page.locator("#login-password").fill("superadmin12345");
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.getByRole("button", { name: "Hesap menüsü" }).click();
  await page.getByRole("menuitem", { name: "Ayarlar", exact: true }).click();
  await page.getByRole("tab", { name: /Teknik Bilgi/ }).click();

  await expect(page.getByRole("button", { name: "Yedek Parça", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Yedek Parça", exact: true }).click();
  await expect(page.getByLabel("Ürün Kategorisi")).toHaveValue("YEDEK_PARCA");
  await expect(page.getByLabel("Ürün Alt Kategorisi")).toHaveValue("LINEER_SISTEM");
  await expect(page.getByLabel("Ürün Tipi")).toHaveValue("LINEER_KIZAK");

  await page.getByRole("button", { name: "Yeni şablon aç" }).click();
  const dialog = page.getByRole("dialog", { name: "Ürün şablonu aç" });
  await expect(dialog.getByLabel("Ürün kategorisi").locator("option")).toHaveText(["Yedek Parça", "Aksesuar"]);
  await expect(dialog.getByLabel("Ürün kategorisi")).toHaveValue(categoryId);
  await expect(dialog.getByLabel("Ürün alt kategorisi")).toHaveValue(subcategoryId);
  await expect(dialog.getByLabel("Ürün tipi")).toHaveValue("LINEER_KIZAK");
  await dialog.getByRole("button", { name: "Şablonu aç", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Lineer Kızak" })).toBeVisible();
  await expect(page.getByText("Yedek Parça", { exact: true }).last()).toBeVisible();
});
