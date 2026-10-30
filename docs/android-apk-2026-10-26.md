# Android APK — 2026-10-26

Kullanıcı doğrudan kurulabilir Android APK istedi. EAS production-apk profili production ortamını/channel ayarını miras alır; internal distribution + APK çıktısı kullanır. Üretim API adresi korunur. APK dosyaları artifacts altında Git dışında tutulur.

Yerel EAS build kaynak hazırlama ve mevcut Android release keystore ile imza yapılandırmasını kurdu. İlk native derleme Reanimated 4.1.7'nin Worklets kütüphanesini eski `intermediates/cmake/...` yolunda araması nedeniyle durdu. Fiziksel `/private/tmp` çalışma yolu tek başına bu sorunu çözmedi.

Kök neden: Worklets 0.5.1 çıktısı AGP tarafından `intermediates/cxx/RelWithDebInfo/<hash>/obj/<ABI>` altında üretiliyor. Üretilmiş Prefab yapılandırması doğru ABI/variant yolunu içeriyor. Paket sürümlerini değiştirmeden Reanimated CMake, Prefab'ın `react-native-worklets::worklets` hedefine bağlandı.

Kalıcı CNG eklentisi: apps/mobile-v2/plugins/with-android-worklets-prefab.js. Beklenmeyen upstream yapılandırmada fail-fast; idempotent. Üç test ve gerçek kurulu CMake dönüşüm kontrolü geçti. Toplam 462 mobil test başarılı.

Hazırlanmış yerel EAS ağacında aynı değişiklik uygulanıp Gradle assembleRelease yeniden başlatıldı; mevcut EAS credentials ve versionCode=3 yapılandırması kullanılıyor. İmza/parola değerleri loglanmadı ve repoya kopyalanmadı. Derleme/kurulum kontrolleri sürüyor.

## Son paket

Gradle assembleRelease başarılı: 1016 görev, 369 çalıştı / 647 güncel. APK artifacts/haksan-android.apk, com.haksan.mobileapp, sürüm1.0.0/versionCode3, minSdk24 (Android7), targetSdk36. APK Signature Scheme v2 doğrulaması başarılı; mevcut EAS release imzası kullanıldı.
SHA-256: 72b579e62ba5befbe8d71ffc93e37e819d5bc94e56b0e5efca4464b3be4714b9. Kurulum/açılış kontrolü sürüyor.

Son doğrulama: Pixel_9a emülatörüne kurulum Success. Uygulama başlatıldı, süreç çalışır kaldı ve Modüller ekranı render edildi (/tmp/haksan-android-apk-ready.png). İlk am start bekleme ölçümü zaman aşımına uğradı; sonraki ekran ve PID kontrolü başarılı. AndroidRuntime/ReactNativeJS hata filtresinde uygulama için hata yok. Bu bir açılış kontrolüdür; tüm modüllerin Android uçtan uca kabul testi değildir.

APK içindeki assets/app.config: üretim HTTPS API adresi doğrulandı. iOS TestFlight32 tekrar doğrulandı: VALID / IN_BETA_TESTING; fotoğraf düzeltmesi sunucu tarafında olduğu için ek iOS paketi gerekmiyor.
