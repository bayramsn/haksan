# mobile-v2 uygulama ve doğrulama durumu

22 Ekim 2026 (ürün kuralı: 10 Kasım 2026). Hedef `apps/mobile-v2`; eski `apps/mobile` ayrı uygulamadır.

> Clarified: ekranlar telefonda; PDF sunucuda. Linked from design-plan.
> Verbatim: "fırsat içinden bu özellikleri ve teklifler sayfası olsun ... tuşa bastığımızda telefonda değil sunucuda oluşmasını istiyoruz"

**Ürün kuralı:** Mobilde teklif/proforma/sözleşme UI var. Taslak API ile sunucuda. PDF yalnız sunucu; mobil hazır PDF paylaşır.

## Uygulanan kapsam

- Sabit Bugün / İşler / Takvim / Modüller / Hesap sekmeleri ve sekme başına geri dönüş yığını.
- iOS sistem native sekmeleri; Android üst/alt gezinmede blur; içerik kartlarına cam yok.
- Bugün'de kişisel görevler, atanmış fırsatlar, açık servis/kurulum ve takvim.
- Modül kataloğu; firma/fırsat Özet / Süreç / Kayıtlar; Teklifler + Ticari Belge Merkezi.
- Mobil ticari taslak formları → sunucu API; PDF üretim POST’u mobilde yok.
- PDF: sunucu Chromium; web hazırlar; mobil `PreparedPdf`.
- Fuar → firma/kontak/fırsat; servis Liste/Pano; sevkiyat varış deposu.
- Şifresiz CRM disk önbelleği kapalı.

## Doğrulama kanıtları

| Kontrol | Sonuç |
| --- | --- |
| Mobil TypeScript | Başarılı |
| Mobil birim/politika testleri | 77/77 başarılı |
| API ve web TypeScript | Başarılı |
| PDF/taslak/teklif/görev gerçek PostgreSQL + MinIO entegrasyonu | 53/53 başarılı |
| Servis entegrasyonu; atanan kullanıcı kurulum filtresi dahil | 22/22 başarılı |
| PDF servis, gerçek Chromium çıktısı ve kişisel görev sayıları | 20/20 başarılı |
| Web PDF erişim/üretim ayrımı | 7/7 başarılı |
| Android ve iOS Expo export | Başarılı; native build yerine geçmez |
| Web production build | Başarılı; mevcut büyük chunk uyarısı var |
| CocoaPods senkronizasyonu | Başarılı; ExpoBlur 15.0.8 / ExpoGlassEffect 0.1.10 native projede |
| iOS arm64 Simulator native derlemesi | Başarılı; yeni binary kuruldu. Keychain yetkileri için standart imzalı test derlemesi ayrıca doğrulanıyor |
| EAS workflow kontrolü | Yerel yapısal kontrol başarılı; Expo şeması ağ erişimi nedeniyle doğrulanamadı |

PDF entegrasyonu eksik/eski dosya, çift üretimin aynı dosyayı kullanması, değişince yeni sürüm, kilitli belge, farklı tenant erişimi ve e-posta dosya SHA-256 eşitliğini kapsar. Üç PDF türü gerçekten render edildi ve tüm örnek sayfalar görsel incelendi. Bu örnekler tüm gerçek müşteri verisi kombinasyonları için görsel garanti değildir.

## Açık kabul kapıları

- Yeni iOS binary derlendi ve iPhone 17e simülatörüne kuruldu; tam native gezinme kabulü henüz bitmedi. Xcode proje okumasındaki `NSFileCoordinator` beklemesi geçici doğrulama klasörüyle aşıldı. `withIosPodMinimum` config plugin'i üçüncü taraf Pod hedeflerini uygulamanın mevcut iOS 15.1 tabanına yükseltiyor. İlk imzasız test binary'sinde SecureStore Keychain erişimi reddedildi; güvenli saklama davranışı gevşetilmeden standart Xcode imzasıyla yeniden doğrulanıyor.
- Android cihaz/emülatörde kullanım, küçük ekran, büyük yazı, karanlık tema, ekran okuyucu, klavye, safe-area ve paylaşım sayfası kabul senaryoları tamamlanmalı.
- Expo Doctor: 14/18 kontrol geçti. Monorepodaki SDK 54/57 çift paketleri ve FlashList 2.3.x / beklenen 2.0.2 farkı bildirildi; iki kontrol ağ/DNS erişimi nedeniyle tamamlanamadı. Native Pod çözümlemesi v2'nin SDK 54 sürümlerini seçiyor. Bunlar tam yayın onayı olarak gizlenmemeli.
- Depo genelindeki bağımlılık audit bulguları ayrıca ele alınmalı; bu çalışma tüm bağımlılıkların güvenlik temizliği iddiası taşımaz.
- Sevkiyat ve finansın kişisel atama alanı/API filtresi yok; İşler bu alanlarda erişilen çalışma kapsamındaki süreçleri gösterir. Kişisel atama varmış gibi etiketlenmez.

## Yayın gereksinimleri

1. API'de `0163_commercial_pdfs.sql` migration'ı uygulanmalı.
2. Shared build, Chromium ve özel dosya deposu erişimi sağlanmalı.
3. API ve web birlikte yayınlanmalı; mobil yeni native binary ile kurulmalı. Eski runtime'a yalnız OTA gönderilmemeli.
4. Açık native kabul kapıları tamamlanmadan mağaza/yayın hazır durumu verilmemeli.

Çalıştırma komutları ve çevrimdışı sınırlar `apps/mobile-v2/README.md` içinde bulunur. Bu görevde üretim ortamına deploy yapılmadı.
