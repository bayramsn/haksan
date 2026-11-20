# Android 1.5.0 (17) — doğrulama kaydı

- EAS: [2c5136d8-c063-45c6-97b3-1e2ad09e0f6c](https://expo.dev/accounts/bayrams/projects/haksan-mobile/builds/2c5136d8-c063-45c6-97b3-1e2ad09e0f6c).
- Paket: `com.haksan.mobileapp`; izole kaynak commit: `d9618e1`.
- Durum: bulut derlemesi ve aşağıdaki AAB kontrolleri tamamlandı. Play'e yüklenmedi/yayımlanmadı.
- Dosya: `apps/mobile-v2/.expo/release-17/HAKSAN-1.5.0-17.aab` (108.129.662 bayt).
- SHA-256: `5f925baa0faf7e4cfe1c2da569acefe7a7f5c8da98cb92e1a8f15f50958353e0`.
- 16 paketindeki mikrofon izni kaybı düzeltildi. `expo-image-picker` seçeneği artık RECORD_AUDIO iznini küresel olarak engellemiyor.
- Temiz Expo SDK54 Android prebuild manifestinde RECORD_AUDIO mevcut ve altı geniş medya/depolama izni `tools:node="remove"` ile engelleniyor.
- Gerçek Expo Android ImagePicker eklentisini çalıştıran mikrofon regresyon testi dahil 6 izin testi başarılı.
- Düzeltme sonrası mobil testlerin tamamı: 112/112 başarılı.
- Son AAB manifesti için kalıcı kontrol betiği eklendi: `scripts/check-android-manifest-permissions.py`. Gerçek 16 manifestinin eksik mikrofon izni nedeniyle reddedildiği doğrulandı.
- 16'daki diğer kaynak değişiklikleri korunuyor: sistem fotoğraf seçicisi, info@haksanmakina.com.tr, 3 günde pasife alma ve verilerin saklanması açıklaması, kurumsal KVKK bağlantısı, doğru tüzel kişi unvanı.
- Chrome erişimi kullanıcı yeniden açtığını bildirdikten sonra da CUA tarafından kullanılamadı. Mevcut Chrome DevTools sayfa listeleme aracı da kullanılabilir sekme döndürmedi. Google Sites ve Play Console değişikliği yapılmadı.

## Gerçek AAB doğrulaması

- Jarsigner ve Bundletool doğrulaması başarılı.
- İmza sertifikası SHA-256, önceki 15 AAB'siyle aynı: `74:9E:0C:5E:5D:C0:7A:CC:8F:76:97:49:D5:99:A6:9E:A5:A7:13:C9:D5:7A:8C:E3:5F:A2:78:C0:6E:6A:9B:5F`.
- Paket/sürüm: `com.haksan.mobileapp`, `1.5.0`, kod `17`; minSdk 24, targetSdk 36; debuggable=false, allowBackup=false.
- İki DEX toplamı: 12,13 MB. R8 mapping gömülü ve dolu: 86.677.971 bayt.
- arm64-v8a, armeabi-v7a, x86 ve x86_64: her birinde 28 native kitaplık. Bundle yapılandırması 16 KB; tüm 64-bit ELF yükleme segmentlerinin 16 KB hizalaması başarılı.
- Son manifestte 37 benzersiz izin var. Mikrofon, kamera, ön plan konumu ve bildirim izinleri mevcut. Altı geniş medya/depolama izni, overlay ve AD_ID yok. Kalıcı manifest kontrolü başarılı.
- Kanıtlar: `.expo/release-17/aab-validation.txt`, `manifest.xml`, `permissions-validation.json`.

Gerçek cihaz ve oturum açılmış sesli/görüntülü görüşme QA'sı bu devam çalışmasında yapılmadı. Kaynak/eklenti testleri ve statik AAB kontrolü bu iş akışının fiilen test edildiği anlamına gelmez.

Kalan dış adımlar: Chrome erişimi sağlanınca Play'e 17 AAB'sinin yüklenmesi; tamamlanmamış gizlilik/saklama/sağlayıcı bilgilerinin netleştirilmesi; Google Sites ve konsol beyanlarının tamamlanması. Kamuya açık üretim yayını onayı verilmedi.

Play'e devam talebinde Chrome erişimi tekrar kontrol edildi ve kullanılamadı. Alternatif olarak aynı EAS build ID'siyle `eas submit --platform android --profile production --id ... --non-interactive --no-wait` denendi. Mevcut profil internal/draft hedefliyor; ancak Google Service Account anahtarı yapılandırılmadığı için gönderim başlamadan başarısız oldu. Play'e dosya yüklendiği veya taslak oluşturulduğu doğrulanmadı. Kullanıcıdan anahtar/parola sohbet üzerinden istenmedi.

## Doğrudan kurulum APK'sı

- Kullanıcının APK talebi üzerine doğrulanmış 17 AAB'sinden Bundletool ile universal APK üretildi: `.expo/release-17/HAKSAN-1.5.0-17-test.apk`.
- Yerel Android debug/test sertifikasıyla imzalıdır; Play yükleme sertifikasıyla aynı değildir ve Play'den kurulu uygulamanın üzerine kurulmaz. Uygulama kodu release paketinden gelir; APK debuggable=false olarak doğrulandı.
- SHA-256: `6c5d4d4da7d8a85ed6b3c69ef874a8bd14b3f8693c5039c1c02288e6b3176c43`.
- APK imzası, 16 KB ZIP hizalaması, paket/sürüm 1.5.0 (17), dört ABI, gerekli mikrofon/kamera/konum/bildirim izinleri ve yasak geniş medya izinlerinin yokluğu doğrulandı.
- Telefona kurulum veya oturum açılmış işlev testi bu APK için yapılmadı.
