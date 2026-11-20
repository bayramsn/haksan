# Haksan mobile-v2

Saha uygulaması: Expo SDK 54, React Native 0.81, Expo Router 6 ve NativeWind 4.
Eski `apps/mobile` ayrı uygulamadır; v2 için kökten aşağıdaki komutları kullanın.

```sh
npm run build:shared
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1 npm run dev:mobile-v2
npm run typecheck:mobile-v2
npm run test:mobile-v2
```

Fiziksel telefonda `localhost` yerine bilgisayarın LAN adresini kullanın. Android
emülatöründe localhost otomatik `10.0.2.2` olur. Production API adresi build
ortamından `EXPO_PUBLIC_API_URL` ile verilir ve HTTPS olmalıdır. Adres değişikliği
sadece geliştirme sürümlerinde mümkündür. Push ve native gezinme doğrulaması
uyumlu development build ile yapılır; Expo Go tek başına yayın doğrulaması değildir.

## Gezinme ve görünüm

Beş ana sekme: **Bugün, İşler, Takvim, Modüller, Hesap**. Her sekmenin kendi
native yığını vardır; kayıt detayından geri dönüldüğünde açıldığı sekmeye dönülür.
iOS 26+ native sekme çubuğu ve başlık kontrollerinde sistem Liquid Glass kullanır.
Android 12+ üst ve alt gezinmede Expo BlurView cam yüzeyi kullanır; daha eski
Android cihazlarda opak yüzeye döner. Eski iOS sistem bulanıklığını kullanır. Sistem
saydamlık erişilebilirliği ve Hesap → Ayarlar → Gezinme efektlerini azalt tercihi
korunur. Ortak ekran başlıkları `ScreenHeader` ve `DetailHeader` ile ayarlanır.

İşler seçimi kullanıcı, tenant, bölüm ve departman kapsamında hatırlanır. Modül
kataloğu, derin bağlantılar ve doğrudan girişler aynı izin/görünürlük kurallarına
tabidir. Firma/fırsat detayları Özet, Süreç ve Kayıtlar altında gruplanır.

## Ticari belgeler (ekran telefonda, PDF sunucuda)

> Clarified: fırsat + Teklifler sayfası mobilde; tuşa basınca sunucuda oluşur; PDF telefonda üretilmez.
> Linked from: `docs/mobile-v2-design-plan.md`.

Mobilde teklif/proforma/sözleşme liste, detay ve taslak form vardır. Kayıt API ile
sunucuda oluşur. Mobilde Chromium/yerel PDF yok. PDF sunucuda (DB + depo); web
hazırlar; mobil hazır dosyayı açar/paylaşır.

`0163_commercial_pdfs.sql`, Chromium ve dosya deposu sunucu/web içindir.

## Saha kapsamı

Firma/kontak, fırsat, teklif/proforma/sözleşme (sunucu taslağı), görev, ziyaret,
takvim, stok, ürün, finans, sevkiyat, kurulum, servis, makineler, raporlar ve QR
kapsamdadır. PDF üretimi web/sunucu. Toplu import ve admin web kapsamındadır.

## Çevrimdışı davranış

React Query verisi bellektedir; CRM/finans/chat için şifresiz disk persister
**kapalıdır**. Desteklenen firma durum değişiklikleri SecureStore kuyruğunda;
kullanıcı, tenant, sunucu ve çalışma kapsamı ile saklanır. Diğer kayıtlar ve
kritik durum geçişleri çevrimiçi gerektirir; çevrimdışında kaydedildi denmez.
Hesap → Ayarlar senkronizasyon durumunu ve çözümlenemeyen istekleri gösterir.
Geniş offline kayıt ve medya senkronizasyonu ayrı geliştirme fazıdır.

## Doğrulama

```sh
npm --workspace @haksan/mobile-v2 run quality
npm --workspace @haksan/mobile-v2 run release:check
```

`quality`: shared build, TypeScript, birim testleri, Expo doctor, EAS workflow
kontrolü ve Android/iOS export. Yerel `.env` dosyası okunamıyorsa test amaçlı
export komutunda `EXPO_NO_DOTENV=1` kullanılabilir; production'da gerekli genel
build değişkenleri ayrıca sağlanmalıdır. Export başarısı native cihaz testi,
mağaza hazır oluşu veya gerçek sunucu entegrasyonunun yerine geçmez.
