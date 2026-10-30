# Haksan Mobil — Tasarım Dahil Mega Prompt

> **Kullanım notları**
>
> Bu belge, Haksan CRM native mobil uygulaması (Android Compose + iOS SwiftUI) için tek parça tasarım ve geliştirme brief'idir. Aşağıdaki **MEGA PROMPT** bloğunu olduğu gibi kopyalayıp hedef araca yapıştırın.
>
> | Araç | Nasıl kullanılır |
> |------|------------------|
> | **Stitch / Google AI tasarım** | Tüm MEGA PROMPT bloğunu yapıştırın. Önce Bölüm 2 (design system) + Bölüm 3 (shell), sonra Bölüm 4'ten modül modül ekran isteyin. Frame: 390×844 (Android) ve 393×852 (iOS). |
> | **Figma / FigJam** | Bölüm 2 token tablosundan variables oluşturun. Bölüm 10 checklist'i deliverable olarak takip edin. Web referans görselleri için `screenshots/haksan-web-full/` klasörünü import edin. |
> | **Cursor / Claude Code agent** | MEGA PROMPT + `apps/mobile/` repo bağlamını verin. `packages/shared` OpenAPI codegen client kullanımını zorunlu kılın. |
> | **İnsan tasarımcı** | Bölüm 4 ekran envanteri = kapsam sözleşmesi. Bölüm 11 çapraz referans tablosu = web parity kontrol listesi. |
>
> **Referans görseller:** `screenshots/haksan-web-full/` (135 PNG, desktop 1440×900)  
> **Web design tokens:** `apps/web/src/styles/theme.css`  
> **Mobil modül kaydı:** `apps/mobile/src/navigation/modules.ts`  
> **Mobil kod:** `apps/mobile/` (Expo)

---

## MEGA PROMPT (kopyala-yapıştır başlangıcı)

---

### BÖLÜM 0 — Rol ve çıktı beklentisi

```
Sen Haksan CRM için kıdemli mobil ürün tasarımcısı ve native mobil mimarısın.
Hedef: Web CRM ile tam işlevsel pariteye sahip, premium kalitede, saha kullanımına uygun
native mobil uygulama tasarımı + ekran spesifikasyonları üret.

Platformlar:
- **Mobil:** Expo + React Native + expo-router (iOS / Android, Expo Go ile geliştirme)

Mevcut kod tabanı:
- apps/mobile — Login, Gösterge Paneli, modül hub'ları, Firmalar listesi (API)
- API: packages/shared OpenAPI codegen → Retrofit (Android) / generated Swift client (iOS)
- Auth: Bearer token + cookie refresh, X-Active-Division header

Çıktı formatı:
1) Design System (token tablosu)
2) Global navigation & shell
3) Ekran envanteri (her ekran: amaç, layout, bileşenler, durumlar, geçişler)
4) Dialog/sheet/bottom-sheet envanteri
5) Rol bazlı görünürlük matrisi
6) Platform farkları (Android call assistant vs iOS kısıtı)
7) Android Compose + iOS SwiftUI implementasyon notları
8) Erişilebilirlik, performans, offline davranış kuralları

Dil: Türkçe UI metinleri. Kod/yorum İngilizce olabilir.
Kalite: Generic "AI slop" CRM şablonu DEĞİL — Haksan marka kimliğine sadık, yoğun veri ekranlarında okunabilirlik öncelikli.
```

---

### BÖLÜM 1 — Ürün bağlamı

```
Haksan CRM: B2B satış + operasyon + servis + finans yönetim platformu.
Kullanıcılar: satış temsilcileri, servis teknisyenleri, stok/lojistik, muhasebe, yöneticiler.

Mobil kullanım senaryoları:
- Saha ziyareti sırasında firma/kontak/satış kartı görüntüleme ve hızlı aktivite ekleme
- Servis talebi açma, makine dosyası inceleme, şikayet kaydı
- Teklif/proforma durumu kontrol, onay bekleyen işlemler
- Ödeme/vade takibi, cari bakiye sorgulama
- Takvim + (Android) gelen arama sonrası CRM aksiyon önerisi
- Anlık sohbet ve bildirimler

Web referans: 30+ modül, state-based nav (NavKey), rol/departman bazlı menü filtreleme.
Mobil web responsive sürümü desktop-first; mobil native ayrı ürün deneyimi olmalı.
```

