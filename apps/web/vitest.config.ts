import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Vitest, kendi config dosyası varken vite.config.ts'i otomatik yüklemez.
// `@haksan/shared` alias'ı ve react/tailwind eklentileri kaybolmasın diye
// uygulama yapılandırması mergeConfig ile taban alınıyor.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Mevcut testlerin hiçbiri DOM istemiyor; jsdom gereksiz maliyet olurdu.
      // DOM gerektiren bir test yazılırsa dosya başına
      // `// @vitest-environment jsdom` docblock'u yeterli.
      environment: 'node',
      // Kökte mobilin React 19'u var; köke hoist edilen React Query ve Radix bileşenleri
      // inline edilmezse onu çözer ve web'in React 18'iyle "useState of null" verir.
      server: { deps: { inline: ['@tanstack/react-query', /@radix-ui\//] } },
      // src/** olmalı: apps/web/src/lib/apiClient.test.ts src/app dışında.
      include: ['src/**/*.test.{ts,tsx}'],
      // e2e/ Playwright'a ait; vitest oradan test toplarsa spec'ler patlar.
      exclude: ['**/node_modules/**', 'e2e/**', 'dist/**'],
      reporters: process.env.CI ? ['github-actions', 'default'] : ['default'],
    },
  }),
)
