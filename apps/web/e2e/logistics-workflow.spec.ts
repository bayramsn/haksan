import { expect, test, type Page } from "@playwright/test";

const apiPrefix = "/api/v1";
const divisionId = "00000000-0000-4000-8000-000000000001";
const companyId = "00000000-0000-4000-8000-000000000010";
const machineOneId = "00000000-0000-4000-8000-000000000021";
const machineTwoId = "00000000-0000-4000-8000-000000000022";

const paginated = (data: unknown[] = []) => ({
  data,
  meta: { total: data.length, page: 1, pageSize: 200, totalPages: 1 },
});

async function mockCrmApi(page: Page) {
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
      user: { id: "user-1", email: "superadmin@haksan.local", fullName: "Süper Yönetici", tenantId: "tenant-1", roles: ["super_admin"] },
    });
    if (path === "/auth/me") return json({
      user: {
        id: "user-1",
        email: "superadmin@haksan.local",
        fullName: "Süper Yönetici",
        tenantId: "tenant-1",
        departmentId: null,
        roles: ["super_admin"],
        permissions: [
          "companies.read", "companies.create", "companies.update", "contacts.read", "opportunities.read",
          "products.read", "inventory.read", "quotes.read", "service_tickets.read", "users.read",
          "customer_devices.read", "receivables.read", "payments.read", "proformas.read", "contracts.read",
          "commercial_invoices.read", "shipments.read", "shipments.create", "shipments.update",
          "installations.read", "installations.create", "installations.update", "files.read", "tenants.read", "tenants.update",
        ],
        mfaEnabled: false,
        divisions: [{ id: divisionId, code: "CNC", name: "CNC", isPrimary: true }],
        departments: [],
        accessScopes: [],
        canViewAllDivisions: true,
      },
      tenant: { id: "tenant-1", name: "HAKSAN", slug: "haksan" },
    });

    if (path === "/companies/summary") return json({
      total: 1,
      byRelation: { customer: 1, supplier: 0, prospect: 0, competitor: 0, unknown: 0 },
      byStatus: { active: 1, passive: 0, blacklisted: 0, unknown: 0 },
      cities: ["İstanbul"],
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

    if (path === "/companies") return json(paginated([{
      id: companyId,
      companyType: "company",
      legalTitle: "Örnek Lojistik A.Ş.",
      shortName: "Örnek Lojistik",
      supplierCategoryCode: "logistics",
      relationType: { code: "supplier", name: "Tedarikçi" },
      customerStatus: { code: "active", name: "Aktif" },
      divisions: [{ id: divisionId, code: "CNC", name: "CNC" }],
      primaryPhone: "0 (212) 000 00 00",
      primaryEmail: "operasyon@example.test",
      primaryAddress: { id: "address-1", addressType: "shipping", country: "Türkiye", province: "İstanbul", district: "Bayrampaşa", fullAddress: "Örnek Cad. No:1", isDefault: true, isShipping: true },
      addresses: [{ id: "address-1", addressType: "shipping", country: "Türkiye", province: "İstanbul", district: "Bayrampaşa", fullAddress: "Örnek Cad. No:1", isDefault: true, isShipping: true }],
      createdAt: "2026-07-21T08:00:00.000Z",
    }]));
    if (path === "/customer-devices") return json(paginated([
      { id: machineOneId, companyId, serialNumber: "SER-001", model: "VM-2", brandName: "HAAS", controlUnit: "FANUC 0i", deliveryDate: "2026-07-18" },
      { id: machineTwoId, companyId, serialNumber: "SER-002", model: "ST-20", brandName: "HAAS", controlUnit: "FANUC 31i", deliveryDate: "2026-07-19" },
    ]));
    if (path === "/shipments") return json(paginated([{
      id: "shipment-1", opportunityId: null, direction: "incoming", senderName: "Yurt Dışı Tedarikçi",
      trackingNo: "IN-001", carrier: "Örnek Lojistik", origin: "Hamburg", destination: "İstanbul",
      status: { code: "preparing", name: "Hazırlanıyor" }, eta: "2026-07-30", items: [],
    }]));
    if (path === "/installations") return json(paginated([]));
    if (path === "/deliveries") return json(paginated([{
      id: "legacy-delivery-1", companyId, opportunityId: "", deliveryDate: "2026-07-19",
      signedBy: "Ahmet Yılmaz", status: "completed", formData: { machineId: machineOneId, formNo: "KT-001" },
    }]));
    if (path === "/products") return json(paginated([]));
    if (path === "/warehouses") return json([{ id: "warehouse-1", name: "Merkez Depo" }]);
    if (path === "/shipments/company-options") return json([{
      id: companyId, legalTitle: "Örnek Lojistik A.Ş.", shortName: "Örnek Lojistik", supplierCategoryCode: "logistics",
    }]);
    if (path === "/lookups/shipment-package-units" || path === "/admin/lookups/shipment-package-units") return json([
      { id: "unit-1", code: "package", name: "Paket", sortOrder: 10, isActive: true },
      { id: "unit-2", code: "pallet", name: "Palet", sortOrder: 20, isActive: true },
      { id: "unit-3", code: "crate", name: "Sandık", sortOrder: 30, isActive: true },
    ]);
    if (path === "/admin/lookups") return json({ available: ["product-groups", "shipment-statuses", "shipment-package-units"] });
    if (path.startsWith("/admin/lookups/") || path.startsWith("/lookups/")) return json([]);
    if (path === "/tenant") return json({ id: "tenant-1", name: "HAKSAN" });
    if (path === "/users") return json([]);

    return json(paginated([]));
  });
}

