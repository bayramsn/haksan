# Analizden kalan kod düzeltmeleri

28 Ekim 2026. `application-analysis-20261028.md` açık kalemlerinin kod tarafındaki devamıdır. Önceki rapordaki test sayıları ve açık kod maddeleri tarihsel durumu gösterir; güncel sonuçlar bu dosyadadır.

## Tamamlananlar

### Ürün oluşturma: belirsiz yanıt ve yeniden açılış

- POST `/products`, isteğe bağlı UUID `Idempotency-Key` kabul eder; eski istemcilerin anahtarsız davranışı korunur.
- Tenant + kullanıcı + işlem kimliği için tekil kayıt vardır. Payload ve aktif bölüm/departman SHA-256 özetiyle bağlanır. Anahtarın farklı içerikle veya farklı çalışma alanında kullanımı 409 döndürür.
- İşlem anahtarının alınması, ürün ve ilişkilerin oluşturulması, ürün kimliğinin işlem kaydına bağlanması aynı veritabanı transaction'ına katılır. Hata halinde işlem ve ürün birlikte geri alınır.
- GET `/products/create-operations/:operationId` yalnız işlemin sahibi için çalışır. Güncel oluşturma yetkisi ve ürün görünürlüğü yeniden kontrol edilir; başka kullanıcı/tenant/çalışma alanı işlem sonucunu okuyamaz.
- Mobil ilk ağ yazımından önce UUID + ilk POST gövdesi + düzenlenen form snapshot'ını güvenli depoya yazar. Anahtar API/tenant/kullanıcı/bölüm/departman özetine bağlıdır. Native depolama cihazda kilit açıkken erişilebilen SecureStore kullanır; web adaptörü yalnız bellektedir.
- Yeniden açılan form önce önceki işlemi sorgular; kayıt yoksa aynı işlem anahtarıyla POST eder. İlk gönderimden sonra kullanıcı formu değiştirmişse önce donmuş ilk gövdeyle aynı ürün kurtarılır, sonra değişiklikler o ürüne uygulanır. Kayıt tamamlandığında bekleyen taslak temizlenir.
- Bozuk/yanlış kapsamdaki taslak yeni işlem gibi başlatılmaz. İşlem sürerken ikinci kayıt başlatılamaz.

**Yayın gereksinimi:** `apps/api/src/db/migrations/0164_product_create_operations.sql` hazırlanmıştır. Migration, API ve yeni mobil istemci birlikte yayımlanmalıdır. Canlı migration bu çalışmada uygulanmadı. Testler kontrollü transaction modeli kullanır; gerçek PostgreSQL eşzamanlılık kabulü ayrıca yapılmalıdır.

### Mobil yönlendirme bağlamı

- Ürün, teklif, stok, ödeme, sevkiyat, servis, fırsat, muhasebe faturası, kontak, firma haritası ve belge merkezindeki ilgili liste akışları web'in arama/odak bağlamını tüketir.
- Arama metni ve müşteri bilgileri URL'ye yazılmaz. URL'de rastgele 128 bit işlem kimliği bulunur; asıl metin yalnız süreç belleğinde tutulur.
- Tek kullanımlık kayıt 30 dakika geçerlidir. Hesap, bölüm, departman, yetki veya istek bağlamı değişince uygulanamaz. Yanlış ekran/süresi dolmuş/soğuk yeniden yüklemede açıklama gösterilir; eski filtre sessizce uygulanmaz.
- Aynı ekran açıkken gelen ikinci yönlendirme yeni işlem kimliğiyle filtreyi yeniler. Tüketilen URL parametresi temizlenir. Durum/ay/yıl gibi özel filtreler görünür ve temizlenebilir.

### Geri dönüş

- Ortak `useHierarchyBack` geçmiş varsa gerçek önceki ekrana döner; geçmiş yoksa kayıt detayından kendi listesine, konuşmadan sohbet listesine, modal iptalinden ana sayfaya gider.
- Fırsat özel başlığı, sohbet ve kayıt detaylarındaki çıkış/silme sonrası geçişler ortak davranışa bağlandı. Ortak form altındaki Vazgeç de aynı güvenli geçişi kullanır.

