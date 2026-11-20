# Mobile-v2 iOS / Android eşitleme

## Doğrulanan neden

`apps/mobile-v2/ios/Haksan` native projesinin ikonu lacivert (#000c69) üzerinde beyaz H iken Expo app.config hâlâ varsayılan Expo ikonlarını kullanıyordu. Android bulut derlemesi Expo yapılandırmasını aldığı için görünüm ayrışıyordu. iOS ve Android build17'nin ortak uygulama ekran kaynaklarında farklı sürüm tespit edilmedi. Platformların native sekme/blur davranışları bilinçli olarak farklıdır; aynı beş sekme ve ekranlar mevcuttur.

## Düzeltmeler

- iOS native ikon ve açılış görseli değiştirilmeden `assets/brand/app-icon-ios.png` ve `splash-logo-ios.png` ortak kaynaklarına kopyalandı.
- Expo ikon, Android adaptive ikon ve splash ayarları bu ortak kaynaklara bağlandı. Lacivert zemin iOS'taki #000c69 ile eşleşir.
- Uygulama sürümü 1.5.1'e yükseltildi; native değişikliklerin önceki 1.5.0 OTA çalışma zamanı ile karışmaması sağlandı.
- `production-apk` profili production ortamını, kanalını ve mevcut uzaktan Android imzalama kimliğini kullanarak APK üretir. Eski test imzalı APK yeniden paketlenmez.
- iOS Info.plist sürüm, kamera, mikrofon, konum, fotoğraf ve Face ID açıklamaları güncellendi; görüşmeler için audio arka plan modu eklendi. Xcode marketing version 1.5.1 ile eşleştirildi. Bu kaynak düzenlemesi iOS dağıtımı değildir.
- iOS native Expo.plist'teki eski updates-disabled ayarı elle etkinleştirilmedi; sonraki iOS dağıtımı EAS ortamı ile prebuild edilerek ortak config'ten üretilmelidir.

## Kurulum ayrımı

Kullanıcı önceki APK'da “Uygulama yüklenemedi” hatası bildirdi. Hata kodu veya telefondaki mevcut imza okunmadığından kesin neden kanıtlanmadı. Önceki APK yerel debug/test anahtarıyla imzalıydı. Yeni APK mevcut EAS Android anahtarıyla imzalanır. Google Play App Signing ayrı anahtar kullanıyorsa bu APK Play'den kurulmuş paketin üzerine kurulamaz; Play güncellemesi gerekir. Kullanıcının mevcut uygulaması/verileri silinmez.

## Derleme ve doğrulama

- Kaynak mobil testleri: 112/112 başarılı.
- İzole yayın kaynağı: `dfb9ac8` (mobile-v2 kaynak ve marka varlıkları).
- EAS Android: [2ad5492f-87e6-4f4e-9515-2afdb328411e](https://expo.dev/accounts/bayrams/projects/haksan-mobile/builds/2ad5492f-87e6-4f4e-9515-2afdb328411e), sürüm 1.5.1 (18).
- Durum: EAS derlemesi başarılı; APK kontrolleri, ayrı temiz test emülatöründe kurulum ve ilk açılış başarılı.
- Dosya: `.expo/release-18/HAKSAN-Mobile-v2-1.5.1-18.apk`, 169.468.132 bayt.
- SHA-256: `c8c7667691dd9014ae310b8b6f667dd56cdce7a12c1f92aa4d15bbaf11c3437d`.
- APK sertifikası SHA-256: `749e0c5e5dc07acc8f769749d599a69ea5a713c9d57a8ce35fa278c06e6a9b5f`; önceki 17 EAS AAB'siyle aynı. Yerel debug/test sertifikası değil.
- APK imzası ve 16 KB ZIP hizalaması başarılı. Dört ABI, her birinde 28 native kitaplık; tüm 64-bit ELF yükleme segmentlerinde 16 KB hizalama başarılı. DEX 12,13 MB.
- Mikrofon, kamera, konum ve bildirim izinleri mevcut; geniş medya/depolama, overlay ve AD_ID izinleri yok. debuggable=false.
- Yalnız bu görev için `-read-only` açılan emulator-5556, önceden Haksan kurulu değil. ADB ilk kurulum sonucu `Success`; sayfa boyutu 16384. İlk açılış `Status: ok`, 7071 ms; boş gerçek giriş ekranı görüntülendi. Kullanıcı hesabıyla iş süreçleri test edilmedi.
- Launcher ekranında lacivert H ikonu görsel olarak doğrulandı; `android-launcher-icon.png`. İlk açılış kanıtı `android-first-launch.png`.
- Kullanıcının fiziksel telefondaki eski APK'sının imzası/sürümü okunmadı. Kullanıcı eski kurulumun APK üzerinden yapıldığını teyit etti. Bu APK'nın o paketin üzerine güncelleme uyumu henüz kanıtlanmış değildir; uygulama kaldırılması/veri silme yapılmadı.

## Açık emülatörün güncellenmesi

Kullanıcının emülatöre kurma isteği üzerine mevcut emulator-5554 kontrol edildi: Haksan 1.5.0 (17) kurulu. İlk deneme yetersiz alan verdi. Android `pm trim-caches 2G` yalnız önbellekleri temizleyerek boş alanı yaklaşık 666 MB'den 796 MB'ye çıkardı. Streaming kurulum tekrarında gerçek engel `INSTALL_FAILED_UPDATE_INCOMPATIBLE` oldu.

Mevcut APK'nın sertifikası `46ef8f3be07eb285afa9bb2b4dda68ca78e33d8e2881be0f400713bf920a45f3`, önceki yerel test APK'sıyla aynı. Bu nedenle 18 üretim APK'sının ayrı `HAKSAN-Mobile-v2-1.5.1-18-emulator-test.apk` kopyası aynı yerel test anahtarıyla imzalandı. Üretim APK'sı değiştirilmedi. `adb install -r --streaming` sonucu Success; eski uygulama kaldırılmadı/verileri temizlenmedi. `dumpsys package` 1.5.1 (18) doğruladı. İlk launch bekleme süresi aşılsa da sonraki start Status: ok; ekran görüntüsünde gerçek giriş ekranı açıldığı doğrulandı (`emulator-updated-screen.png`). Emülatör kullanıcıya açık bırakıldı.

Bu sonuç fiziksel telefondaki imzayı veya tüm oturum açılmış CRM işlevlerini doğrulamaz. iOS sistem sekmeleri/cam efektleri Android'de native karşılıklarıyla gösterilir; piksel düzeyinde birebir eşlik iddiası yoktur.
