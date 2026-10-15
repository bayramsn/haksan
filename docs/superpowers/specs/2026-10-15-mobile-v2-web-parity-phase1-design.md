# Mobile-v2 Web Paritesi — Aşama 1: Temel

- **Tarih:** 2026-10-15
- **Uygulama:** `apps/mobile-v2` (Expo SDK 54, React Native 0.81, Expo Router 6, NativeWind 4)
- **Durum:** Onaylandı (brainstorming), uygulama planı bekleniyor

## Program bağlamı

Hedef: `apps/mobile-v2`, web uygulamasının (`apps/web`) **işlev olarak birebir** karşılığı olacak —
aynı modüller, aynı alanlar, aynı aksiyonlar, aynı izin kuralları. Tasarım mobile özgü kalır
(alt sekme, kart, bottom sheet, FAB) ama renk, font ve marka dili web ile aynıdır.

Program altı aşamadan oluşur; her aşamanın kendi spec → plan → uygulama döngüsü vardır:

| Aşama | Kapsam |
|---|---|
| **1. Temel** (bu doküman) | Git kaydı, tema hizalaması, web↔mobil eşleşme tablosu |
| 2. Satış çekirdeği | Fırsat Kanban (C / B / A / A+), fırsat çalışma alanı, Hedefler, dashboard paritesi |
| 3. Mevcut ekranların paritesi | Firmalar, kontaklar, teklifler, finans, stok ekranlarındaki eksik alan ve aksiyonlar |
| 4. Servis | Servis Kanban, makineler, satış/servis fiyat listesi ayrımı |
| 5. Belge ve satış destek | Proformalar, sözleşmeler, referanslar, fuar |
| 6. Yönetim | Kullanıcılar, roller, departmanlar, ayarlar, Meta Merkezi |

### Program genelinde değişmez kurallar

1. **Web koduna dokunulmaz.** `apps/web` altında hiçbir dosya değişmez.
2. **API sözleşmesi değişmez.** Mobil, web'in kullandığı aynı REST API'yi (`{origin}/api/v1`)
   aynı istek gövdeleriyle çağırır. Bu programda `apps/api` değiştirilmez; bir aksiyon için API
   eksikse eşleşme tablosunda işaretlenir ve ayrı karar olarak kullanıcıya sorulur.
3. **İzinler web ile aynıdır.** Modül görünürlüğü web'in `Layout.tsx` içindeki izin ve departman
   eşlemesini ve `tenant.hiddenNavigationKeys` değerini izler.
4. **Canlı sunucuda yalnız okuma.** Mobil `.env` içindeki `EXPO_PUBLIC_API_URL`
   (`https://crm.52-28-67-148.sslip.io/api/v1`) canlı veridir. Geliştirme sırasında bu sunucuya
   kayıt oluşturan, değiştiren veya silen istek gönderilmez. Yazma aksiyonları birim testleri,
   web ile aynı gövdeyi doğrulayan sözleşme testleri ve gerekirse yerel API ile doğrulanır.
5. **Secret'lar git'e girmez.** `.env` zaten git dışında; yalnız `EXPO_PUBLIC_*` değerleri istemciye
   gömülür ve bunlar secret değildir.

## Bölüm 1 — Git kaydı ve tema hizalaması

### 1.1 Mevcut durumun kayıt altına alınması

`apps/mobile-v2` şu an git'te tamamen izlenmiyor; değişiklikler geri alınamaz durumda.

- `.gitignore`'a eklenecekler:
  - `apps/mobile-v2/ios/` — Expo `app.config.ts`'ten yeniden üretir (`expo prebuild` /
    `expo run:ios`). İçindeki `Pods/` tek başına 930 MB.
  - `apps/mobile-v2/Archive 3/` — ChatGPT mockup görselleri (89 MB). Silinmez, yalnız git dışında kalır.
- Commit öncesi `git add --dry-run apps/mobile-v2` çıktısı kontrol edilir: `node_modules*`,
  `.env`, `ios/`, `Archive 3/`, `.expo/` ve 1 MB üstü dosya olmamalı.