### Web yükleme maliyeti

- Kapalı oluşturma formlarının kodu ilk paketten ayrıldı; ilk tıklamada yüklenip açılır. Tekrar tıklama aynı anda ikinci yüklemeyi başlatmaz. Yükleme başarısızsa açık mesaj ve tekrar deneme vardır; kapsam kapanmışsa geç sonuç form açamaz.
- Oluşturma formlarının açılış ön doldurmaları ve mevcut taslakları korunur. Hızlı oluşturma da ilk kullanımda yüklenir.
- CRM çalışma alanı ve store oturum doğrulamasından sonra yüklenir. Oturum kapanınca çalışma alanı kaldırılır; taslaklar çıkış, oturum sonlanması, hesap/bölüm/departman değişiminde temizlenir.
- Paylaşılan saf şema/veri paketinin yan etkisiz olduğu tanımlandı; kullanılmayan ürün veri kümeleri ilk paketten çıkarılabilir.
- İlk entry + recursive static import JavaScript'i yaklaşık **1.834.360 bayttan 594.879 bayta** indi: yaklaşık **%67,6 küçülme**. Gzip yaklaşık **451.950 → 183.043 bayt**. Karşılaştırma aynı yerel production derlemesidir; ağ ve cihaz açılış süresi ölçümü değildir.
- `node scripts/audit-web-bundle.mjs` production bundle üretimini bellekte analiz eder; CRM/form/teklif ve büyük lazer veri modüllerinin ilk pakete geri dönmediğini ve 650.000 bayt bütçesini kontrol eder. Sonuç `web-bundle-audit-20261028.json`.
- Ana entry hâlâ Vite'ın 500 kB uyarı eşiğinin üzerindedir. Uyarı gizlenmedi; performans tamamen çözüldü iddiası yoktur.

### Yardım bilgisi

Web yardım merkezindeki örnek `.local` e-posta ve sahte telefon kaldırıldı; mobilde kullanılan destek e-postasıyla hizalandı. Doğrulanmamış yeni telefon eklenmedi.

## Yerel kabul ve dış ortam sınırı

- Android cihaz kontrolü: `adb devices -l` bağlı cihaz döndürmedi.
- iOS simülatör kontrolü: kurulu runtime'lar var, boot edilmiş simülatör yok.
- Tarayıcı otomasyonu Work ayarlarında kapalıdır; görünüm ekran görüntüsüyle kabul edilmedi.
- Siri, Android telefon rolü, arama sonucu, kilitli cihaz, çift SIM, Türkçe cihaz konuşma tanıma, gerçek push teslimi, canlı müşteri/ürün departman eşleştirmesi bu testlerle onaylanmış sayılmaz.
- Expo JavaScript export'u, native derleme veya imzalı APK/AAB/IPA değildir. Export sırasında mevcut `ios.appleTeamId` yapılandırma uyarısı görülür; imzalı iOS build öncesi doğru takım bilgisiyle doğrulanmalıdır.
- Deployment/mağaza/TestFlight/OTA yayını yapılmadı. Yeni migration uygulanmadan ve API yayımlanmadan yeni ürün recovery endpoint'i canlıda çalışmaz.

Bu dış ortam kapıları kod yazarak veya test sonucunu varsayarak kapatılamaz. Kaynakta saptanan açık işler düzeltilmiş olsa da canlı uygulamanın tamamı doğrulanmış ve yayımlanmış anlamına gelmez.

## Son doğrulama

