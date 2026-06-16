import { test, expect } from "@playwright/test";
import { login, navigateToReports } from "./helpers";

test("raporlar sayfasından Excel dışa aktarımı indirilebilir", async ({ page }) => {
  await login(page);
  await navigateToReports(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel İndir" }).first().click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
});