---

### BÖLÜM 2 — Marka ve tasarım sistemi

Web token kaynağı: `apps/web/src/styles/theme.css`. Mobil'e birebir taşınacak değerler:

| Token | Değer | Mobil kullanım |
|-------|-------|----------------|
| Primary / brand-blue | `#000c69` | CTA, aktif tab, link, header vurgu |
| Destructive / brand-red | `#cf060c` | Sil, red, kritik uyarı |
| brand-dark | `#0a192f` | Dark mode primary text on accent |
| brand-blue-soft | `#eef2ff` | Chip, seçili satır, ikon arka planı |
| brand-red-soft | `#fef2f2` | Hata banner arka planı |
| Canvas / shell | `#f7f7f8` | Ekran arka planı (içerik alanı) |
| Card | `#ffffff` | Kart, sheet, liste satırı |
| muted-foreground | `#717182` | İkincil metin, placeholder |
| input-background | `#f3f3f5` | TextField arka planı |
| border | `rgba(0,0,0,0.1)` | Ayırıcılar |
| radius | `10px` (0.625rem) | Kart, buton, input |
| Base font | 16px, medium 500 | Body; başlıklar tracking-tight |

**Tipografi ölçeği (mobil)**

| Rol | Boyut | Ağırlık | Not |
|-----|-------|---------|-----|
| Screen title | 22px | medium (500) | -0.02em tracking |
| Section title | 17px | semibold (600) | |
| Body | 15–16px | regular (400) | |
| Caption / meta | 12–13px | regular | muted renk |
| KPI büyük rakam | 28–32px | semibold | tabular-nums |

**Bileşen kütüphanesi (tasarım dili)**

- **Primary button:** dolu `#000c69`, 44pt min touch height, 10px radius, beyaz metin
- **Secondary button:** soft blue bg `#eef2ff`, primary text
- **Ghost / icon button:** 44×44 minimum touch target
- **Badge / Status:** web `StatusBadge` renk haritasıyla uyumlu (satış aşaması, servis durumu, ödeme durumu)
- **Card:** white, 1px border veya hafif shadow (iOS: subtle shadow; Android: elevation 1–2dp)
- **List row:** 56–72px yükseklik, sol avatar/ikon, orta başlık+alt metin, sağ chevron veya aksiyon
- **Empty state:** ikon + başlık + kısa açıklama + primary CTA
- **Skeleton:** muted shimmer, liste/kart yer tutucu
- **Chip filter:** yatay scroll, seçili = brand-blue-soft arka plan
- **Segmented control:** detay sayfa sekmeleri için (iOS native / Android Material segmented button row)
- **FAB:** primary renk, sağ alt veya liste içi sticky CTA (tek elle erişim)

**Dark mode**

