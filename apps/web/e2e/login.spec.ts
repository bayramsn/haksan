import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("giriş yapıldığında gösterge paneli yüklenir", async ({ page }) => {
  await login(page);
  // Üst başlıkta Dashboard / Gösterge Paneli görünür olmalı.
  await expect(page.getByText("Gösterge Paneli", { exact: false }).first()).toBeVisible();
});
