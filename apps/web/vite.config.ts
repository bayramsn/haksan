import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
      // Paylaşılan paketi kaynak kodundan çöz: backend (dist) ile aynı
      // mantığı (örn. kurulum ücreti hesabı) tek yerden paylaşır, HMR çalışır.
      '@haksan/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // Geliştirmede API'yi aynı origin üzerinden sun. Böylece uygulama
  // localhost, 127.0.0.1 veya yerel ağ adresinden açıldığında CORS/cookie
  // davranışı değişmez; production'da aynı yolları nginx yönlendirir.
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'ws://127.0.0.1:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },

  build: {
    // MANUEL PARÇALAMA BİLEREK YOK.
    //
    // Burada `manualChunks` ile recharts ve leaflet ayrı "vendor" parçalarına
    // konuyordu; gerekçe önbellekti (bu bağımlılıklar nadiren değişir). Ölçünce
    // tam tersini yaptığı görüldü: `index.html` vendor-charts'ı `modulepreload`
    // ile İLK BOYAMADA indiriyordu — grafiği hiç açmayacak kullanıcı da ~574 kB
    // ödüyordu. Sebep: `ui/chart.tsx` birden çok lazy sayfada kullanıldığı için
    // Rollup onu ortak ata olan giriş paketine hoist ediyor, o modül de
    // recharts'ı statik import ediyor. Fonksiyon biçimi de bunu değiştirmiyor
    // (denendi, aynı sonuç).
    //
    // Rollup kendi başına böldüğünde recharts async parçalara düşüyor ve ilk
    // boyamadan tamamen çıkıyor. Ölçüm (ham bayt, ilk boyamada inen JS):
    //   eager sayfalar + manualChunks : 2.196 kB
    //   lazy sayfalar + manualChunks  : 1.681 kB
    //   lazy sayfalar, manualChunks yok:  1.250 kB
    // Bedeli: vendor kodu ana pakette olduğu için her deploy onu geçersiz kılar.
    // İlk yük kazancı bu önbellek maliyetinden büyük olduğu için tercih edildi.
  },
})
