# Makine fiyatları ve TestFlight — 2026-10-26

- Katalog kartları, ürün detayı, ortak ürün seçicisi ve teklif ürün seçicisinde liste/peşin fiyatları görünür.
- Kaynak mevcut CRM ürün API'sidir; fiyat listesi override kuralları değiştirilmedi.
- Eksik/geçersiz fiyat ile gerçek sıfır fiyat ayrılır. Para birimi bilinmiyorsa USD/TRY varsayılmaz.
- Makine fiyatı bilinmediğinde opsiyonlardan yanıltıcı genel toplam oluşturulmaz.
- Fiyat seçicisindeki metin dar ekranlarda sarılır.
- 452 mobil test, TypeScript ve iOS Expo dışa aktarımı başarılı.

Expo iOS bulut kotası dolduğu için 29 numaralı bulut build başlamadı.
Yerel EAS/Xcode üretim derlemesi **1.0.0 (30)** tamamlandı ve Apple'a yüklendi.
App Store Connect doğrulaması: `VALID`, `IN_BETA_TESTING`.
Apple build/delivery kimliği: `7b3e7986-ab08-4ef7-8f3d-e187850e9cfa`.
IPA: `/tmp/haksan-mobile-prices.ipa` (31.429.582 byte).
SHA-256: `003183645abfc3c4667290be356097170189f1f9a84399e55a3de9b6ef1b14fe`.
Yükleme sonucu: `UPLOAD SUCCEEDED with no errors`.

Canlı API'ye kimliksiz ve geçersiz kayıt kimliğiyle yapılan rota kontrolünde
teklif PDF yolu 401, yeni proforma/sözleşme yolları 404 döndü.
Bu çalışma API yayını yapmaz; TestFlight yüklemesi bu iki uç için sunucu yayınının yerine geçmez.

## Sonraki düzeltme

Kullanıcı 30'da açılış kapanması bildirdi. TestFlight crash raporu iOS 27 UIScene yaşam döngüsü eksikliğini doğruladı. Native düzeltme 1.0.0 (32) ile yayımlandı: Apple VALID / IN_BETA_TESTING. 31 bu native düzeltmeyi içermez. Ayrıntılar: mobile-startup-fix-2026-10-26.md.

PDF API sunucu yayını da sonradan tamamlandı: pdf-security-20261026-r3. Sağlık ve anonim PDF yetki kontrolleri geçti; gerçek yetkili kayıtla kullanıcı kabul kontrolü ayrıca yapılmalıdır. Ayrıntılar: api-pdf-security-2026-10-26.md.