async function login(page: Page) {
  await mockCrmApi(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("haksan:onboarding:v1", "seen");
  });
  await page.goto("/");
  await page.getByTestId("login-identifier").fill("superadmin@haksan.local");
  await page.locator("#login-password").fill("superadmin12345");
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page.getByRole("button", { name: "Hızlı Oluştur" })).toBeVisible();
}

test("firma ve sevkiyat ekranları yeni lojistik alanlarını gösterir", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Firmalar", exact: true }).click();
  await page.getByRole("button", { name: "Yeni Firma" }).click();
  await page.getByRole("button", { name: "Tedarikçi", exact: true }).click();
  await expect(page.getByText("Tedarikçi Türü *")).toBeVisible();
  await expect(page.getByRole("button", { name: /Nakliye/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Lojistik/ })).toBeVisible();
  await page.getByRole("button", { name: "Vazgeç" }).click();

  await page.getByRole("button", { name: "Sevkiyat", exact: true }).click();
  await expect(page.getByText("↓ Gelen", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Yeni Sevkiyat" }).click();
  await expect(page.getByRole("button", { name: /Gelen Sevkiyat/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Giden Sevkiyat/ })).toBeVisible();
  await expect(page.getByText("Paket Adedi", { exact: true })).toBeVisible();
  await expect(page.getByText("Paket Birimi", { exact: true })).toBeVisible();
  await expect(page.getByText("Palet", { exact: true })).not.toBeVisible();
});

test("teslimat kurulum içine taşınır ve çoklu makine seçilir", async ({ page }) => {
  await login(page);

  await expect(page.getByRole("button", { name: "Teslimat", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Kurulum", exact: true }).click();
  await expect(page.getByRole("tab", { name: /Kurulum Tutanakları/ })).toBeVisible();
  await page.getByRole("tab", { name: /Kurulum Tutanakları/ }).click();
  await expect(page.getByText("Aktarılan Kurulum Tutanakları")).toBeVisible();
  await expect(page.getByText("KT-001").or(page.getByText("Ahmet Yılmaz"))).toBeVisible();

  await page.getByRole("button", { name: "Yeni Kurulum" }).click();
  const installationDialog = page.getByRole("dialog", { name: "Yeni Kurulum" });
  await expect(installationDialog.getByText("Makineler", { exact: true })).toBeVisible();
  await installationDialog.getByRole("combobox", { name: "Firma", exact: true }).click();
  await page.getByRole("option", { name: /Örnek Lojistik/ }).click();
  await installationDialog.getByRole("combobox", { name: "Kurulacak makineleri seçin" }).click();
  await page.getByRole("button", { name: /HAAS ST-20 · SER-002/ }).click();
  await expect(page.getByText("2 seçili", { exact: true })).toBeVisible();
  await expect(page.getByText(/HAAS VM-2/).first()).toBeVisible();
  await expect(page.getByText(/HAAS ST-20/).first()).toBeVisible();
});

test("CRM Alan Ayarları sevkiyat paket birimlerini liste halinde açar", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Hesap menüsü" }).click();
  await page.getByRole("menuitem", { name: "Ayarlar", exact: true }).click();
  await page.getByRole("tab", { name: /CRM Alan Ayarları/ }).click();
  await page.getByRole("button", { name: "Sevkiyat Paket Birimleri", exact: true }).click();
  await expect(page.getByText("Paket", { exact: true })).toBeVisible();
  await expect(page.getByText("Palet", { exact: true })).toBeVisible();
  await expect(page.getByText("Sandık", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ekle/ })).toBeVisible();
});
