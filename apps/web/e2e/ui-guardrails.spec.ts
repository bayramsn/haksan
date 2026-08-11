import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const VIEWPORTS = [
  { name: "desktop-wide", width: 1440, height: 900 },
  { name: "desktop-compact", width: 1280, height: 720 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
] as const;

// Aynı demo hesabıyla eşzamanlı giriş, auth rate-limit kapısına takılmamalı.
test.describe.configure({ mode: "serial" });

test("ana kabuk desteklenen ekranlarda yatay taşmaz ve temel kontrolleri korur", async ({ page }) => {
  await login(page);

  for (const viewport of VIEWPORTS) {
    await test.step(viewport.name, async () => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(100);

      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));

      expect(dimensions.document, `${viewport.name} document taşması`).toBeLessThanOrEqual(dimensions.viewport);
      expect(dimensions.body, `${viewport.name} body taşması`).toBeLessThanOrEqual(dimensions.viewport);
      await expect(page.locator("#main-content")).toBeVisible();

      if (viewport.width < 1024) {
        await expect(page.getByRole("button", { name: "Menüyü aç" })).toBeVisible();
      } else {
        await expect(page.getByRole("button", { name: /Menüyü (daralt|genişlet)/ })).toBeVisible();
      }
    });
  }
});

test("ana kabuk kritik veya ciddi WCAG ihlali üretmez", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  const blockingViolations = result.violations.filter((violation) =>
    violation.impact === "critical" || violation.impact === "serious"
  );

  expect(blockingViolations).toEqual([]);
});

test("azaltılmış hareket tercihi ana kabukta korunur", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);

  const transitionDuration = await page.getByRole("button", { name: "Menüyü daralt" }).evaluate((element) =>
    getComputedStyle(element.closest("aside") ?? element).transitionDuration
  );
  const longestTransition = Math.max(...transitionDuration.split(",").map((value) => Number.parseFloat(value) || 0));
  expect(longestTransition).toBeLessThanOrEqual(0.001);
});
