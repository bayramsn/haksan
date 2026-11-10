# Mobil mağaza yayın kapısı

Bu klasör kaynak koddan bağımsız mağaza kanıtlarını takip eder. Başlangıçtaki
`release-manifest.json` bilerek hazır değildir. Üretim workflow'u gerçek marka
varlıkları, mağaza kayıtları, gizlilik beyanları ve cihaz QA kanıtları olmadan
build/submit yapmaz.

## EAS production ortamı

Aşağıdaki değerleri EAS Dashboard'daki **production** environment'a girin.
`release_gate` bu adları süreç ortamından okur; workflow YAML'ı değer taşımaz.
Görünürlük EAS'in kendi sınıflarıdır: **plain** log ve arayüzde okunur,
**sensitive** arayüzde maskelenir ama derlemede okunur, **secret** yazıldıktan
sonra geri okunamaz ve yalnız derlemede enjekte edilir. `EXPO_PUBLIC_*`
değerleri JS paketine gömülür; secret yapılmamalıdır. Hiçbir mağaza parolası,
servis hesabı JSON'u veya inceleme hesabı parolası Git'e yazılmamalıdır.

| Ad | Görünürlük | Ne işe yarar |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | plain | HTTPS production API kökü (`/api/v1` dahil). Pakete gömülür. |
| `EXPO_PUBLIC_APP_LINK_HOST` | plain | Şemasız universal/app-link hostname. iOS associated domain ve Android intent filter buradan üretilir. |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | sensitive | Android firma haritası anahtarı. Pakete gömülür; paket adı ve imza SHA-1 ile kısıtlanmalıdır. |
| `EAS_PROJECT_ID` | plain | EAS proje UUID'si. OTA URL'si `https://u.expo.dev/<id>` ve `extra.eas.projectId` bununla eşleşir. |
| `MOBILE_PRIVACY_POLICY_URL` | plain | Herkese açık HTTPS gizlilik politikası. Yalnız release kontrolü okur. |
| `MOBILE_SUPPORT_URL` | plain | Herkese açık HTTPS destek sayfası. Yalnız release kontrolü okur. |
| `MOBILE_MARKETING_URL` | plain | Herkese açık HTTPS ürün sayfası. Yalnız release kontrolü okur. |
| `MOBILE_LEGAL_ENTITY` | plain | Mağazada gösterilecek onaylı tüzel kişi unvanı. Yalnız release kontrolü okur. |

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

Kontrol EAS `production` ortamındaki değerleri okur. Yerel shell'de bu değişkenlerin
olmaması, EAS'te de eksik olduklarını kanıtlamaz; yerel raporu ortam kanıtı gibi
yorumlamayın. Komut ortam değişkenlerinin değerlerini yazdırmaz.

Bu proje native/runtime sürümünü açık string olarak hizalar: `version` ve
`runtimeVersion` birlikte `1.2.0` olmalıdır. iOS/Android override'ları varsa onlar
da aynı sürümü taşımalıdır. Native modül değişikliği için yeni binary ve sürüm
gerekir; eski binary'ye uyumsuz OTA gönderilmez.

Üretilen `ios/` ve `android/` dizinlerinin ignore durumu Git'in kendi kurallarıyla
doğrulanır; başında `/` olan ignore kuralları da geçerlidir. Takip edilen native
dosyalar varsa kontrol başarısız olur. Yerel geliştirme dizinleri silinmez.

Splash kaynağı pozitif boyutlu PNG olmalıdır; `imageWidth` / `resizeMode` ile
ölçeklendiği için 512×512 piksel şartı aranmaz. Mağaza ikonlarının sabit boyut
kontrolü korunur. Kaynak: [Expo splash yapılandırması](https://docs.expo.dev/versions/v54.0.0/sdk/splash-screen/).
Boyut kontrolünün geçmesi, açılış görünümünün cihazda kabul edildiği anlamına gelmez.

`approvedAppVersion` uygulama `version` değeriyle aynı olmalıdır; şu an `1.2.0`.
Mağaza kayıtları, beyanlar, ekran görüntüleri ve fiziksel cihaz QA alanları
yalnız kanıt sahibi onayladığında `true` yapılır. Kod testlerinin geçmesi bu
alanları otomatik olarak `true` yapmaz. `eas.json` içinde
`cli.requireCommit` production için `true` durur: workflow temiz bir commit
üzerinde çalışır, kirli ağaçtan üretim derlemesi açılmaz.

Production build/submit yalnız `.eas/workflows/production-release.yml` ile
çalışır. İki platform build'i tamamlandıktan sonra EAS üzerinde ayrıca insan
onayı ister. iOS yüklemesi önce TestFlight'a gider; Android yüklemesi Play
Internal track'e `draft` olarak bırakılır. Kamuya açma mağaza konsollarındaki
ayrı onay ve kademeli yayın işlemidir.
