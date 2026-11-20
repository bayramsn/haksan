# CRM Tutarlılık Denetimi — 31 Temmuz 2026

## Sonuç

Talepte belirtilen web CRM, stok, müşteri, fiyat listesi, PDF ve sesli/görüntülü
arama akışları kod, API sözleşmesi, veritabanı migration'ı ve regresyon testleri
üzerinden denetlendi. Bu kapsamda bulunan işlevsel tutarsızlıklar giderildi.

## Giderilen tutarsızlıklar

| Alan | Bulgu | Yapılan düzeltme |
|---|---|---|
| Stok oluşturma | Ürün kataloğu seçilmesine rağmen model/sayaç tipi ve stok kodu tekrar isteniyordu. | Ürün seçimi zorunlu ve tek kaynak yapıldı; model/sayaç/stok kodu alanları formdan kaldırıldı. |
| Kontrol ünitesi | Form verisi ile API/veritabanı alanları arasında eksik aktarım riski vardı. | Kontrol ünitesi doğrulandı, create/update akışında saklandı ve entegrasyon testi eklendi. |
| Satış stok listesi | Satışın ihtiyaç duyduğu teknik/lojistik kolonlar eksikti. | Marka, yeni/kullanılmış, ürün adı, seri, kontrol ünitesi, fener mili devri, takım adedi, motor gücü, konum, rezerv firma ve üç tarih alanı eklendi. Excel export aynı yapıya getirildi. |
| Stok tarihleri | “Geldiği tarih” için ayrı alan yoktu. | `received_date` ve yeni/kullanılmış için `item_condition` kolonları `0104_inventory_sales_columns.sql` migration'ıyla eklendi. |
| Rezerv firma değişikliği | Rezerve durumundaki stok yeniden rezerve edilemediği için firma düzenleme işlemi hata veriyordu. | Hazır veya zaten rezerve stokta firma değişimine izin veren güvenli, eşzamanlılık kontrollü güncelleme eklendi. |
| Stok export filtresi | Ekrandaki kategori filtresi export şemasında yok sayılıyordu. | `categoryCode` export sözleşmesine ve sorgusuna eklendi. |
| PDF stok kodu | Eski teklif açıklamaları proforma/sözleşme/PDF'e iç stok kodu taşıyabiliyordu. | Teklif, backend teklif PDF'i, proforma, sözleşme ve ürün teknik formunda ortak müşteri-görünür ürün etiketi kullanıldı; stok kodu render öncesi temizleniyor. |
| LOST geri açma | LOST kartı her durumda Lead'e dönemiyor, rol ve alan sıfırlamaları tutarsız kalıyordu. | Satış ve süper admin için açık/arşiv LOST → Lead geçişi eklendi; kapanış, kayıp nedeni/snapshot, takip ve onay alanları sıfırlanıp aşama geçmişi yazılıyor. |
| Atanan kullanıcı | Lead ve fırsatta satış kullanıcısı sorumluyu değiştiremiyordu. | Lead listesi, fırsat listesi ve detay ekranına kullanıcı seçimi eklendi; API satış + süper admin rollerine izin veriyor. |
| Lead sağlık testi | Girilmiş takip aksiyonu testte “eksik” bekleniyordu. | Test gerçek sağlık kuralıyla hizalandı (`actionMissing=false`). |
| Teklif akış testi | Lead → Satış kapısı sorumlu isterken test sorumlusuz fırsat oluşturuyordu. | Test fırsatı açık sorumlu ile oluşturacak şekilde hizalandı. |
| Fiyat listesi | Liste ve ürünler ada göre deterministik sıralanmıyordu. | Türkçe locale ile ürün adı ve fiyat listesi adı sıralaması eklendi. |
| Firmalar | Yalnız ada göre sıralama vardı. | Ada ve oluşturulma tarihine göre artan/azalan sıralama seçenekleri eklendi. |
| Sesli/görüntülü arama | Erken gelen ICE adayları kayboluyor, panel küçük ekranlarda taşıyor ve kısıtlı ağlarda relay seçeneği yoktu. | ICE kuyruğu/flush, bağlantı kopması ve 45 sn yanıt zaman aşımı eklendi; panel `100dvh` içinde responsive yapıldı. Coturn için backend-only secret ile süreli HMAC TURN credential endpoint'i eklendi. |

## Doğrulama kanıtları

- API regresyonu: **57 test dosyası, 296/296 test geçti**.
- Yazdırma testleri: **4 test dosyası, 16/16 test geçti**.
- Düzeltilen akışlara odaklı entegrasyon: **5 dosya, 27/27 test geçti**.
- Production build: shared, API ve web build'leri geçti.
- API sözleşme denetimi: **35 controller, doğrulanmamış Body/Query = 0**.
- Migration lint: **0 hata**; 23 adet önceden var olan büyük tablo/index uyarısı.
- Secret taraması: **1.883 repository dosyası, geçti**.
- Aksiyon envanteri: **362 API endpoint, 308 web aksiyonu, 37 taranan web sayfası**.

## Açık kalan bulgular ve operasyonel gereksinimler

### 1. Mobil parite borcu

Otomatik envanter web'deki 308 aksiyona karşı mobilde 243 aksiyon ve **70 eksik
mobil aksiyon** buldu. CRM açısından öne çıkanlar:

- 8 fırsat aksiyonu: qualification stage, convert, contact event, approval,
  company link, lead summary ve Trello import akışları.
- 2 aktivite aksiyonu: update ve delete.
- 3 teklif aksiyonu: fiyat onay/red ve durum değişikliği.
- Yeni WebRTC config endpoint'i mobil istemcide henüz kullanılmıyor.

Bu açıklar web CRM'deki bu talebin çalışmasını engellemez; mobil ürün paritesi
ayrı bir geliştirme kapsamıdır. Ayrıntılı otomatik rapor:
`docs/mobile-parity-gaps.md`.

### 2. TURN deployment ayarı

Kod STUN ile çalışır ve erken ICE kaybı giderildi. Farklı şirket ağları,
simetrik NAT veya katı firewall arkasında güvenilir medya için production'da
coturn kurulup şu backend değişkenleri tanımlanmalıdır:

- `WEBRTC_TURN_URLS`
- `WEBRTC_TURN_SHARED_SECRET`
- `WEBRTC_TURN_TTL_SECONDS`

Uzun ömürlü TURN sırrı tarayıcıya gönderilmez; API kullanıcıya süreli HMAC
credential üretir.

### 3. Ürün kataloğu veri doluluğu

Yerel katalogdaki 5 TEZGAH modeli salt-okunur sorguyla kontrol edildi:

| Zorunlu teknik alan | Dolu model |
|---|---:|
| Fener mili devri | 4 / 5 |
| Takım adedi/kapasitesi/yuva sayısı | 3 / 5 |
| Fener mili motor gücü | 1 / 5 |

Stok tablosu ve export kolonları hazırdır; katalogda değer olmayan modellerde
hücre doğal olarak boş kalır. Eksik teknik değerlerin ürün yönetiminden
tamamlanması veri kalitesi işi olarak açıktır.

### 4. Teknik borç uyarıları

- Web build'inde ana bundle boyutu için mevcut `>500 kB` uyarısı bulunuyor.
- `OffersPage` hem statik hem dinamik import edildiği için code-splitting uyarısı
  devam ediyor.
- Migration lint'teki 23 uyarı eski migration'lardaki concurrent index/unique
  deploy risklerine ait; yeni `0104` migration'ında hata veya uyarı yok.

## Otomatik raporlar

- `docs/web-action-registry.md`
- `docs/web-action-registry.json`
- `docs/mobile-parity-gaps.md`
