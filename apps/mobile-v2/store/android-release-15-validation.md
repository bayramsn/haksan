# Android 1.5.0 (15) güvenlik ve Tam Mod doğrulaması

18 Kasım 2026. EAS build: `b76f9aca-c56d-4407-9453-849643c076b9`.

## Düzeltilen bağımlılıklar

| Neden | Sürüm | Uyumluluk |
|---|---|---|
| decode-uri-component | 0.5.1 | Router 6 / query-string 7 için CJS–ESM varsayılan export adaptörü |
| image-size | 2.0.3 | Metro dosya yolunu okuyup yeni ayrıştırıcıya byte dizisi gönderir |
| postcss | 8.5.33 | İç içe kalan eski kopyalar da override ile sabitlenir |
| zod | 4.6.7 | Mobil, ortak paket, API ve web sürümleri hizalandı |
| basic-ftp | 6.2.6 | Güncel taramada bulunan ek FTP sorunu için yama |

Önceki altı yüksek bulgudan expo-router ve query-string, decoder sorununun bağımlılık ağacındaki yansımalarıydı. Yama adaptörleri kurulum sırasında uygulanır ve beklenmeyen kaynak/sürüm değişikliğinde sessizce devam etmez.

## Yayımlanmış yaması olmayan bulgu

`GHSA-fc5q-39xc-vjpf` için picomatch 4.0.7 dahil yayımlanmış sürümlerde resmi düzeltme yok. Kompleks tekrarlanan extglob kalıpları regex oluşturulmadan önce reddediliyor. Normal glob davranışları ve saldırı kalıpları, kurulu beş kopyada test edildi. Bu, desteklenen kalıpları daraltan geçici bir kaynak korumasıdır.

Ham npm audit sonucu, izole mobil derleme ağacında **0 kritik, 33 yüksek, 23 orta** kayıt gösteriyor. Yüksek kayıtların tek doğrudan nedeni bu picomatch duyurusudur; diğerleri ona bağlı paketlerin yansımalarıdır. Audit kayıtları bastırılmadı ve paket sürümleri temiz görünmek için değiştirilmedi. Tüm siber açıkların kapandığı veya npm audit'in temiz olduğu iddia edilmiyor.

## R8

`android.enableR8.fullMode=true`; minification ve kaynak küçültme açık. Expo'nun reflection ile bulduğu modül sağlayıcı kurucusu, Kotlin metadata/reflection ve Expo Record korumaları tutuldu. AGP 8.11.0 üzerinde tam mod kullanılabiliyor; AGP 9 önerisi ayrı bir yükseltme konusudur.

## Zod geçişinin davranış koruması

Zod 4, optional/default birleşiminde PATCH isteğinde bulunmayan alanlara varsayılan değer uygulayabiliyor. `partialWithoutDefaults` yardımcısı, alan yoksa varsayılanı uygulamadan atlar; açık 0, false, boş string ve null değerlerini korur. Ortak güncelleme şemaları ve API lookup güncellemesi bu yardımcıyı kullanır. Tek argümanlı record çağrıları Zod 4 API'sine geçirildi; Türkçe hata haritası güncellendi.

## Tamamlanan kontroller

- Ortak paket derlemesi ve mobil TypeScript kontrolü geçti.
- 106 mobil test geçti; PATCH omission, Türkçe mesajlar, malformed URI, Metro filename/Buffer, bozuk görsel ve picomatch regresyonları dahil.
- 11 hedefli API doğrulama/ortam/auth navigation testi geçti.
- OpenAPI probunda 324 şema üretildi. Önceden de çevrilemeyen z.never içeren iki purchase-order-item şeması atlandı.
- Tam Mod açık yerel release APK'si derlendi; 16 KB Android emülatöründe soğuk açılış ve Giriş Yap ekranı doğrulandı.
- Yerel CMake'nin eski Worklets çıktı yolu, aynı derlemenin güncel libworklets çıktısına bağlandı. Bu yalnızca yerel test alanındaki bir bağlantıdır, kaynak arşivine dahil değildir. Son EAS AAB ayrıca test edilecek.

## Son imzalı AAB ve Play Console sonucu

- İmzalı EAS AAB indirildi; imza, paket adı, versionCode 15 ve versionName 1.5.0 doğrulandı.
- SHA-256: `b22a5c1a9a91967485746f2f4887a44f312141b5c24d4b9f8866096207cea9e6`.
- Son AAB metadata'sında `isProGuardCompatibilityModeEnabled=false`, optimizasyon/karartma/küçültme açık.
- DEX 12,13 MB; önceki 13 numaralı pakette 15,42 MB, ilk kullanıcı raporunda 59,2 MB idi.
- Mapping dosyası ve yerel hata ayıklama sembolleri Play tarafından algılandı.
- Dört ABI korunuyor; bütün arm64-v8a/x86_64 ELF yükleme segmentleri 16 KB hizalamasını geçti.
- AAB'den üretilen APK 16 KB emülatöre kuruldu. İlk testin sabit 6 saniyelik beklemesi yetmedi; JS başlangıcı sonrasında Giriş Yap ekranı doğrulandı. İkinci açılışta giriş ekranı 6,6 saniyede gözlendi. Bu bir fiziksel cihaz performans ölçümü değildir.
- Son manifestte backup ve debug kapalı; SYSTEM_ALERT_WINDOW yok.
- Play Console `Tam Mod` ve `Kaynak Küçültme` göstergeleri yeşil; DEX optimizasyonu Yüksek, kod karartma %80, DEX boyutu 12,1 MB.
- 19.042 cihaz desteği korunuyor. Yeni indirme boyutu 35,6 MB; sürüm 13'e göre 386 KB daha küçük.
- `1.5.0 (15)` release 3, kullanıcının açık yayınlama talimatıyla 18 Kasım 2026 saat 12:41’de dahili test kanalında yayımlandı. Play Console kanal durumu Etkin, son sürüm 1.5.0 (15) ve Dahili test kullanıcıları tarafından kullanılabilir olarak doğrulandı. Önceki sürüm 13 yerini 15’e bıraktı. Herkese açık üretim yayını yapılmadı.
- API TypeScript kontrolü temiz kurulum alanında geçti. Web'in kök proje kontrolünde numaralı yedek dosyalara ilişkin mevcut hatalar var; web deploy edilmedi.

## Sınırlar

Ham npm audit'te picomatch duyurusu ve yansımaları raporlanmaya devam eder. Fiziksel cihaz ve oturum açılmış iş akışı testi yapılmadı. Canlı Cloudflare yapılandırması bu değişiklikte doğrulanmadı. AGP 9 yükseltme önerisi ve gri ek optimizasyon göstergeleri ayrı araç zinciri çalışmasıdır; Tam Mod etkinleştirmek için AGP yükseltmesi gerekmedi.

## Yerel kurulum

Yerel npm kurulumu manifest/lock ile eşitlendi; API, web, mobil-v2 ve shared artık Zod 4.6.7 çözümlüyor. Kurulum adaptörleri 1 query-string, 2 Metro ve 5 picomatch kopyasına uygulandı. Kök dizindeki ek genel derleme uzun sürdüğünden durduruldu; kaynakları birebir eşleşen 236 doğrulanmış shared çıktı dosyası izole başarılı derleme alanından yerel dist dizinine aktarıldı. Bu durum mobil imzalı artefaktın doğrulamasını değiştirmez.
