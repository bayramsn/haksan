# Mobil mağaza yayın kapısı

Bu klasör kaynak koddan bağımsız mağaza kanıtlarını takip eder. Başlangıçtaki
`release-manifest.json` bilerek hazır değildir. Üretim workflow'u gerçek marka
varlıkları, mağaza kayıtları, gizlilik beyanları ve cihaz QA kanıtları olmadan
build/submit yapmaz.

## EAS production ortamı

Aşağıdaki değerleri EAS Dashboard'daki **production** environment'a girin.
`EXPO_PUBLIC_*` değerleri uygulama paketinde görünür; secret değildir. Hiçbir
mağaza parolası, servis hesabı JSON'u veya inceleme hesabı parolası Git'e
yazılmamalıdır.

- `EAS_PROJECT_ID`: EAS proje UUID'si.
- `EXPO_PUBLIC_API_URL`: HTTPS production API kökü.
- `EXPO_PUBLIC_APP_LINK_HOST`: Şemasız universal/app-link hostname'i.
- `MOBILE_PRIVACY_POLICY_URL`: Herkese açık HTTPS gizlilik politikası.
- `MOBILE_SUPPORT_URL`: Herkese açık HTTPS destek sayfası.
- `MOBILE_MARKETING_URL`: Herkese açık HTTPS ürün sayfası.
- `MOBILE_LEGAL_ENTITY`: Mağazada gösterilecek onaylı tüzel kişi unvanı.

Apple/Google imzalama kimlik bilgilerini EAS Credentials'ta, Google servis
hesabını EAS'in secret-file değişkeninde ve uygulama inceleme hesabını doğrudan
App Store Connect / Play Console içinde yönetin. Bu değerleri manifest'e veya
workflow YAML'ına koymayın.

## Yayına hazırlık

1. `assets/` altındaki `make-placeholders.mjs` ile üretilmiş dört PNG'yi onaylı
   marka varlıklarıyla değiştirin.
2. App Store Connect ve Play Console kayıtlarını bundle/package kimliği
   `com.haksan.mobileapp` ile oluşturun.
3. Apple Privacy Nutrition Labels, Google Data safety, içerik derecelendirmesi
   ve ihracat uyumluluğu sorularını gerçek veri akışına göre tamamlayın.
4. Canlı müşteri, çalışan, telefon, e-posta, finans veya konum verisi içermeyen
   en az üçer iPhone, iPad ve Android telefon ekran görüntüsünü bu klasörün
   altına koyup yollarını manifest'e yazın.
5. Preview binary'lerini gerçek iOS ve Android cihazlarda ve Maestro smoke
   akışında doğrulayın; erişilebilirlik kontrolünü tamamlayın.
6. Her kanıtı ilgili sahibi onayladıktan sonra manifest boolean'larını `true`
   yapın ve `releaseReady` değerini en son değiştirin.

Yerel kontrol:

```sh
npm run release:check:mobile
```

Production build/submit yalnız `.eas/workflows/production-release.yml` ile
çalışır. İki platform build'i tamamlandıktan sonra EAS üzerinde ayrıca insan
onayı ister. iOS yüklemesi önce TestFlight'a gider; Android yüklemesi Play
Internal track'e `draft` olarak bırakılır. Kamuya açma mağaza konsollarındaki
ayrı onay ve kademeli yayın işlemidir.
