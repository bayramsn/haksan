import { expect, test } from "@playwright/test";

const ONBOARDING_KEY = "haksan:onboarding:v1";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Unauthorized" }),
    });
  });
});

test("ilk anonim ziyarette onboarding açılır ve atlanınca login görünür", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("onboarding-root")).toBeVisible();
  await page.getByTestId("onboarding-skip").click();

  await expect(page.getByTestId("login-identifier")).toBeVisible();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), ONBOARDING_KEY)).toBe("seen");
});

test("tamamlanmış onboarding sonraki ziyarette gösterilmez", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "seen"), ONBOARDING_KEY);
  await page.goto("/");

  await expect(page.getByTestId("login-identifier")).toBeVisible();
  await expect(page.getByTestId("onboarding-root")).toHaveCount(0);
});

test("intro parametresi onboarding'i zorlar ve tamamlanınca URL'den kaldırılır", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "seen"), ONBOARDING_KEY);
  await page.goto("/?intro=1");

  await expect(page.getByTestId("onboarding-root")).toBeVisible();
  await page.getByTestId("onboarding-skip").click();

  await expect(page.getByTestId("login-identifier")).toBeVisible();
  await expect(page).not.toHaveURL(/intro=1/);
});

test("login ekranındaki tanıtım bağlantısı onboarding'i yeniden açar", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "seen"), ONBOARDING_KEY);
  await page.goto("/");

  await page.getByTestId("onboarding-replay").click();
  await expect(page.getByTestId("onboarding-root")).toBeVisible();
});

test("şifre sıfırlama bağlantısı onboarding'i atlayarak login'e ulaşır", async ({ page }) => {
  await page.goto("/?resetToken=ornek-token");

  await expect(page.getByTestId("onboarding-root")).toHaveCount(0);
  await expect(page.getByTestId("login-identifier")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("final sahne login ve kurumsal site hedeflerini sunar", async ({ page }) => {
  await page.goto("/?intro=1");

  const onboarding = page.getByTestId("onboarding-root");
  await onboarding.evaluate((element) => {
    element.scrollTop = element.scrollHeight - element.clientHeight;
  });

  await expect(page.getByTestId("onboarding-login")).toBeVisible();
  await expect(page.getByRole("link", { name: "Haksan’ı keşfet" })).toHaveAttribute("href", /haksanmakina\.com\.tr/);
  await page.getByTestId("onboarding-login").click();
  await expect(page.getByTestId("login-identifier")).toBeVisible();
});

test("reduced-motion modunda video scrub yerine sahne görseli kullanılır", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?intro=1");

  const onboarding = page.getByTestId("onboarding-root");
  await expect(onboarding).toBeVisible();
  await expect(onboarding.locator("video")).toHaveCount(0);
  await expect(onboarding.locator('img[src="/onboarding/scene-01.webp"]')).toBeVisible();
});

test("tanıtım videosu yalnız uygun masaüstü koşullarında ve metadata ön yüklemesiyle bağlanır", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?intro=1");

  const video = page.getByTestId("onboarding-root").locator("video");
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute("preload", "metadata");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("onboarding-root").locator("video")).toHaveCount(0);
});

test("login arka plan videosu mobil ve reduced-motion istemcilerde DOM'a eklenmez", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "seen"), ONBOARDING_KEY);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const loginVideo = page.locator('video source[src="/brand/login-hero-2026-07-21.mp4"]');
  await expect(loginVideo).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(loginVideo).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(loginVideo).toHaveCount(0);
});

test("mobil onboarding yatay taşma üretmez", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?intro=1");

  const onboarding = page.getByTestId("onboarding-root");
  await expect(onboarding).toBeVisible();
  const hasHorizontalOverflow = await onboarding.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});
