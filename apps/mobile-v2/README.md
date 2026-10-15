# @haksan/mobile-v2

Haksan saha/satış mobil uygulaması — Expo SDK 54, React Native 0.81, Expo Router 6, NativeWind 4.

## Mega prompt ile bu repo arasındaki farklar

Prompt başka bir projeden uyarlanmış; şu varsayımları bu repo karşılamıyor ve
uygulama gerçek sözleşmeye göre yazıldı:

| Prompt | Gerçek |
| --- | --- |
| tRPC (`lib/trpc.ts`) | NestJS REST, `{origin}/api/v1` — `src/api/client.ts` |
| Manus Auth | `@nestjs/jwt`; Bearer access token + httpOnly refresh çerezi |
| Mobilde Drizzle ORM | Drizzle yalnızca sunucuda; RN'de çalışmaz |
| `shared/types.ts` | `@haksan/shared` (Zod 3.23.8) — form ve login doğrulaması buradan |
| WatermelonDB | Kurulmadı, aşağıdaki "Sonraki adımlar"a bakın |
| MMKV (§4.1) | AsyncStorage + senkron bellek önbelleği (`src/offline/storage.ts`) — MMKV yerel modül olduğu için Expo Go'da çalışmıyor |

## Çalıştırma

Uygulama **Expo Go ile çalışır** — yerel modül kullanmıyor. Telefonu Mac ile aynı
Wi-Fi'ya bağla, QR'ı Expo Go ile okut:

```bash
EXPO_PUBLIC_API_URL=http://<mac-lan-ip>:3000/api/v1 npm --workspace @haksan/mobile-v2 run start
```

API adresi sırasıyla: Ayarlar'daki override → `EXPO_PUBLIC_API_URL` →
`http://localhost:3000/api/v1`. Telefondan bağlanırken `localhost` işe yaramaz;
Mac'in LAN IP'sini ver. Android emülatöründe `localhost` otomatik olarak
`10.0.2.2`'ye çevrilir (`src/api/config.ts`).

Expo Go'da çalışmayan tek şey push bildirimleri (SDK 53'ten beri kaldırıldı);
kod bunu algılayıp sessizce atlıyor. Push testi için development build gerekir:

```bash
npm --workspace @haksan/mobile-v2 run ios
```

## Doğrulama

```bash
npm --workspace @haksan/mobile-v2 run typecheck
```

```bash
npm --workspace @haksan/mobile-v2 run test
```

```bash
npx expo-doctor
```

## Mimari

- `src/api/client.ts` — fetch sarmalayıcı: Bearer, 401'de tek seferlik refresh,
  `ApiError` / `OfflineError`, kullanıcıya dönecek Türkçe hata mesajları.
- `src/api/endpoints.ts` — tipli uç noktalar. Liste zarfı `{ data, meta }`.
- `src/offline/queue.ts` — olay tabanlı mutation kuyruğu (MMKV), sunucu kökü +
  kullanıcıya göre kapsamlı. Karar mantığı `failure.ts`'te ve test edilmiş.
- `src/offline/useOfflineMutation.ts` — optimistic update + rollback. Ayrım:
  **sunucu reddederse geri alınır, ağ yoksa geri alınmaz** (kuyruğa girer).
- `src/offline/sync.ts` — NetInfo ile yeniden bağlanınca flush + 15 dk'lık
  `expo-background-task`.
- `src/push/usePush.ts` — giriş sonrası token kaydı, `data.href` ile deep link.
- `theme.config.js` → `global.css` (CSS değişkenleri) + `src/theme/theme.ts` (JS).

## Kapsam

Prompt §8'in istediği teslimat: iskelet (Router/Theme/Auth), çevrimdışı
senkronizasyon, Dashboard ve bir örnek CRUD.

Hazır: Login, Dashboard (6 KPI + huni grafiği + bağlamsal "Bugün" özeti),
Müşteriler (sonsuz kaydırma, arama, durum filtresi, swipe → bottom sheet ile
durum değiştirme, FAB), Müşteri detayı, Yeni müşteri tam ekran modalı.

### Sonraki adımlar (§9 envanteri)

Fırsatlar, Teklif/Sözleşme, Finans, Servis, Lojistik/Stok, Raporlar, Takvim
ekranları ve QR tarama henüz yok. Hepsi aynı üç parçayı tekrar kullanır:
`endpoints.ts`'e uç nokta, `*.hooks.ts`'e sorgu/mutasyon, ekran.

WatermelonDB (§4.1) kurulmadı: bugünkü ekranlar çevrimdışında React Query'nin
MMKV'ye kalıcılaştırdığı önbellekle çalışıyor. Çevrimdışıyken ilişkisel SQL
sorgusu (ör. "müşteri adına göre ara, ilişkili servis kayıtlarını getir")
gerektiğinde eklenmeli.

## Mağaza yayını

`app.config.ts` bundle id, sürüm, izin metinleri ve splash yapılandırmasını
içerir. Yayından önce:

- [ ] `assets/` içindeki yer tutucuları gerçek marka varlıklarıyla değiştir
      (`assets/BRAND.md`).
- [ ] EAS proje kimliğini bağla (`EAS_PROJECT_ID`); push token'ı bu olmadan alınamaz.
- [ ] App Review için **verilerle dolu** bir test hesabı gir (Guideline 2.1.0).
- [ ] Sadece kurum içi görünürse "bayi/distribütör saha çalışanları da kullanır"
      notunu ekle (Apple Business Manager sorusuna karşı).
- [ ] "Hesabımı sil" akışı ekle (Guideline 5.1.1(v)) — henüz yok, Ayarlar sekmesi
      geldiğinde eklenmeli.
- [ ] Mağaza ekran görüntülerini gerçekçi verilerle al; Android görsellerinde
      iPhone çerçevesi kullanma.
