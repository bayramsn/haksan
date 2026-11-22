# TestFlight 1.2.0 (38): açılış çökmesi

## Bulgular

- 1.2.0 (37) için Apple TestFlight çökme raporu alındı: iPhone17,3, iOS 27.2, `EXC_CRASH (SIGABRT)`, arka plan iş parçacığında exception.
- Aynı çalışma ağacının iOS simülatöründeki açılışında şu hata yeniden üretildi: `Invariant Violation: Tried to register two views with the same name RNCSafeAreaProvider`.
- Mobil v2 safe-area-context 5.6.2 kullanırken hoist edilmiş tüketiciler 5.7.0 kopyasına ulaşabiliyordu. Benzer şekilde diğer native paketlerin Expo 57 / RN 0.86 ağacına kaçabilmesi mümkündü; mobil v2 Expo 54 / RN 0.81 kullanıyor.
- Apple raporu exception mesajını içermiyor; simülatörde yakalanan JS hatası doğrudan symbolicate edilmiş cihaz exception mesajı olarak sunulmamalı.

## Düzeltme

Metro, React/React Native ve Expo SDK native paketlerini uygulamanın canonical paket ağacından çözüyor. Expo'nun yuvalanmış SDK uyumlu bağımlılıkları korunuyor (ör. expo-asset 12). Sentry ve NativeWind resolver zincirleri korunuyor. Normal JS bağımlılıkları hiyerarşik çözümlemeyi sürdürüyor.

Web, API, veritabanı, oturum doğrulaması ve üretim Keychain politikası değiştirilmedi.

## Doğrulama

- TypeScript: geçti.
- Mobil test paketi: 648/648 geçti; dört yeni resolver regresyon testi dahil.
- iOS üretim Hermes export: geçti. Kaynak haritasında safe-area-context, screens, gesture-handler, reanimated ve expo-modules-core için yalnız mobile-v2 kopyası; expo-asset için Expo 54'ün yuvalanmış kopyası bulundu.
- Kaynak haritasındaki 45 native paketin tamamında tek kopya doğrulandı.
- Android üretim Hermes export: geçti.
- Yerel Xcode native simülatör derlemesi: `BUILD SUCCEEDED`.
- iOS 27.0 geliştirme simülatörü: duplicate native view hatası kayboldu. İlk imzasız test paketindeki Keychain hatası, yalnız simülatör derlemesine doğru uygulama/Keychain entitlement verilerek giderildi. Son denemede logo geçildi ve giriş ekranı görüntülendi; Metro kaydında fatal hata yok. Güvenli depolama kontrolü aşılmadı. Oturum açılmış CRM ekranları bu test kapsamında doğrulanmadı.
- Fiziksel iPhone/iOS 27.2 açılışı henüz doğrulanmadı.

## Yayın

- EAS build: `e0670557-e094-4864-9bb2-72a775f7302f`
- EAS submission: `5186fc44-73b0-4c4a-8b55-fe2c38247ff8`
- Sürüm: `1.2.0 (38)`
- EAS iOS arşivleme: başarılı (`ARCHIVE SUCCEEDED`, `FINISHED`).
- Expo gönderimi uzun süre `IN_QUEUE` kaldığı için bu gönderim iptal edildi; aynı imzalı IPA Apple'ın resmi `altool --upload-package` aracıyla doğrudan yüklendi. İkinci paralel yükleme yapılmadı.
- Apple yüklemesi: başarılı, çıkış kodu 0; `No errors uploading archive`.
- Apple teslim kimliği: `9ff56cf5-a575-4baa-835d-94aa8d9cfd7b`.
- Geçici Apple özel anahtar dosyası işlem sonunda silindi.
- Apple işleme: `VALID`.
- Apple build kimliği: `9ff56cf5-a575-4baa-835d-94aa8d9cfd7b`.
- TestFlight iç test durumu: `IN_BETA_TESTING`; otomatik bildirim açık.
- Dış test durumu: `READY_FOR_BETA_SUBMISSION`; dış beta incelemesine gönderildiği iddia edilmez.
