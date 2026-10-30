# Mobile v2 görüşme yardımcısı — 27 Ekim 2026

Kapsam: `apps/mobile-v2`; ortak API `apps/api`. Eski mobil uygulama bu çalışmanın hedefi değildir. Özellik varsayılan kapalıdır. Bu belge fiziksel cihaz pilotunun geçtiği veya mağazaya yayın yapıldığı anlamına gelmez.

## Bu devam çalışmasında yapılanlar

- Firma, kontak, fırsat ve servis arama düğmeleri mevcut CRM kimliklerini ortak başlatıcıya aktarır. Telefon açılamazsa yalnız o aramanın bağlamı temizlenir.
- iPhone dönüş bağlamı API başarılı olana kadar korunur; iki saat sınırı devam eder. Dönüş, cevaplanan görüşme olarak yorumlanmaz.
- Android sistem süre kategorisi saniye olarak işlenmez. Yalnız açık MISSED sonucu cevapsız, diğer sonuçlar unknown gönderilir.
- Aynı numaranın farklı firmalarda bulunması seçim akışına ulaşır. Farklı numaraların eşzamanlı tarama bağlamları sınırlı kuyrukta tutulur; aynı numaranın eşzamanlı aramalarında kesin korelasyon kurulmaz.
- Native bekleyen işlemler API başarısından veya şifreli JS devrinden sonra kimlikle onaylanır. Ağ hatası native kuyruğu tüketmez. JS kuyruğu farklı işlem kimliklerini korur; aynı işlem bir kez tüketilir.
- Hesap/kapsam değişiminde yardımcı ekranı sıfırlanır; eski asenkron yanıtlar ve eski taslak formundan kayıt engellenir.
- Siri not parametresi ortak text alanına aktarılır. Türkçe yazılı/sesli komut çözümleyicisi “yarın saat onda”, “on birde”, “on buçukta” örneklerini işler; geçersiz, geçmiş veya belirsiz saat için seçim gerekir.
- Android bildirim izni durumu ve manuel alternatif gösterilir.
- API ilk kayıtta öneriyi de kilitler: aynı öneriden açılmış ikinci taslak veya kapatılan öneri iş kaydı üretemez; aynı kaydın özdeş tekrar isteği idempotent kalır. Mevcut tek öneri/tek iş kaydı yaşam döngüsü korunmuştur.
- `0163_call_assistant_drafts` için eksik migration journal kaydı artan sıra/zaman damgasıyla eklendi. Migration lint 0 hatayla geçti; mevcut 78 indeks uyarısı devam ediyor.
- Sunucu taslak son kullanma zamanını döner. Saklama temizliği özellik kapalıyken de çalışır.
- Yerel modül Swift/Kotlin kaynaklarının yanlışlıkla Git tarafından yok sayılması düzeltildi; modül derleme çıktıları hariç kalır.
- Native köprü değişikliği nedeniyle uygulama/runtime sürümü 1.2.0 oldu. Önceki runtime'a OTA gönderilmemeli; yeni binary gerekir.

## Doğrulama

- Mobile v2 TypeScript kontrolü geçti.
- Mobile v2 test paketi: 483/483 geçti (yardımcı için 13 test dahil).
- API odaklı yardımcı testleri: 17/17 geçti; API TypeScript kontrolü geçti.
- Android `:haksan-call-assistant:compileDebugKotlin --offline --console=plain` geçti.
- Üç Swift kaynak dosyasının `swiftc -frontend -parse` sözdizimi kontrolü geçti. Bu kontrol Xcode build/cihaz testi yerine geçmez.
- Mevcut migration'lar bu çalışmada veritabanına uygulanmadı. Gerçek PostgreSQL üzerinde eşzamanlı kayıt/rollback testi yapılmadı.

## Açık yayın kapıları

28 Ekim devamı: Android telefon dizininin ön plana dönüşte yenilenmesi ve offline bekleyen işlem kurtarma düzeltildi. Siri işlem intent'ine müşteri arama ipucu/tarih parametreleri, ayrı tam Türkçe komut intent'i ve sekiz kısayol eklendi. Komut yalnız şifreli işlem ve inceleme ekranına aktarılır. Mobil test paketi 572/572, TypeScript ve iki Swift dosyasının iOS 16 hedefli gerçek simulator SDK tip kontrolü geçti. Yukarıdaki 483/483 ve Swift parse sonuçları önceki çalışmanın tarihsel sonuçlarıdır. Güncel ayrıntılar `mobile-v2/remaining-fixes-20261028.md` içindedir.

Sonraki kontrol: Android mikrofon iznini engelleyen medya plugin çakışması giderildi; CNG yeniden üretiminden sonra tam offline debug APK derlemesi geçti. Mobil test paketi 574/574 oldu. Ayrı geçici PostgreSQL ortamında gerçek CallAssistantService ve transaction bağlamıyla beş atomiklik testi geçti; tam migration ve gerçek aşağı akış iş servisi fixture'ı bu testlere dahil değildir. iOS tam build ve fiziksel cihaz kabulü henüz sonuçlanmadı.

Fiziksel Android/iPhone üzerinde gelen/giden, iptal/cevapsız, gizli numara, çift SIM, izin reddi, kilitli cihaz, uygulama kapalıyken Siri, Türkçe ses paketi yokluğu, hesap değişimi ve ağ tekrarları test edilmeli. Telefon/tablet yönleri, klavye ve erişilebilirlik kontrol edilmeli. iOS tam Xcode build ve Siri/App Shortcuts keşfi doğrulanmalı. AppFunctions deneysel kapsamı ve destek matrisi ayrıca doğrulanmalı.

Migration/journal durumu ve gerçek DB transaction davranışı doğrulandıktan, cihaz kapıları geçtikten sonra yeni TestFlight ve imzalı Android paketleri hazırlanmalı. Mağaza manifesti/onay kanıtları yeni sürümle hizalanmalı. Otomatik Android akışı ve Siri desteği bu kontrollerden önce tamamlandı sayılmamalı.
