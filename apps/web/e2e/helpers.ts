import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export const E2E_EMAIL = process.env.E2E_EMAIL ?? "admin@haksan.local";
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "admin12345";

/**
 * Demo kullanıcı ile giriş yapar ve gösterge panelinin yüklenmesini bekler.
 * Başarısız girişte (API kapalı / yanlış kimlik) test net biçimde fail eder.
 */
export async function login(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator("#login-email").fill(E2E_EMAIL);
  await page.locator("#login-password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  // Giriş sonrası ana uygulama kabuğu (sol menü) görünür olmalı.
  await expect(page.getByRole("button", { name: "Hızlı Oluştur" })).toBeVisible();
}

/** Sol menüden bir sayfaya geçer (örn. "Teklifler", "Satış Kartları"). */
export async function navigateTo(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: label, exact: false }).first().click();
}

/** Kullanıcı menüsünden Raporlar sayfasına geçer. */
export async function navigateToReports(page: Page): Promise<void> {
  // Üst bardaki avatar / kullanıcı adı menüsü.
  await page.getByRole("button").filter({ has: page.locator('[data-slot="avatar-fallback"], .bg-primary') }).last().click();
  await page.getByRole("menuitem", { name: "Raporlar" }).click();
  await expect(page.getByRole("button", { name: "Excel İndir" }).first()).toBeVisible();
}
