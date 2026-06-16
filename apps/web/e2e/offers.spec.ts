import { test, expect } from "@playwright/test";
import { login, navigateTo } from "./helpers";

test("teklifler sayfası açılır ve teklif detayı görüntülenir", async ({ page }) => {
  await login(page);
  await navigateTo(page, "Teklifler");

  // Teklif tablosu render olmalı.
  const table = page.locator("table").first();
  await expect(table).toBeVisible();

  const firstRow = table.locator("tbody tr").first();
  if (await firstRow.count()) {
    await firstRow.click();
    // Teklif detayı bir dialog veya detay paneli açar.
    await expect(page.getByRole("dialog").first()).toBeVisible();
  }
});
