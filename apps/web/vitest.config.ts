import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'
import { createRequire } from 'node:module'
import path from 'node:path'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
function moduleEntry(name: string): string {
  const manifest = require.resolve(`${name}/package.json`)
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
  return path.resolve(path.dirname(manifest), pkg.module ?? pkg['jsnext:main'] ?? pkg.main)
}
const lucideEsm = path.resolve(path.dirname(require.resolve('lucide-react/package.json')), 'dist/esm/lucide-react.js')

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
      // SSR chooses lucide's CommonJS main, whose require('react') bypasses
      // Vite dedupe. Test the same ESM browser entry used by the shipped app.
      alias: [
        { find: /^lucide-react$/, replacement: lucideEsm },
        ...['react-remove-scroll', 'react-remove-scroll-bar', 'react-style-singleton', 'use-sidecar', 'use-callback-ref'].map(name => ({ find: new RegExp(`^${name}$`), replacement: moduleEntry(name) })),
        { find: /^react\/jsx-runtime$/, replacement: path.resolve(__dirname, 'node_modules/react/jsx-runtime.js') },
        { find: /^react\/jsx-dev-runtime$/, replacement: path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js') },
      ],
      // Hoist edilen React Query de web'in React kopyasıyla çalışmalı.
      server: { deps: { inline: [
        '@tanstack/react-query',
        // Hoisted UI libraries otherwise execute in Node and resolve the native
        // workspace's React 19, bypassing Vite's web React 18 dedupe resolver.
        /@radix-ui\//,
        /@floating-ui\//,
        'cmdk',
        'lucide-react',
        /\/react-(?!dom\/)/,
        'use-sync-external-store',
        /\/use-(?:sidecar|callback-ref)\//,
      ] } },
      // src/** olmalı: apps/web/src/lib/apiClient.test.ts src/app dışında.
      include: ['src/**/*.test.{ts,tsx}'],
      // e2e/ Playwright'a ait; vitest oradan test toplarsa spec'ler patlar.
      exclude: ['**/node_modules/**', 'e2e/**', 'dist/**'],
      reporters: process.env.CI ? ['github-actions', 'default'] : ['default'],
    },
  }),
)
