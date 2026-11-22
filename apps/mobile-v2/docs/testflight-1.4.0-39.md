# TestFlight 1.4.0 (39)

- Kullanıcı TestFlight gönderimini açıkça istedi. AWS/web/API yayını yapılmadı.
- EAS production iOS build: `406592d7-4489-4a03-858f-58cad2f18610`.
- EAS submission: `302e949a-3925-4929-9a76-3c92bc45546b`.
- Build sonucu: `FINISHED`; bulut arşivlemesinde 0 hata, 3 uyarı.
- Production API tek public değişken sorgusuyla doğrulandı: `https://crm.52-28-67-148.sslip.io/api/v1`.
- EAS kaynak arşivinden `.env`, özel anahtar, native yerel projeler, APK/AAB, yerel teslim dosyaları ve sunucu operasyon klasörleri dışlandı. Yüklenen arşiv 12.9 MB.
- İmzalı bulut IPA'sı indirildi (50.253.972 bayt). İçindeki Info.plist 1.4.0 / 39; EXConstants app.config canlı AWS API'sini, Expo.plist runtime 1.4.0 ve production kanalını içerir. main.jsbundle gömülü; geliştirme sunucusu gerektirmez.
- Önceki 748 mobil test, TypeScript, iOS/Android Hermes export; beş paketleme regresyon testi başarılı. Constants betiğinin boşluk içeren proje yolunda config'i atlaması kalıcı CNG düzeltmesiyle giderildi. Siri App Intents metaverisi yerel Release paketinde doğrulandı.
- Fiziksel giriş/ana sayfa, ses/video, Siri ve tüm tablet etkileşimleri bu gönderim öncesi tamamlanmış olarak raporlanmaz. Bağımlılık ağacındaki mevcut 9 high bulgu nedeniyle tüm uygulama güvenlik sertifikası verilmez.
- Son kayıt: EAS submission `FINISHED`; TestFlight/App Store Connect yükleme işlemi başarılı. Apple processing/VALID ve test cihazındaki görünürlük ayrıca doğrulanmadı. Herkese açık App Store yayını yapılmadı.
- Derleme: https://expo.dev/accounts/bayrams/projects/haksan-mobile/builds/406592d7-4489-4a03-858f-58cad2f18610
- Gönderim: https://expo.dev/accounts/bayrams/projects/haksan-mobile/submissions/302e949a-3925-4929-9a76-3c92bc45546b
