import { test, expect } from "@playwright/test";
import { login, navigateTo } from "./helpers";

test("satış kartları listelenir ve detay açılır", async ({ page }) => {
  await login(page);
  await navigateTo(page, "Satış Kartları");

  // Liste tablosu render olmalı.
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
