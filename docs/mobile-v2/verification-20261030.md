# 30 Ekim 2026 — güncel çalışma ağacı doğrulaması

Bu dosyanın sonundaki devam sonuçları, aşağıdaki ilk taramada açık olarak belirtilen maddeleri günceller.

**Son durum:** mobil **588/588**, ürün backend **13/13** test geçti; mobil/API TypeScript başarılı. Fuar sözleşmesi ve ürün kurtarma kod açığı kapatıldı. Cihaz/canlı API/mağaza kabulü ve AppFunctions entegrasyonu açık.

28 Ekim raporlarının test sonuçları tarihseldir. Çalışma ağacı sonrasında değişti; aşağıdaki sonuçlar bugünkü kaynakla alınmıştır.

## Siri metadata paketleme düzeltmesi

Önceki tam iOS build başarılı olsa da uygulama metadata çıkarımı kısayol bulamamıştı. `AppShortcutsProvider`, kütüphane yerine CNG tarafından uygulama hedefinde üretilir. Intent ve şifreli Vault ortak native modülde kalır. Tek sağlayıcı ve sekiz kısayol korunur.

`plugins/assistant-shortcuts.swift.template`, `with-call-assistant.js` üzerinden `HaksanAssistantPackage.swift` içine eklenir. Kalıcı plugin ayrıca projenin development region ve Info.plist dilini `tr` yapar; mevcut desteklenen bölgeler silinmez. Önceki çıktı Türkçe ifadeleri `en` altında eğitirken, son Xcode çıktısı sekiz ifadeyi `tr` altında eğitir.

Güncel **tam imzasız arm64 iOS simulator build geçti**. Log: `/tmp/haksan-ios-shortcuts-tr-build-20261030.log`. Uygulama hedefinin metadata'sı iki intent, sekiz kısayol, açık cihaz doğrulaması ve isteğe bağlı not/arama/tarih parametreleri içerir. Widget hedefindeki kısayol bulunamadı mesajı widget'ın kısayolu olmadığı için devam eder; uygulama hedefinde sekiz ifade eğitilir.

Tekrarlanabilir çıktı kontrolü:

```sh
node apps/mobile-v2/scripts/verify-ios-assistant-metadata.mjs apps/mobile-v2/ios/build/sim/Build/Products/Debug-iphonesimulator/Haksan.app
```

Bu kontrol gerçek `extract.actionsdata` dosyasını okur. Cihazda Siri keşfi/çağrılması, kilitli cihaz davranışı veya mağaza dağıtımı kanıtı değildir.

## E-posta eki sınırı

Ortak/web/backend sınırı artık 10 ek ve toplam 25 MB. Mobil doğrulama aynı sabitleri kullanmasına rağmen hata mesajı 15 MB, testi 5 ek/15 MB olarak kalmıştı. Mesaj ortak sabitten üretilir. Sınırın hemen altı/tam sınır/üstü, adet sınırı, geçersiz yerel ve mevcut ek boyutları test edilir. Geçersiz mevcut boyutların toplam kontrolünü `NaN` ile atlaması engellendi.

## Yeni doğrulanan açık maddeler

- Mobil TypeScript güncel fuar ekranlarında iki hata veriyor: `tradeFairFollowUpSchema` artık ortak pakette yok; fuar formu gövdesi güncel takip alanlarını karşılamıyor. İlgili kaldırılmış akışın geri getirilmesi veya yeni şemaya uyarlanması gerekiyor. TypeScript başarılı olarak raporlanmaz.
- Ürün oluşturma/kurtarma servisi ve `0164_product_create_operations` migration'ı çalışma ağacında kaldırılmış. Yeni migration sırası 0168'e kadar ilerlemiş. Mevcut PostgreSQL entegrasyon testi silinmiş migration'ı okumaya çalıştığı için başlamadan başarısız. Kullanıcı tercih seçimini asistana bıraktı: yeni migration sırası korunarak tekrar kayıt/kurtarma koruması uyumlu biçimde geri eklenecek; eski numaralar veya diğer değişiklikler geri alınmayacak. Bu devamın sonunda henüz uygulanmış değildir.
- AppFunctions halen hazırlanmamış; native availability `false`. Deneysel/default-off entegrasyonun tamamlandığı iddia edilmez.
- Fiziksel cihaz pilotu, canlı DB migration/API deploy ve imzalı mağaza paketleri bu çalışmada yapılmadı.

## Test kanıtı

Siri kaynak üretimi/dil kontrolü ve mobil ek doğrulaması için odaklı üç test geçti. Tam mobil paket **578/578** geçti; log `/tmp/haksan-shortcuts-mobile-tests-20261030.log`. TypeScript logu `/tmp/haksan-shortcuts-mobile-types-20261030.log`; yukarıdaki iki hata devam ediyor. Önceki yeşil TypeScript veya PostgreSQL sayıları güncel çalışma ağacı için geçerli kabul edilmez.

## Devam: ürün kurtarma ve mobil imza API'si

Kullanıcının “sen seç” yanıtıyla yeni migration sırası korunarak ürün tekrar kayıt/kurtarma koruması geri eklendi. `0164_product_configuration_prices` korunur; operasyon tablosu yeni `0169_product_create_operations` migration'ıyla eklenir. Journal sırası günceldir. Mevcut ürün sınıflandırması, fiyat ve katalog değişiklikleri geri alınmadı.