| Kontrol | Sonuç |
|---|---|
| Mobil tam test paketi | 574/574 geçti; yayın yapılandırması, görüşme yardımcısı, Siri ve mikrofon yapılandırması testleri dahil |
| Web tam test paketi | 123 dosya, 744/744 geçti; tek işçi ve sıralı koşu |
| API odaklı test paketi | 29/29 geçti: ürün işlem kimliği/kurtarma, sayfalama, sınıflandırma, firma/kontak ve transaction context |
| TypeScript | Web, mobile-v2 ve API başarılı |
| Web production build ve bundle bütçesi | Başarılı; 594.879 bayt ilk JavaScript, 183.043 bayt gzip; beş deferred modül kontrolü geçti |
| Android Expo export | Başarılı, 3.868 modül; imzalı APK/AAB değildir |
| iOS Expo export | Başarılı; imzalı IPA/native derleme değildir |
| Migration lint | 118 migration kontrolü: 0 hata, 80 uyarı. Yeni tablo unique-index uyarıları da raporda; migration uygulanmadı |
| Mobil GET rota eşleştirme | 216/216 eşleşme; 482 backend handler; eksik ve çözümlenemeyen yol yok |
| Değişiklik whitespace kontrolü | Başarılı |

Yeni testler: dört geçmişsiz geri dönüş regresyonu, yedi yönlendirme bağlamı testi, ürün kurtarma/saklama testleri, dört deferred form testi ve iki oturum kapısı testi. Odaklı testler tam paket toplamlarına tekrar eklenmez. Önceki AuthProvider test düzeneği yeni navigation binding bağımlılığıyla güncellendi; ilk birleşik koşudaki iki test hatası bununla giderildi.

Migration ve native modüller yayımlanmadığı için mevcut telefondaki/canlıdaki sürüm bu yerel değişiklikleri kendiliğinden içermez.

## Yayın hazırlığı denetiminin devamı

Yayın denetleyicisindeki üç yanlış engel düzeltildi:

- Uygulamanın açık `runtimeVersion: "1.2.0"` değeri kabul edilir; uygulama veya platform override sürümü uygulama sürümüyle farklıysa yayın engellenir.
- CNG sınırı Git üzerinden doğrulanır. `/ios/` ve `/android/` gibi geçerli ignore kuralları kabul edilir; izlenen native dosyalar veya başarısız Git denetimi engel olmaya devam eder.
- Splash için sabit 512×512 şartı kaldırıldı. PNG başlığı ve pozitif boyutlar kontrol edilir; ikonların mevcut boyut koşulları korunur. Bu kontrol görsel kalite veya tam görsel decode kabulü değildir.

Dört yeni test bu davranışları ve geçici Git deposundaki gerçek ignore/izlenen dosya senaryolarını doğrular. Mobil paket **563/563** geçti. `validate-deployment-profiles.mjs` staging ve production ayrımını doğruladı.

`release:check` hâlâ **30 hazırlık engeliyle** başarısız olur. Bu sonuç beklenir; yayın hazır olarak işaretlenmedi:

- Yerel shell'de üretim API adresi, üç yasal/destek/pazarlama adresi, app-link host, EAS proje kimliği, Maps anahtarı ve yasal kuruluş değeri yok. Bu, uzaktaki EAS ortamında da eksik olduklarını kanıtlamaz. `.env.example` eksik değişken adlarıyla güncellendi; değer veya secret eklenmedi.
- Yerel yapılandırmada üretim projesine bağlı OTA açık değil. EAS commit şartı `false`; yayın denetimi `true` bekliyor.
- Manifest onaylanan sürümü `1.0.0`, uygulama sürümü `1.2.0`. Onay kaydı yeni sürüme kanıtsız taşınmadı.
- Release, dört sorumlu onayı, iki mağaza kaydı, beş mağaza beyanı ve dört QA onayı bekliyor.
- iPhone, iPad ve Android telefon için ayrı ayrı en az üç incelenmiş ekran görüntüsü bekliyor.

Bu devamda canlı migration, deploy, mağaza gönderimi veya onay alanlarını otomatik işaretleme yapılmadı. Sonraki kabul fiziksel cihaz, erişilebilirlik, gerçek backend ve imzalı paket kanıtlarını gerektirir.

## Görüşme yardımcısının yeniden incelenmesi

