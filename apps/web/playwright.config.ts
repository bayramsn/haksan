import { defineConfig, devices } from "@playwright/test";

/**
 * Temel smoke test yapılandırması.
 *
 * Testler çalışan bir API + tohumlanmış (seed) veritabanı varsayar; demo
 * kullanıcı (admin@haksan.local) ile giriş yapar. Web dev sunucusu otomatik
 * başlatılır; zaten çalışıyorsa yeniden kullanılır.
 *
 * Çalıştırma:  npm run test:e2e --workspace=apps/web
 * Ortam:       E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD ile override edilebilir.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "../../output/playwright/test-results",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
