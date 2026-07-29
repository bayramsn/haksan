# Haksan Mobil — Expo (React Native)

Native Kotlin/Swift yerine **Expo + expo-router** ile web paritesi hedeflenen mobil uygulama.

**Stitch tasarım:** [Haksan CRM Mobile — Premium](https://stitch.withgoogle.com/projects/5470261679107716920) (`5470261679107716920`)  
**Design system:** `.stitch/DESIGN.md` · ekran envanteri: `docs/stitch-screens.md`

## Stack

- Expo SDK 56 · expo-router · TypeScript
- `@haksan/shared` (Zod şemaları)
- `expo-secure-store` (token + refresh cookie)
- `react-native-maps` · `react-native-webview` · `expo-location` (harita + PDF önizleme)
- Industrial Authority token'ları (`src/theme/tokens.ts`)

## Kurulum

```bash
# Monorepo kökünden
npm install
npm run build:shared

cd apps/mobile
npm install
```

## API adresi

| Ortam | Varsayılan |
|-------|------------|
| Android emülatör | `http://10.0.2.2:3000/api/v1` |
| iOS simülatör | `http://localhost:3000/api/v1` |
| Fiziksel cihaz | `EXPO_PUBLIC_API_HOST=192.168.x.x` (Mac LAN IP) |

İsteğe bağlı tam URL:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:3000/api/v1 npm run start
```

## Expo Go ile çalıştırma

```bash
# API'yi ayrı terminalde başlatın
npm run dev:api

# Mobil
npm run dev:mobile
# veya
cd apps/mobile && npx expo start
```

Sonra:

1. **Android emülatör:** Terminalde `a` tuşu veya `npx expo start --android`
2. **iOS simülatör (macOS):** `i` tuşu veya `npx expo start --ios`
3. **Fiziksel telefon:** Expo Go uygulamasını indirin, aynı Wi‑Fi'da QR kodu tarayın

> Fiziksel cihazda `localhost` çalışmaz — `EXPO_PUBLIC_API_HOST` ile bilgisayarınızın IP'sini verin.

## Sekmeler (Stitch shell)

| Sekme | İçerik |
|-------|--------|
| Ana | Gösterge Paneli (Stitch #91f83c94…) |
| Satış | Firmalar, Kontaklar, Teklifler, … |
| Operasyon | Stok, Ödemeler, Sevkiyat, … |
| Servis | Makineler, Servis talepleri, … |
| Daha Fazla | Profil, Ayarlar, Yönetim |

Modül rotaları: `/modules/[navKey]` — Stitch screen ID'leri `src/navigation/modules.ts` içinde.

## Modül kapsamı (Stitch 5470261679107716920)

| Kategori | Durum |
|----------|--------|
| API servisleri | Web `services.ts` ile parite (`services.web.ts`) |
| 32 modül rotası | `/modules/[key]` + `/modules/[key]/[id]` |
| Zengin detay ekranları | `DetailRouter` → hero, sekmeler, aksiyonlar (`src/screens/details/`) |
| Formlar / sheet'ler | `/forms/visit`, `/machine`, `/purchase-order`, `/service-complete`, `/installation-checklist`, `/maintenance` |
| Sohbet thread | `ChatThreadScreen` — mesaj listesi + gönder |
| Firma haritası | Ücretsiz **OpenStreetMap** + Nominatim geocoding (API key yok) |
| Offline kuyruk | Servis tamamlama — `src/offline/queue.ts` + Ayarlar senkron |
| useAction | RBAC görünürlük — `src/actions/useAction.ts` |
| Özel ekranlar | Kanban, Takvim, Sohbet, Bildirimler, Harita, Raporlar, Ayarlar, Cari, Vade, Fiyat listesi |
| Onboarding | `/onboarding` (karşılama + izinler) |
| Hızlı Oluştur | `/quick-create` modal |

### Form rotaları (Stitch premium tur)

| Rota | Stitch ekranı |
|------|----------------|
| `/forms/visit` | Yeni Ziyaret (#7456e3b6…) |
| `/forms/machine` | Yeni Makine (#702840f0…) |
| `/forms/purchase-order` | Satın Alma (#9a1c4dcd…) |
| `/forms/service-complete` | Servis İmza (#15a25afe…) |
| `/forms/installation-checklist` | Kurulum Checklist (#f7746fe9…) |
| `/forms/maintenance` | Bakım Planı (#4811cbc6…) |
| `/forms/offer` | Yeni Teklif |
| `/forms/service-ticket` | Yeni Servis Talebi (#7bae69e3…) |
| `/forms/opportunity` | Yeni Satış Kartı |
| `/forms/payment` | Tahsilat Kaydet (#a9aceb55…) |
| `/forms/company` | Yeni Firma |
| `/forms/contact` | Yeni Kontak |
| `/forms/calendar-event` | Takvim etkinliği |

Liste ve kanban ekranlarında **+** FAB ile ilgili oluşturma formu açılır. Formlarda **CompanyPicker** ile firma arama/seçim yapılır.

> **Harita:** Ücretsiz **OpenStreetMap** karoları + Nominatim geocoding. Google Maps API key gerekmez. `eas build --profile preview` ile native APK/IPA alınabilir (`eas.json`).