İlk kapsamla yeniden karşılaştırmada iki ek hata bulundu ve düzeltildi:

- Android yerel telefon dizini 24 saatte geçersizleştiği halde açık kalan uygulamada yenilenmiyordu. Ön plana dönüşte, son başarılı yenilemeden 12 saat geçmişse yenilenir; kullanıcı tekrar etkinleştirdiğinde yenileme zorlanır. Aynı anda gelen dönüşler tek yenilemeye katılır. Rol yoksa sunucu sorgusu yapılmaz; hesap değişiminden sonra eski sonuç kurulmaz. Ağ hatası sonraki dönüşte tekrar denenir; bekleyen işlem akışı bu yenilemeyi beklemez. İlk dizin yükleme hatası da manuel kullanımı devre dışı bırakmaz.
- Şifreli bekleyen işlem, müşteri eşleştirmesi bitmeden tüketiliyordu. Artık önce silmeden okunur, eşleştirme başarıyla hazırlandıktan sonra tek kullanımlık tüketilir. Ağ hatasında işlem korunur ve ekrandaki “Bekleyen işlemi tekrar yükle” düğmesi aynı kimlikle tekrar dener.

Üç dizin yaşam döngüsü testi, bir depolama testi ve gerçek ekran bileşenini mock servislerle çalıştıran bir offline/tekrar deneme regresyonu eklendi. Mobil **568/568**, TypeScript ve whitespace kontrolü geçti. Bu testler fiziksel cihaz telefon/Siri kabulünü kapsamaz.

**Sonraki devamda kapatılan kod açığı:** Siri intent'i yalnız işlem ve isteğe bağlı not alıyordu. Aşağıdaki aktarım eklendi; cihaz üzerindeki Siri kabulü hâlâ bekliyor.

### Siri müşteri/tarih ve tam komut aktarımı

- Mevcut işlem intent'ine isteğe bağlı firma/kişi arama metni ve `Date` takip zamanı eklendi. Eski not parametresi korunur.
- Yeni komut intent'i zorunlu Türkçe komut metnini sistemden ister. “Haksan komut hazırla” veya “Haksan yardımcısını aç” kısayolundan sonra kullanıcı “ABC Makina için yeni fırsat hazırla” gibi tam komutu söyleyebilir. Her rastgele tek cümlelik Siri ifadesinin otomatik keşfedildiği iddia edilmez.
- Sekiz kısayol var: görüşme sonrası, günlük işler, fırsat listesi, yeni fırsat, not, takip, servis ve tam komut. Intent'ler cihaz doğrulaması ve foreground açılışı kullanır.
- Komut, müşteri arama ipucu ve ISO takip zamanı şifreli bekleyen işlemde taşınır. URL yalnız rastgele işlem kimliğidir. Metin/arama alanı boyutları JS girişinde de doğrulanır.
- Uygulama ortak allowlist parser'ını kullanır; yasak veya anlaşılamayan komut hata gösterir. Ad tek başına CRM kaydı seçmez; kullanıcı yetkili seçiciden doğrular. Geçmiş veya belirsiz tarih görev taslağında yeniden seçilir.
- Ekran regresyonları komutun müşteri ipucu ve takip zamanı olarak göründüğünü, otomatik müşteri seçimi/kayıt yapılmadığını doğrular. Mobil tam paket **572/572**, TypeScript başarılıdır; son küçük parser düzeltmesinden sonra ilgili dokuz test tekrar geçti.
- İki Swift dosyası gerçek iPhoneSimulator SDK 27.1 ile `arm64-apple-ios16.0-simulator` hedefinde `swiftc -typecheck` kontrolünden geçti. Bu, Expo uygulamasının tamamının link edilmesi, App Intents metadata çıkarımı, Siri keşfi veya fiziksel cihaz kabulü değildir.