- Tek commit: `chore(mobile-v2): mevcut durumu kayıt altına al`. Commit yalnız `.gitignore` ve
  `apps/mobile-v2/**` içerir; `apps/api` içindeki commit edilmemiş kullanıcı değişikliklerine dokunulmaz.

### 1.2 Tema hizalaması (yalnız mobil)

Web'in ana rengi lacivert, mobilin ana rengi kırmızı. Karar: **mobil web'e uyar.**

`apps/mobile-v2/theme.config.js` değişiklikleri (web `apps/web/src/styles/theme.css` değerleri):

| Token | Şu an (mobil) | Yeni (web ile aynı) |
|---|---|---|
| `primary` (açık) | `#cf060c` | `#000c69` |
| `primaryForeground` (açık) | `#ffffff` | `#ffffff` |
| `secondary` (açık) | `#fdecec` | `#eef1ff` |
| `secondaryForeground` (açık) | `#b71c1c` | `#000c69` |
| `canvas` (açık) | `#ffffff` | `#f4f6f8` |
| `chart1` (açık) | `#d32f2f` | `#2a3aa0` |
| `primary` (koyu) | `#ef5350` | `#8fa2ff` |
| `primaryForeground` (koyu) | `#2a0a0a` | `#0a1030` |
| `secondary` (koyu) | `rgba(239, 83, 80, 0.16)` | `rgba(125, 143, 251, 0.16)` |
| `secondaryForeground` (koyu) | `#ffcdd2` | `#c7d2ff` |
| `chart1` (koyu) | `#ef5350` | `#8fa2ff` |

- Koyu `canvas` (`#070b18`) zaten web ile aynı, değişmez.
- `destructive`, `brandRed` kırmızı kalır. Kırmızı yalnız marka detayı ve tehlikeli aksiyon
  (sil, iptal, "Acil") için kullanılır.
- Web'de karşılığı olmayan mobil token'lar (`stage`, `operationBlue` vb.) değişmez.
- `npm run gen:css` ile `global.css` yeniden üretilir.
- Sabit kırmızılar token'a bağlanır: `src/ui/index.tsx` FAB gölgesi (`#d32f2f` → `colors.primary`),
  `src/features/company-map/leaflet-web.css` (`#cf060c` → lacivert).
- **Başlık fontu:** Ekran ve bölüm başlıkları Barlow Condensed 600–700 (`font-display`,
  `font-display-semibold`); gövde Inter kalır. Değişiklik ortak bileşenlerde (`ScreenHeader`,
  bölüm başlığı / `Eyebrow` vb.) yapılır, ekranlara tek tek dokunulmaz.
- **Seçili durumlar** (filtre pili, aktif sekme, detay sekmesi alt çizgisi, FAB, odak halkası)
  `primary` token'ını kullandığı için otomatik laciverte döner; `primary` dışında kırmızı sabitlenmiş
  bir seçili durum bulunursa token'a bağlanır.
- `apps/mobile-v2/DESIGN.md` güncellenir: "Ana renk lacivert `#000c69`; kırmızı yalnız marka
  detayı ve tehlikeli aksiyon. Başlık Barlow Condensed, gövde Inter."

### 1.3 Doğrulama

- `npm --workspace @haksan/mobile-v2 run typecheck` ve `run test` geçer.
- iOS simülatörde önce/sonra ekran görüntüsü: giriş, dashboard, firma listesi, firma detayı,
  yeni firma modalı, modüller ekranı. Açık ve koyu tema.
- Kontrol: hiçbir birincil buton, aktif sekme veya filtre pili kırmızı kalmamış; sil/iptal
  aksiyonları kırmızı kalmış; başlıklar Barlow Condensed.

## Bölüm 2 — Web ↔ mobil eşleşme tablosu

### 2.1 Amaç

Aşama 2–6'nın iş listesini üreten tek kaynak: `docs/mobile-v2/web-parity.md`.

### 2.2 Mevcut altyapının yeniden kullanımı