- Primary lightens to `#60a5fa`
- Background: `oklch(0.145 0 0)` (~#252525)
- Kartlar: koyu yüzey, border `oklch(0.269 0 0)`
- Kontrast: WCAG AA minimum

**İkonografi**

- Web: Lucide React
- iOS: SF Symbols (semantik eşleşme)
- Android: Material Symbols Outlined
- Nav ikonları web sidebar ile aynı anlamda olmalı (dashboard, building, users, kanban, wrench, vb.)

**Spacing scale (8pt grid)**

- xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 32px
- Ekran yatay padding: 16px (compact), 20px (regular)
- Kart iç padding: 16px
- Section arası: 24px

---

### BÖLÜM 3 — Global mobil mimari

```
App Shell
├── TopBar (geri / başlık / aksiyonlar)
├── Content (scrollable, bg #f7f7f8)
└── BottomTabBar (5 sekme, rol bazlı)

Her tab → NavigationStack (iOS) / NavHost (Android)
  ListScreen → DetailScreen → FormSheet / FullScreenForm
```

**Bottom tab bar (5 sekme)** — rol bazlı içerik değişir:

| Sekme | İçerik | NavKey / modül |
|-------|--------|----------------|
| Ana | Dashboard KPI, onaylar, bugünkü takvim, hızlı aksiyonlar | `dashboard` |
| Satış | Firmalar, Kontaklar, Satış Kartları, Teklifler hub | `customers`, `contacts`, `sales-cases`, `offers` |
| Operasyon | Stok, Ödemeler, Vade (finance/stock rolü) | `stock`, `payments`, `due-dates` |
| Servis | Servis Talepleri, Makineler, Servis Kanban | `service-requests`, `machines`, `service-kanban` |
| Daha Fazla | Modül grid: Genel, kalan modüller, Yönetim | tüm `MODULE_GROUPS` |

**Top bar pattern**

- Sol: geri ok (stack içinde) veya hamburger (modül hub'da)
- Orta: ekran başlığı + opsiyonel alt başlık (ör. firma adı, 1 satır truncate)
- Sağ: arama, filtre, bildirim zili (badge), profil avatar

**Overlay pattern (web dialog → mobil)**

| Web pattern | Mobil karşılık |
|-------------|----------------|
| Center dialog (kısa form, ≤6 alan) | Bottom sheet, max %90 yükseklik, swipe-to-dismiss |
| Center dialog (uzun form) | Full-screen push + sticky footer CTA |
| Onay / uyarı | Native alert / confirmation dialog |
| Dosya önizleme | Full-screen modal + paylaş / indir toolbar |
| Kanban kart menüsü | Long-press context menu veya bottom action sheet |
| Command palette (⌘K) | Full-screen search overlay |
| User dropdown | Profil bottom sheet |
| Table row action menu | Swipe actions veya trailing "..." menu |

**Arama**

- Global: top bar search icon → full-screen overlay (firmalar, kontaklar, satış kartları, birleşik sonuç)
- Liste içi: sticky search bar + yatay chip filtreler

**Hızlı oluştur (+)**

- Top bar "+" veya FAB → bottom sheet 2 sütun grid:
  - Yeni Firma, Yeni Kontak, Yeni Satış Kartı, Yeni Teklif, Yeni Servis Talebi, Yeni Hareket
  - Rol bazlı: kullanıcının göremediği tile'lar listede yok (disabled değil)

**Gestures**

- Liste → detay: tap → push navigation
- Detay sekmeler: segmented control + yatay swipe (HorizontalPager / TabView page style)
- Kanban: yatay scroll kolonlar; kart drag-and-drop (v2, opsiyonel)
- Pull-to-refresh: tüm liste ekranlarında
- Swipe-to-delete / archive: onaylar, bazı liste satırları

---

### BÖLÜM 4 — Ekran envanteri (web paritesi)

Her ekran için tasarlanacak durumlar: **loading**, **empty**, **error**, **populated**, **filtered**, **offline/cache** (uygunsa).

#### 4.1 Kimlik doğrulama

| Ekran | Web referans | Mobil tasarım |
|-------|--------------|---------------|
| Login | `login/00-main.png` | Logo üstte, email + şifre, "Giriş Yap" primary, klavye safe area, şifre göster/gizle |
| Şifremi unuttum | `login/01-forgot-password-dialog.png` | Bottom sheet veya secondary ekran |
| Oturum süresi doldu | — | Banner/snackbar + login'e yönlendir |
| Biyometrik (v2) | — | Face ID / Touch ID / fingerprint hızlı giriş |

#### 4.2 Ana kabuk ve global

| Ekran | Web referans | Mobil notlar |
|-------|--------------|--------------|
| Hızlı oluştur | `layout/01-quick-create.png`, `quick-create-*.png` | 2 sütun tile grid sheet |
| Yardım merkezi | `layout/02-help-center.png` | FAQ accordion, arama |
| Komut paleti | `layout/03-command-palette.png` | Full-screen search + sonuç listesi |
| Bildirimler | `layout/04-notifications.png` | Liste, okundu işareti, tap → deep link |
| Kullanıcı menüsü | `layout/05-user-menu.png` | Profil sheet: Raporlar, Yönetim alt menü, Çıkış |
| Manuel PBX | `layout/07-manual-pbx.png` | Numara girişi + arama kaydı (Android öncelikli) |
| Onaylar | `layout/08-approvals.png` | Liste, swipe onayla/reddet |
| Bölüm seçici | layout header | Chip veya bottom sheet |
| Android Arama Asistanı | `apps/mobile/README.md` | Öneri listesi + bildirim aksiyonları (iOS'ta yok) |

#### 4.3 Genel modüller

| Modül | NavKey | Sekmeler | Dialoglar / sheetler |
|-------|--------|----------|----------------------|
| Gösterge Paneli | `dashboard` | Özet, Operasyon, Grafikler, Hedefler | — |
| Sohbet | `chat` | Kanal/DM listesi | Yeni sohbet, Yeni grup |
| Takvim | `calendar` | Gün, Hafta, Ay, Liste | Yeni etkinlik |

#### 4.4 Satış modülleri

| Modül | NavKey | Liste / görünüm | Detay | Dialoglar |
|-------|--------|-----------------|-------|-----------|
| Firmalar | `customers` | Tümü, Müşteri, Tedarikçi, Tedarikçi-Müşteri | Tam sayfa detay | Yeni firma, Görüntüle/Düzenle |
| Firma detay | (overlay) | 5 sekme | Geçmiş, Satış Kartları, Aktivite, Cari, Makineler | Yeni Kart, Ziyaret, Arama |
| Kontaklar | `contacts` | Tümü, Birincil | Kontak detay | Yeni kontak |
| Satış Kartları | `sales-cases` | Liste + Kanban toggle | Zaman Çizelgesi, Teklifler, Dokümanlar, Ödemeler | Yeni kart, Aktivite ekle, Yeni teklif, Yükle |
| Firma Haritası | `sales-map` | Harita + pinler | Pin bottom sheet özet | — |
| Teklifler | `offers` | Tümü, Taslak, Gönderilen, Onaylı, Reddedilen | Teklif detay | Yeni teklif, Muhasebe faturası |
| Proformalar | `proformas` | Dosya listesi | Önizleme full-screen | Proforma yükle |
| Sözleşmeler | `contracts` | Dosya listesi | Önizleme full-screen | Sözleşme yükle |
| Dokümanlar | `documents` | Dosya listesi | Önizleme full-screen | Yükle |
| Satış Fiyat Listesi | `sales-price-list` | Kategori sekmeleri | Satır detay sheet | — |

#### 4.5 Operasyon modülleri

| Modül | NavKey | Özellikler |
|-------|--------|------------|
| Ürünler | `products` | Liste, arama, Yeni ürün, İçe aktar (v2) |
| Stok | `stock` | Hazır, Rezerve, Satılan, Pasif sekmeleri, Yeni stok |
| Satın Alma | `purchase-orders` | Sipariş listesi, Yeni sipariş |
| Ödemeler & Kasa | `payments` | Alınan / Ödenen, Yeni hareket, Muhasebe faturası |
| Muhasebe Faturaları | `accounting-invoices` | Liste, Yeni fatura |
| Cari Rapor | `customer-balances` | Bakiye listesi → ekstre sheet (satır tap) |
| Vade Takvimi | `due-dates` | Takvim + liste görünümü toggle |
| Sevkiyat | `shipments` | Liste, Yeni sevkiyat |
| Teslimat | `deliveries` | Liste, Yeni teslimat |
| Kurulum | `installations` | Liste, Yeni kurulum |

#### 4.6 Servis modülleri

| Modül | NavKey | Özellikler |
|-------|--------|------------|
| Makineler | `machines` | Liste, Yeni makine, makine detay |
| Servis Talepleri | `service-requests` | Liste, Servis Akışı, Şikayet Kutusu | Detay: Özet, Makine Dosyası, Garanti/RMA, Müşteri İletişim, Not Geçmişi | Yeni talep, Yeni şikayet, Public Link |
| Servis Kanban | `service-kanban` | Yatay kolon kanban |
| Servis Fiyat Listesi | `service-price-list` | Yedek Parça, İşçilik sekmeleri |

#### 4.7 Yönetim (admin / super_admin)

| Modül | NavKey | Mobil kapsam |
|-------|--------|--------------|
| Kullanıcılar | `users` | Liste, Kullanıcı ekle, Rol ata (sheet) |
| Roller & Yetkiler | `roles` | Liste, Yeni rol |
| Departmanlar | `departments` | Liste, Yeni departman |
| Ayarlar | `settings` | Profil, bildirim, takvim sync, bölüm tercihleri |

#### 4.8 Raporlar

| Modül | NavKey | Mobil kapsam |
|-------|--------|--------------|
| Raporlar | `reports` | Operasyonel, Karlılık (Yıl Sonu), Analitik & Excel modları — özet KPI kartları; ağır Excel export → paylaşım sheet veya web deep link |

---

### BÖLÜM 5 — Kritik ekran wireframe talimatları

#### Firma detay (hero pattern)

```
┌─────────────────────────────────┐
│ ←  Firma Adı              ⋮    │
│     [Müşteri badge]             │
│  [Ara] [E-posta] [Yeni Kart]    │
├─────────────────────────────────┤
│ Geçmiş | Satış | Aktivite | ... │  ← segmented tabs
├─────────────────────────────────┤
│                                 │
│  (sekme içeriği — scroll)       │
│                                 │
└─────────────────────────────────┘
```

- **Geçmiş:** dikey timeline, tarih gruplu (Bugün, Dün, Bu hafta)
- **Satış Kartları:** compact kart listesi (aşama badge, tutar, tarih)
- **Aktivite:** timeline + alt FAB veya sticky bar (Ziyaret / Arama)
- **Cari:** bakiye KPI üstte (borç/alacak), hareket listesi altta
- **Makineler:** cihaz kartları (model, seri no, garanti durumu)

#### Satış kartı detay

- Üst kart: aşama badge (renkli), firma adı (tap → firma detay), tutar, sorumlu avatar
- Sekmeler: Zaman Çizelgesi / Teklifler / Dokümanlar / Ödemeler
- Zaman Çizelgesi: aktivite kartları kronolojik, altta sticky "Aktivite Ekle"
- Teklifler: teklif satırları + "Yeni Teklif"
- Dokümanlar: dosya listesi + "Yükle" (kamera / dosya)
- Ödemeler: taksit / ödeme özeti listesi

#### Servis talebi detay

- Üst: durum stepper (yatay scroll, aktif adım vurgulu)
- Makine bilgi kartı (model, seri, lokasyon)
- Sekmeler: Özet, Makine Dosyası, Garanti/RMA, Müşteri İletişim, Not Geçmişi
- Not Geçmişi: chat-benzeri balonlar (iç not vs müşteri mesajı ayrımı)
- Alt CTA: durum güncelle / not ekle

#### Kanban (satış + servis)

- Yatay scroll kolonlar, kolon başlığı + sayı badge
- Kart: başlık, firma, tutar veya öncelik, avatar stack (atananlar)
- Tap → detay push; long press → aksiyon sheet (aşama değiştir, ata, arşivle)

#### Liste sayfası (genel pattern)

```
┌─────────────────────────────────┐
│ ←  Modül Adı          🔍  +    │
├─────────────────────────────────┤
│ [Ara...]                        │
│ [Tümü] [Filtre1] [Filtre2] →   │  ← chip scroll
├─────────────────────────────────┤
│ ┌─ row ─────────────────────┐ │
│ │ icon  Başlık          ›    │ │
│ │       Alt metin             │ │
│ └─────────────────────────────┘ │
│ ...                             │
└─────────────────────────────────┘
```

---

### BÖLÜM 6 — Rol ve izin matrisi

Kaynak: `apps/mobile/src/navigation/modules.ts` → `canSeeModule()`

| Rol | Erişim |
|-----|--------|
| `super_admin`, `admin` | Tüm modüller + Yönetim grubu |
| `readonly` | Yönetim hariç tüm modüller (formlar salt okunur, CTA gizli veya disabled) |
| `sales` | Satış modülleri + paylaşılan Genel |
| `service` | Servis modülleri + firmalar/kontaklar (roles dizisine göre) |
| `finance` | Finans modülleri + teklifler/proformalar/sözleşmeler |
| `stock` | Stok, sevkiyat, teslimat, ürünler, makineler |

**Kurallar**

- Gizli modül: bottom tab ve Daha Fazla grid'den **tamamen kaldır** (gri disabled gösterme)
- Yönetim grubu (`users`, `roles`, `departments`, `settings`): yalnız admin/super_admin
- Hızlı oluştur tile'ları da aynı `canSeeModule` mantığıyla filtrelenir

---

### BÖLÜM 7 — Platform farkları

| Özellik | Android | iOS |
|---------|---------|-----|
| Call assistant + call log | Evet — izin akışı (phone, call log, notification), foreground service, `POST /mobile/calls/events` | Hayır — UI'da sekme veya menü öğesi gösterme |
| Calendar sync (cihaz ↔ CRM) | Evet — 6 ay geçmiş/gelecek pencere | Evet — EventKit izinleri |
| Push bildirimler | FCM | APNs |
| Dosya yükleme | Storage Access Framework + kamera intent | PHPicker + UIImagePicker |
| Biyometrik giriş | v2 — BiometricPrompt | v2 — LocalAuthentication |
| Geri navigasyon | System back + top bar geri | Swipe-from-edge + top bar geri |
| Harita | Google Maps veya OSM tile | MapKit |
| Minimum OS | API 24 (Android 7) | iOS 16 |

---

### BÖLÜM 8 — Teknik implementasyon notları

#### Android (Jetpack Compose)

**Mevcut ekranlar:** `LoginScreen`, `HomeScreen`, `CompaniesScreen`, `ContactsScreen`, `OpportunitiesScreen`

**Genişletme planı**

- `NavHost` route'ları `Modules.kt` `MODULE_GROUPS` ile birebir eşleşsin
- `MaterialTheme(colorScheme = haksanColorScheme())` — token tablosundan
- Liste: `LazyColumn` + `pullRefresh` + pagination (scroll sonu load more)
- Detay sekmeler: `HorizontalPager` + `ScrollableTabRow`
- Form: `ModalBottomSheet` (kısa) veya tam ekran `Scaffold` + sticky `BottomAppBar` CTA
- API: `:api-client` Retrofit; 401 → cookie `/auth/refresh` tek retry; `X-Active-Division` header
- State: ViewModel + `StateFlow`; ağır listeler için paging library

#### iOS (SwiftUI)

**Mevcut ekranlar:** `RootView`, `OpportunitiesView`, Login

**Genişletme planı**

- `TabView` (5 sekme) + her tab için `NavigationStack`
- `Color` extension: `HaksanColor.primary`, `.brandBlueSoft`, vb.
- Form: `.sheet` + `.presentationDetents([.medium, .large])`
- Liste: `List` veya `LazyVStack` + `.refreshable`
- Detay sekmeler: `Picker` segmented + `TabView` page style veya custom
- API: `HaksanApi` generated client; aynı auth/refresh/division header mantığı

#### Ortak kurallar

- Endpoint'leri elle yazma — `npm --workspace @haksan/shared run codegen` ile üretilen client kullan
- `pageSize` max **200** (API clamp)
- Optimistic UI: yalnızca düşük riskli aksiyonlarda (okundu işareti, basit toggle)
- Hata mesajları: Türkçe, actionable ("Tekrar dene" butonu)
- Offline: salt okunur cache (son görüntülenen firma/kart) v2; v1 online-only kabul edilebilir
- Deep link şeması: `haksan://{module}/{id}` (bildirimlerden)

---

### BÖLÜM 9 — Kalite kriterleri ve anti-pattern

**Yapılacak**

- 44pt minimum dokunma alanı (Apple HIG / Material)
- Tek elle kullanım: primary CTA alt yarıda, FAB sağ alt
- Yoğun web tabloları → mobil kart / liste satırı dönüşümü (max 3 veri noktası satır başına)
- Tutarlı loading skeleton (shimmer)
- Web ekran görüntülerindeki iş akışı sırasını koru (aynı alan adları, aynı sekme isimleri)
- Safe area: notch, home indicator, klavye
- Dynamic type / font scaling desteği (iOS); font scale (Android) — layout kırılmamalı

**Yapılmayacak**

- Desktop 260px sidebar'ı mobilde küçültmek
- 12 sütunlu horizontal scroll tablo
- Generic mavi-mor gradyan "AI CRM" estetiği
- Her dialog'u center modal yapmak (formlar bottom sheet olmalı)
- Hamburger içinde 30+ düz liste öğesi (gruplu grid veya tab hub kullan)
- Primary rengi `#3b82f6` gibi generic mavi ile değiştirmek

---

### BÖLÜM 10 — Teslim checklist (tasarım çıktısı)

Tasarım aracından beklenen deliverable:

- [ ] Design tokens sayfası (light + dark, tüm tablo değerleri)
- [ ] Component library (min 30 bileşen: button, input, card, badge, chip, list row, empty, skeleton, sheet, tab bar, top bar, FAB, timeline, kanban card, KPI card, avatar, search bar, filter chips, stepper, file row, chat bubble, map pin card)
- [ ] App shell: top bar + 5 bottom tab + örnek içerik
- [ ] 30+ ana ekran mockup
- [ ] 40+ sheet / dialog mockup
- [ ] Empty / loading / error state varyantları (min 5 kritik ekran: login, firma listesi, firma detay, satış kartı detay, servis talebi)
- [ ] Android frame 390×844 ve iOS frame 393×852
- [ ] Prototype akış 1: Login → Firma listesi → Firma detay → Aktivite → Yeni ziyaret sheet
- [ ] Prototype akış 2: Servis talepleri → Detay → Not geçmişi → Not ekle
- [ ] Prototype akış 3 (Android only): Gelen arama bildirimi → Öneri listesi → Teklif oluştur

---

### BÖLÜM 11 — Web ekran görüntüsü çapraz referans tablosu

Mobil tasarım yaparken parity kontrolü için `screenshots/haksan-web-full/` klasöründeki görselleri kullanın.

| Mobil NavKey / modül | Web sidebar etiketi | Screenshot klasörü | Önemli PNG dosyaları |
|----------------------|---------------------|--------------------|----------------------|
| — | Login | `login/` | `00-main.png`, `01-forgot-password-dialog.png` |
| — | Layout / global | `layout/` | `01-quick-create.png`, `02-help-center.png`, `03-command-palette.png`, `04-notifications.png`, `05-user-menu.png`, `07-manual-pbx.png`, `08-approvals.png` |
| `dashboard` | Gösterge Paneli | `dashboard/` | `00-main.png`, `ozet.png`, `operasyon.png`, `grafikler.png`, `hedefler.png` |
| `chat` | Sohbet | `chat/` | `00-main.png`, `01-new-chat.png`, `02-new-group.png` |
| `calendar` | Takvim | `calendar/` | `00-main.png`, `gun.png`, `hafta.png`, `ay.png`, `liste.png`, `01-new-event.png` |
| `customers` | Firmalar | `customers/` | `00-main.png`, `01-new.png`, `tumu.png`, `musteri.png`, `tedarikci.png` |
| (firma detay) | Firma detay sayfası | `customer-detail/` | `00-main.png`, `gecmis.png`, `sat-s-kartlar.png`, `aktivite.png`, `cari.png`, `makineler.png`, `01-new-case.png`, `02-visit.png`, `03-call.png` |
| `contacts` | Kontaklar | `contacts/` | `00-main.png`, `01-new.png`, `tumu.png`, `birincil.png` |
| `sales-cases` | Satış Kartları | `sales-cases/` | `00-list.png`, `liste.png`, `kanban.png`, `01-new.png`, `02-detail-main.png`, `detail-01-activity.png`, `detail-02-new-quote.png`, `detail-03-upload.png` |
| (satış detay sekmeleri) | — | `sales-cases/detail/` | `zaman-cizelgesi.png`, `teklifler.png`, `dokumanlar.png`, `odemeler.png` |
| `sales-map` | Firma Haritası | `sales-map/` | `00-main.png` |
| `offers` | Teklifler | `offers/` | `00-main.png`, `01-new.png`, `02-detail.png`, `taslak.png`, `gonderilen.png`, `onayl.png`, `reddedilen.png` |
| `proformas` | Proformalar | `proformas/` | `00-main.png`, `01-upload.png`, `02-preview.png` |
| `contracts` | Sözleşmeler | `contracts/` | `00-main.png`, `01-upload.png`, `02-preview.png` |
| `documents` | Dokümanlar | `documents/` | `00-main.png`, `01-upload.png`, `02-preview.png` |
| `sales-price-list` | Satış Fiyat Listesi | `sales-price-list/` | `00-main.png` |
| `products` | Ürünler | `products/` | `00-main.png`, `01-import.png`, `02-new.png` |
| `stock` | Stok | `stock/`, `stock/status/` | `00-main.png`, `01-new.png`, `haz-r.png`, `rezerve.png`, `sat-lan.png`, `pasif.png` |
| `purchase-orders` | Satın Alma | `purchase-orders/` | `00-main.png`, `01-create.png` |
| `payments` | Ödemeler & Kasa | `payments/`, `payments/direction/` | `00-main.png`, `01-new-movement.png`, `02-invoice.png`, `al-nan.png`, `odenen.png` |
| `accounting-invoices` | Muhasebe Faturaları | `accounting-invoices/` | `00-main.png`, `01-new.png` |
| `customer-balances` | Cari Rapor | `customer-balances/` | `00-main.png` |
| `due-dates` | Vade Takvimi | `due-dates/` | `00-main.png` |
| `shipments` | Sevkiyat | `shipments/` | `00-main.png`, `01-create.png` |
| `deliveries` | Teslimat | `deliveries/` | `00-main.png`, `01-create.png` |
| `installations` | Kurulum | `installations/` | `00-main.png`, `01-create.png` |
| `machines` | Makineler | `machines/` | `00-main.png`, `01-new.png` |
| `service-requests` | Servis Talepleri | `service-requests/` | `00-main.png`, `01-new.png`, `02-detail.png`, `liste.png`, `servis-ak-s.png`, `sikayet-kutusu.png`, `03-complaints.png`, `04-new-complaint.png`, `05-public-link.png` |
| (servis detay sekmeleri) | — | `service-requests/detail/` | `ozet.png`, `makine-dosyas.png`, `garanti-rma.png`, `musteri-iletisim.png`, `not-gecmisi.png` |
| (şikayet alt sekmeleri) | — | `service-requests/complaints/` | `gelen-sikayetler.png`, `public-linkler.png` |
| `service-kanban` | Servis Kanban | `service-kanban/` | `00-main.png` |
| `service-price-list` | Servis Fiyat Listesi | `service-price-list/` | `00-main.png`, `yedek-parca.png`, `iscilik.png` |
| `reports` | Raporlar | `reports/` | `00-main.png`, `operasyonel.png`, `karl-l-k-y-l-sonu.png`, `analitik-excel.png` |
| `users` | Kullanıcılar | `users/` | `00-main.png`, `01-add.png` |
| `roles` | Roller & Yetkiler | `roles/` | `00-main.png`, `01-new.png` |
| `departments` | Departmanlar | `departments/` | `00-main.png`, `01-new.png` |
| `settings` | Ayarlar | `settings/` | `00-main.png` |

**Toplam:** 135 PNG — tam liste için `screenshots/haksan-web-full/README.md` ve `manifest.json`.

---

## MEGA PROMPT (kopyala-yapıştır sonu)

---

## Ek: Modül uygulama önceliği (önerilen sıra)

Native geliştirme veya tasarım sprintleri için önerilen dikey dilim sırası:

1. **Çekirdek:** Login, shell, bottom tabs, profil, bildirimler
2. **Satış saha:** Firmalar → Firma detay → Kontaklar → Satış kartları (liste + detay)
3. **Servis saha:** Servis talepleri → Detay → Makineler
4. **Finans özet:** Ödemeler, Vade, Cari rapor (salt okunur + filtre)
5. **Operasyon:** Stok, Sevkiyat/Teslimat
6. **Tamamlayıcı:** Teklifler, Dokümanlar, Takvim, Sohbet
7. **Android özel:** Arama asistanı + takvim sync
8. **Yönetim:** Kullanıcılar, Roller, Ayarlar (admin)

---

*Son güncelleme: plan onayı ile oluşturuldu. Web screenshot tarihi: 2026-06-23.*