`POST /products`, isteğe bağlı doğrulanmış UUID `Idempotency-Key` kabul eder. Tenant+kullanıcı+işlem kimliği tekildir; payload ve bölüm/departman özetiyle bağlanır. Ürün/ilişki/işlem yazımları contextual transaction kapsamındadır. `GET /products/create-operations/:operationId` güncel oluşturma yetkisini, sahibi, kapsamı ve ürün görünürlüğünü tekrar denetler. Mevcut mobil şifreli bekleyen ürün taslağı ve API istemcisi bu endpoint'lerle tekrar uyumludur.

Parent doğrulamasında iki test dosyasında **13/13** geçti; **7** tanesi yeni `0169` migration'ını uygulayan, TCP kapalı geçici gerçek PostgreSQL kümesinde çalışır. Test kendi kümesini durdurur/siler. Tam sınıflandırma/medya/audit iş servisleri kontrollü SQL yazan bağımlılıkla temsil edilir; gerçek katalog uçtan uca kabulü değildir. API TypeScript geçti. Migration lint: **0 hata, 90 uyarı**. Canlı DB migration veya deploy yapılmadı.

Mobil personel imza ekranı silinmiş `/mail/signature/users` uçlarını kullanıyordu. Liste `/mail/account/users`, görüntü okuma `/mail/account/users/:id`, kaydetme `/mail/account/users/:id/signature/image` uçlarına taşındı. Backend'in hesap yanıtından yalnız `signatureImage/signatureFilename` alınır; bulunmayan alanlar `null` olur. İki istemci sözleşme testi geçti. Backend'in super-admin/tenant yetki denetimi korunur.

Rota tarayıcısına `--all-methods` seçeneği eklendi. Koşullu yol/metot çiftleri aynı koşul için birlikte değerlendirilir; template içindeki sabit koşullu parçalar açılır. Sonuç `api-all-route-audit.json`: **508/508** çağrı yeri, eksik rota ve çözümlenemeyen ifade yok. GET raporu güncellendi: **218/218**. Bu statik kayıt kontrolüdür; canlı veri, backend'in bütün endpoint'lerinin mobilde ayrı ekranı olması veya cihaz UX kabulü değildir.

## Devam: fuar ekranları güncel backend ile uyumlu

Eski mobil takip alanları (`contacted`, `offerSent`, `customerConverted`) backend'in güncel sözleşmesi değildi. Tip hatası bastırılmadı; API DTO ve form gövdesi ortak şemaya bağlandı. Yeni kayıtta zorunlu bölüm seçilir. Ürün seçici, genel katalog yerine `/trade-fairs/products?divisionId=…` kullanır; bölüm değişince eski ürünler temizlenir, mevcut ürün adları düzenlemede korunur. En fazla 20 doğrulanmış CRM ürün kimliği seçilir. Yükleme hatası için görünür yeniden deneme vardır.

Takip ekranı `PATCH :id/called` ve `PATCH :id/quoted` uçlarını kullanır; gerçek arayan/teklif veren ve zaman bilgileri gösterilir. Firma/kontak veya fırsat oluşturma ayrı yetkiler ve açık kullanıcı onayıyla gerçek dönüşüm uçlarını kullanır. Müşteri olmuş gibi yalnız bir boolean işaretlenmez. Fırsat aşaması şartları eksikse backend'in Lead sonucu ve gerekçeleri gösterilir.

Ref tabanlı işlem kilidi çift onay/çift dokunmayı önler. Onay penceresinin eski hesabı/kapsamı veya kapanmış ekranı için callback çalışamaz. İki takip işaretinden yalnız biri kaydolursa başarılı işaret yerel baseline'a alınır; yeniden deneme onun tarihini yeniden yazmaz. Kayıt sırasında form düzenleme kilitlenir. Dosya ekleme ve düzenleme akışı korunur.

Fuar mantık/sözleşme/koruma testleri **16/16** geçti. Parent birleşik mobil test çalıştırması **588/588** ve TypeScript çıkış kodu **0**; loglar `/tmp/haksan-parity-restored-tests-20261030.log`, `/tmp/haksan-parity-restored-types-20261030.log`. Gerçek cihaz ve canlı fuar API akışı bu testlere dahil değildir.

## AppFunctions araştırmasının sınırı

Eksik gerçek entegrasyon doğrulandı: native capability sabit `false`; AppFunctions dependency/KSP/service/metadata henüz yok. Resmî Jetpack beta01 API'si `AppFunctionDeclaration` kullanıyor; genel örneklerin bir kısmı eski annotation kullanıyor. Yerel Expo Kotlin sürümü 2.1.20, KSP eşlemesi 2.1.20-2.0.1; yayımlanmış beta01'in Kotlin metadata/minCompileSdk uyumu henüz derlenerek doğrulanmadı. Bağımlılıklar cache'te yok; araştırmada indirmeler DNS hatası verdi. Bu nedenle sahte capability veya test edilmemiş üretim dependency yükseltmesi eklenmedi.

Sonraki native hazırlık varsayılan kapalı ayrı build flag/source set üzerinden, yalnız kilidi açık cihaz + etkin kullanıcı onayı + mevcut hesap kapsamıyla şifreli komut kuyruğu yazmalı; sonuç yalnız opaque inceleme kimliği olmalı. CRM verisi, token veya arka plan iş kaydı döndürülmemeli. Gemini erişimi platformun EAP sınırıdır; kodun hazırlanması veya Android16 cihazda kaydı Gemini kabulünü kanıtlamaz. Kaynaklar: [Jetpack sürümleri](https://developer.android.com/jetpack/androidx/releases/appfunctions), [güncel declaration](https://developer.android.com/reference/kotlin/androidx/appfunctions/AppFunctionDeclaration), [servis metadata API'si](https://developer.android.com/reference/kotlin/androidx/appfunctions/AppFunctionServiceEntryPoint).
