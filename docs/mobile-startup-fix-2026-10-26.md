# iOS açılış düzeltmesi — 2026-10-26

## Bildirim ve doğrulamanın sınırı

Kullanıcı iPhone’da TestFlight 1.0.0 (30) sürümünün logodan hemen sonra kapandığını bildirdi. İlk incelemede crash raporu henüz yoktu. Kullanıcının TestFlight paylaşımından sonra rapor alındı: iPhone17,3 / iOS 27.0.1, launch sonrası 155 ms içinde UIKit `___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke`, EXC_BREAKPOINT/SIGTRAP. Asıl native kapanma nedeni eksik UIScene yaşam döngüsü desteğidir. 31 yalnız JS/Keychain korumaları içerir; UIScene için yeni native paket gerekir.

Release emülatöründe Keychain erişimi reddedildiğinde (-34018) yakalanmayan başlangıç Promise hataları ve logoda kalma yeniden üretildi. Bu imzasız emülatör hatası tek başına fiziksel cihaz sorununun kanıtı değildir.

## Değişiklik

- Depolama/kuyruk başlatma ve biyometrik tercih okuma hataları yakalanır; 15 saniye süre sınırı uygulanır.
- Güvenli depolama kullanılamadığında CRM içeriği açılmadan Türkçe tekrar deneme ekranı gösterilir. Veriler silinmez.
- Başarısız kuyruk yüklemesi tekrar denenebilir; geç tamamlanan biyometrik deneme güvenlik kapısını açamaz.
- Oturum önbelleği okuması hata/süre sınırı içinde; arka planda önbellek yazım hatası yakalanır.
- iOS imzasına yalnız mevcut uygulamaya ait Keychain erişim grubu açıkça eklenir: TZ9Z6DUNC3.com.haksan.mobileapp. Apple provisioning profiliyle uyumu doğrulandı.
- Ek çalışma ağacı düzeltmesi: açılış ve yeniden bağlantı kuyruk eşitleme hataları yakalanır. Bu iki ek catch build 31 paketinden sonra uygulanmıştır; henüz yayımlanmamıştır. İlk OTA denemesi açık yetki bulunmadığı için engellendi; kullanıcı açıkça onayladıktan sonra yayınlandı. Grup d97b49b8-2dbe-480c-b755-9bef373d8b40, iOS update 01a177a9-3567-7009-aa55-34ac3ef554ad. OTA native UIScene sorununu gidermez.

## Kontroller ve paket

- TypeScript başarılı; 455 test başarılı (3 başlangıç hata/süre aşımı testi dahil).
- iOS üretim derlemesi başarılı.
- Kontrollü Keychain reddinde Release emülatörü tekrar deneme ekranına geçti: /tmp/haksan-startup-fixed-screen.png.
- 1.0.0 (31) Apple’a hatasız yüklendi; Apple VALID / IN_BETA_TESTING durumunu doğruladı.
- IPA: /tmp/haksan-startup-31.ipa
- SHA-256: 6c6f2c6011a9994a6c5eab076c76a0963835fad440907ff7e8112598e06a2778
- Apple delivery: efbe9193-8745-4d6d-bec0-21412b202642

UIScene desteği `with-ios-scene-delegate` CNG eklentisiyle eklendi; React Native başlangıcı UIWindowScene penceresine taşındı. ExpoUpdates pencere takma adı, soğuk/sıcak URL ve universal link, bildirim launchOptions ve Expo yaşam döngüsü subscriber aktarımları korundu. Eski Release paketi iOS 27 emülatöründe aynı UIKit hatasıyla kapandı; native düzeltmenin derleme/açılış doğrulaması ve yeni TestFlight paketi sürüyor. TypeScript ve 458 mobil test geçti.

TestFlight gerçek crash kaydı: 6868EDE4-07F3-4635-A16E-25684B81F7A6. UIKit ana thread Scene lifecycle assertion; JS/Hermes başlamadan kapanma. Aynı hata iOS 27 emülatörünün birleşik logunda yeniden üretildi. Yeni paket CFBundleVersion=32 ve UIWindowScene/HaksanSceneDelegate manifesti prebuild çıktısında doğrulandı.

## 32 native düzeltme doğrulaması

iOS 27 Release emülatör derlemesi başarılı (arm64 ve x86_64). Tam 32 IPA JS/manifest dosyalarıyla UIKit scene assertion oluşmadan uygulama JS ekranına geçti; imzasız emülatör Keychain kısıtı nedeniyle güvenli yeniden deneme ekranı açıldı (/tmp/haksan-ios27-exact32-screen.png). Normal kimlik doğrulamalı açılış fiziksel cihazda henüz sınanmadı.

1.0.0 (32) üretim arşivi başarılı; son IPA manifesti Haksan.HaksanSceneDelegate içerir. Apple imzasında beklenen uygulama ve Keychain grubu mevcut, get-task-allow=false. IPA /tmp/haksan-scene-32.ipa, SHA-256 e09f205a5a2ab126959a1c730c3ec0bafc891a60cbf689674cc6dc244f340096. TestFlight yüklemesi başlatıldı.

32 Apple yüklemesi hatasız tamamlandı. Delivery adc3e4fd-5a22-4461-8d5b-23ae210fb749; Apple işleme durumu takip ediliyor. Sonradan yalnız DEBUG için eski pencere/DevLauncher başlatma koşulu eklendi; 32 Release yolu değişmedi. DEBUG tam çalışma zamanı sınanmadı; plugin testleri 4/4 ve Swift parse başarılı.

Apple son durum: 1.0.0 (32) `VALID`, `IN_BETA_TESTING`. Dahili test erişimi açık; harici test durumu READY_FOR_BETA_SUBMISSION. Son TypeScript kontrolü ve 459 mobil test başarılı. Fiziksel iPhone'da 32 ile normal açılışın kullanıcı tarafından yeniden denenmesi gerekiyor.