`scripts/audit-action-parity.mjs` web ↔ **eski** `apps/mobile` için zaten şunu yapıyor:
API controller'larından uç nokta + izin envanteri, `apps/web/src/lib/services.ts`'ten web
aksiyonları (servis.metot → HTTP metodu + yol), web sayfalarındaki çağrılar. Çıktıları:
`docs/web-action-registry.{json,md}`, `docs/mobile-parity-gaps.md` (son üretim 2026-09-25;
416 uç nokta, 333 web aksiyonu).

`mobile-v2` servis.metot düzeni kullanmıyor; `src/api/endpoints.ts` içinde
`request('/companies/${id}', { method: 'PATCH' })` biçiminde çağırıyor. Bu yüzden:

- Script'e `--target=mobile-v2` seçeneği eklenir. Bu modda mobil taraf, `apps/mobile-v2/src/api/**/*.ts`
  içindeki `request(...)` çağrılarından **HTTP metodu + normalize yol** (`${...}` → `:param`)
  olarak çıkarılır ve web aksiyonlarının metot + yol değeriyle eşlenir.
- Varsayılan mod (eski `apps/mobile`) ve mevcut çıktı dosyaları değişmez.
- `mobile-v2` modunun çıktıları: `docs/mobile-v2/web-action-coverage.json` ve
  `docs/mobile-v2/web-action-coverage.md` (web aksiyonu başına: metot, yol, izin, mobilde var/yok,
  hangi web sayfalarından çağrıldığı).
- Script hiçbir sunucuya istek atmaz; yalnız kaynak kodu okur. Her aşama sonunda yeniden
  çalıştırılıp "web aksiyonlarının %X'i mobilde" ölçümü alınır.

### 2.3 Sayfa bazlı aksiyon listesi (`docs/mobile-v2/web-parity.md`)

Web'deki her `NavKey` sayfası (`apps/web/src/app/App.tsx` içindeki `TITLES` ve switch) için:

| Alan | İçerik |
|---|---|
| Web sayfası | NavKey, başlık, web bileşeni dosyası |
| Mobil karşılık | `app/...` ekran yolu veya "yok" |
| Görünümler | liste / kanban / harita / takvim / detay sekmeleri |
| Alanlar ve filtreler | listede ve detayda gösterilen ana alanlar, filtreler, arama |
| Aksiyonlar | oluştur, düzenle, durum değiştir, sil, PDF, mail, dosya ekle… ve karşılık gelen web aksiyon anahtarı |
| İzin | web izin anahtarı ve departman kısıtı |
| Durum | **Tam**, **Eksik** (eksikler madde madde) veya **Yok** |
| Aşama | 2–6 |

Kapsam dışı (yalnız not olarak geçer): web'e özgü masaüstü davranışları (kompakt/rahat görünüm,
`localStorage` anahtarları, klavye kısayolları). PDF üretimi sunucuda; mobil yalnız açar/paylaşır.

### 2.4 Doğrulama

- Script'in `mobile-v2` modu için `node --test` testi: küçük bir sahte `endpoints.ts` girdisinden
  (şablon string'li yol, POST/PATCH/DELETE) doğru metot + yol çıkarılır ve bilinen bir web
  aksiyonuyla eşlenir.
- Varsayılan modun çıktısı değişmemeli: script eski modda çalıştırıldığında
  `docs/web-action-registry.json` ve `docs/mobile-parity-gaps.md`, `generatedAt` alanı ve
  aradaki API değişiklikleri dışında aynı kalır.
- Tablodaki "Tam" işaretlerinden en az 5 örnek ekran canlı API'ye karşı **yalnız okuma** ile
  simülatörde kontrol edilir.

## Teslimatlar

1. `.gitignore` güncellemesi + `apps/mobile-v2` başlangıç commit'i.
2. Lacivert tema + Barlow Condensed başlıklar + güncel `apps/mobile-v2/DESIGN.md`.
3. `scripts/audit-action-parity.mjs --target=mobile-v2` + testi.
4. `docs/mobile-v2/web-action-coverage.{json,md}` ve `docs/mobile-v2/web-parity.md`.
5. Aşama 2–6 için önceliklendirilmiş eksik listesi (eşleşme tablosunun "Aşama" sütunu).
