# Mobil ticari belge eşlemesi — 2026-10-26

## Uygulananlar

- Teklif formu: opsiyon satırı açıklama/adet/fiyat/iskonto/KDV düzenleme ve ekleme/silme; teknik özellik ve uyumluluk seçimleri; kayıttan önce güncel katalog, zorunlu konfigürasyon, fiyat ve para birimi doğrulaması.
- Teklif toplamları: brüt, kalem iskontosu, genel iskonto, KDV, gümrük ve genel toplam. Kur bulunamazsa gümrük/genel toplam uydurulmaz; kur yeniden yüklenebilir.
- Yeni/düzenlenen teklif, bağlı veya bağımsız proforma/sözleşme: Kaydet ve PDF al. PDF başarısızlığı kaydı yeniden oluşturmaz; detaydan yeniden denenebilir.
- Proforma: web ile aynı çıktı şablonu seçenekleri. Bu seçim yalnız PDF isteğine gider, kayıtlı şartları değiştirmez.
- Belge detayı: sunucuda PDF oluştur/paylaş; yüklenmiş nüsha ve imzalı sözleşme akışları korunur.
- Teklif/belge listelerindeki yüklenmiş nüsha ile oluşturulabilir PDF açıklamaları güncellendi.

## Sunucu

`POST /quotes/:id/generate-pdf`, `POST /proformas/:id/generate-pdf`,
`POST /contracts/:id/generate-pdf` kayıtlı veriden PDF döndürür.
Proforma isteği isteğe bağlı `{ variantKey }` alır ve ortak web şablon listesiyle doğrulanır.

Web HTML şablonları `packages/shared/src/commercial-print` altında ortak kullanılır.
Sunucu Chromium ile üretir. Fiyatlar, şartlar, firma, taksit ve teknik bilgiler
kayıtlı snapshot üzerinden okunur; güncel katalog fiyatıyla sessizce değiştirilmez.
Yetki/kiracı/bölüm/portföy denetimleri korunur. Ağ erişimi ve JavaScript kapalıdır;
yalnız doğrulanmış iç medya gömülür. PDF yanıtları özel ve önbelleksizdir.

## Doğrulama

- Mobil TypeScript ve 451 test başarılı.
- 16 API testi başarılı; üç belge türünde gerçek Chromium PDF üretimi dahil.
- 80 mevcut web yazdırma testi başarılı.
- Shared, API ve web derlemeleri; API/web TypeScript başarılı.
- iOS ve Android Expo dışa aktarımları başarılı.
- Secret taraması başarılı.

## Sınırlar ve yayın

Bu çalışma üretime veya TestFlight'a gönderilmedi; çalışan eski API yeni uçları içermez.
Eski snapshot içinde bulunmayan görsel/teknik bilgi güncel katalogdan otomatik tamamlanmaz.
Keyfi dış URL görselleri güvenlik nedeniyle indirilmez. Ortak şablon kullanımı farklı
OS fontlarında piksel eşitliği garantisi değildir. Native cihazda paylaşım ekranı
bu turda etkileşimli olarak doğrulanmadı.

API derlemesini engelleyen mevcut finans vade alanında `null` → `undefined`
normalizasyonu yapıldı; iş kuralı değiştirilmedi.
