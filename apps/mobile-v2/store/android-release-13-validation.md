# Android 1.5.0 (13) doğrulaması

18 Kasım 2026. EAS build `f79ccf18-b3f8-4e20-a621-de3369dc5e95`.

- Paket `com.haksan.mobileapp`, min SDK 24, hedef SDK 36.
- İmzalı AAB doğrulandı. SHA-256 `63e464639af9bea934931c32a7add25e6be36ab0c94875b15365574236b1fd72`.
- DEX toplam sıkıştırılmamış boyutu 15,42 MB. Önceki kullanıcı raporu 59,2 MB idi.
- R8 mapping AAB içinde mevcut. Play Console DEX optimizasyonunu Yüksek, kod karartmayı %84 gösteriyor. Optimizasyon ve daraltma yüzdeleri “-”; R8 tam mod kapalı. AGP 9.0 önerisi devam ediyor.
- Dört ABI korunuyor. arm64-v8a ve x86_64 ELF yükleme segmentleri 16 KB hizalı. Bundle config PAGE_ALIGNMENT_16K.
- Son AAB’den üretilen APK, 16 KB Android emülatöründe kuruldu; soğuk açılış başarılı ve Giriş Yap ekranı doğrulandı.
- Android backup kapalı, debug kapalı, SYSTEM_ALERT_WINDOW izni yok. Manifestte 42 uses-permission; Play Console toplam 43 izin gösteriyor.
- TypeScript kontrolü ve 100 mobil test geçti.

## Güvenlik değişiklikleri

Dosya yetkilendirme başlıkları API origin’iyle sınırlandı; üretimde dış dosya URL’leri HTTPS gerektiriyor. PDF akışında 25 MB sınırı ve yüklemede boyut kontrolü uygulandı. Açık oturum kapatma işareti güvenli depolamada tutuluyor ve eşzamanlı token yenileme işleminin yeniden oturum açması engelleniyor. Güvenli depolama ve biyometrik başlangıç hataları kontrollü işleniyor. R8 reflection kuralları SecureStore başlangıç hatasını gideriyor.

## Kalan sınırlar

Bağımlılık audit sonucu kritik 0, yüksek 6, orta 24. Yüksek bulgular decode-uri-component, query-string, expo-router, image-size, postcss ve zod bağımlılık ağacında. Bu rapor tüm siber açıkların kapandığı anlamına gelmez. Fiziksel cihaz ve oturum açılmış iş akışı testleri yapılmadı. Canlı Cloudflare ayarları doğrulanmadı. Google Data Safety dosyası inceleme taslağıdır; mağaza beyanı tamamlandı olarak işaretlenmedi.

AAB ve mapping yerel olarak `apps/mobile-v2/.expo/release-13/` altında saklandı.

## Play Console sonucu

Paket 13 (1.5.0) dahili test taslağına yüklendi. Eski paket 4 taslaktan çıkarıldı. Önizlemede Yayınlamaya hazır durumu görüldü; önceki iki yayınlama hatası ve eksik mapping uyarısı görünmüyor. Desteklenen cihaz sayısı 19.042. Yeni indirme boyutu 36 MB, önceki sürümden 18,4 MB küçük. Taslak kayıtlı, Kaydet ve yayınla işlemi yapılmadı.