Parametrelerin gerekli/isteğe bağlı davranışı [Apple App Intents parametre dokümanına](https://developer.apple.com/documentation/appintents/adding-parameters-to-an-app-intent) göre uygulanır. Yeni native kod için yeni binary gerekir; eski runtime'a uyumsuz OTA gönderilmez.

## Native derleme ve gerçek PostgreSQL devamı

### Android mikrofon izni çakışması

Tam derleme öncesi oluşturulmuş Android manifestinde `RECORD_AUDIO tools:node="remove"` bulundu. `expo-image-picker` için `microphonePermission: false`, konuşma modülünün eklediği izni de kaldırıyordu. Ayar mevcut sesli giriş açıklamasıyla değiştirildi. Non-clean prebuild eski kaldırma satırını koruyabildiği için görüşme yardımcısı CNG plugin'i medya plugin'lerinden sonra yalnız bu mikrofon satırını normalleştirir; diğer izinler ve engeller korunur.

İki regresyon testi gerçek görsel seçici izin plugin'inin davranışını ve eski manifest satırının idempotent temizliğini doğrular. Tam `expo config --type introspect` çıktısında tek normal `RECORD_AUDIO` izni vardır; `READ_CALL_LOG` istenmez. Mobil **574/574** ve TypeScript geçti. Bu kontrol mikrofon izin diyaloğunun veya Türkçe cihaz tanımasının fiziksel kabulü değildir.

### Gerçek PostgreSQL atomiklik kontrolü

Yeni `apps/api/test/call-assistant-postgres.integration.spec.ts`, açık `HAKSAN_RUN_ISOLATED_CALL_PG=1` seçimiyle kendi geçici PostgreSQL kümesini oluşturur. TCP kapalıdır, özel UNIX soketi kullanılır; uygulama DB adresi/ortamı kullanılmaz. Kendi kümesi test sonunda durdurulup silinir.

Gerçek `CallAssistantService`, Drizzle bağlantısı ve transaction bağlamıyla beş test geçti; parent çalıştırması da **5/5** doğruladı:

- Sekiz eşzamanlı özdeş kayıt isteği tek iş kaydı üretir.
- Aynı öneriye bağlı iki farklı taslaktan yalnız biri kaydedilir.
- Taslak sonlandırmasında PostgreSQL trigger hatası, daha önce eklenmiş iş satırını ve iki durum geçişini birlikte geri alır.
- Başka kullanıcı/tenant ve değiştirilmiş idempotent tekrar isteği reddedilir.
- Kaldırılan firma erişimi ve süresi dolmuş taslak yazım yapamaz.

Firma görünürlüğü kontrollü bağımlılıkla, aşağı akış iş servisi gerçek SQL yazan test bağımlılığıyla temsil edilir. Test tabloları üretim kolonlarından türetilir; dış FK/migration ve tam `TasksService` doğrulaması değildir. API TypeScript geçti. Önceki rapordaki “gerçek PostgreSQL hiç doğrulanmadı” sınırı bu dar transaction kapsamı için kapatılmıştır; tam migration/iş akışı kabulü açık kalır.

### Native uygulama derlemeleri

Android offline tam `:app:assembleDebug` önce 8 dakika 42 saniyede geçti. Düzeltmeden sonra Android-only non-clean CNG üretimi yapıldı; `package.json` değişmedi ve bağımlılık kurulmadı. Son offline tam derleme **25 saniyede, 626 görevle, çıkış kodu 0** geçti. Son birleşik manifest normal mikrofon iznini, Call Screening/Post Call sistem korumalarını içerir; `READ_CALL_LOG` yoktur. Expo modül listesinde Call Assistant vardır. `apps/mobile-v2/android/app/build/outputs/apk/debug/app-debug.apk` üretildi (sürüm 1.2.0); bu debug APK mağazaya hazır production paket değildir. Son log `/tmp/haksan-android-native-build-final.log`.

İmzasız tam iOS simulator derlemesi bu kayıt anında çalışıyor; başarılı build olarak sayılmaz. Log `/tmp/haksan-native-ios-build.log`. Fiziksel cihaz veya mağaza yayını yapılmadı.
