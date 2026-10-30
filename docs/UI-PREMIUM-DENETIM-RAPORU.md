# Haksan ERP/CRM — Tam UI Denetimi ve Premiumlaşma Raporu

**Tarih:** 19 Temmuz 2026  
**Kapsam:** Web uygulamasındaki tüm ana sayfalar, detay yüzeyleri, dialog/popup/drawer/popover aileleri, masaüstü ve mobil yerleşimler  
**Değişmez ilke:** Bu rapor yalnızca tasarım ve kullanıcı arayüzü iyileştirmesidir. Mevcut özellikler, iş kuralları, rotalar, veri sözleşmeleri ve API davranışları değiştirilmeyecektir.

---

## 1. Yönetici özeti

Haksan'ın mevcut arayüzü zayıf bir başlangıç değil; kurumsal renk dili, modül kapsamı, responsive davranış ve veri yoğun ekran temeli iyi durumda. Uygulamanın “premium” algısını sınırlayan başlıca konu yeni özellik eksikliği değil, mevcut bilgilerin görsel önceliği, bağlamsal anlatımı ve fiziksel ürün dünyasının arayüze yeterince taşınmamasıdır.

**Genel UI olgunluk puanı: 3,4 / 5**

| Boyut | Puan | Kısa değerlendirme |
|---|---:|---|
| Marka kimliği | 3,8 | Lacivert/kırmızı ve endüstriyel tipografi ayırt edici; logo ve görsel varlık kalitesi geride kalıyor. |
| Bileşen tutarlılığı | 3,5 | Kart, tablo ve dialog dili genel olarak tutarlı; kayıt başlığı ve aksiyon hiyerarşisi standart değil. |
| Bilgi hiyerarşisi | 3,1 | Çok sayıda ekran aynı anda çok fazla eşit ağırlıklı öğe gösteriyor. |
| Veri görselleştirme | 3,1 | Grafikler temiz fakat seyrek veride gereğinden fazla alan kaplıyor ve içgörü üretmiyor. |
| Responsive dayanıklılık | 4,2 | Denetlenen ana rotalarda kontrolsüz yatay sayfa taşması görülmedi. |
| Premium görsel içerik | 1,8 | Ürün, makine, yedek parça ve referans alanlarında gerçek/standart görsel sistemi eksik. |
| Mikro etkileşimler | 2,8 | Temel hover/focus mevcut; durum geçişi, hızlı işlem ve geri bildirim dili geliştirilebilir. |
| Kurumsal üretkenlik | 3,4 | Kanban, takvim, harita ve komut araması var; kayıtlar arası standart görünüm ve kayıtlı görünüm dili eksik. |

### En büyük 12 fırsat

1. Ürünler, makineler, servis fiyat listesi ve referanslar için tutarlı gerçek görsel/3D render sistemi kurmak.
2. Tüm kayıt detaylarında standart bir “kayıt başlığı + durum + sonraki işlem + bağlam” mimarisi kullanmak.
3. Liste ve Kanban ekranlarında rahat/kompakt yoğunluk, yapışkan başlık ve satır/kart hızlı işlemleri sunmak.
4. Sol menüde sabitlenenler, son kullanılanlar ve kapatılabilir gruplarla 34 modülün bilişsel yükünü azaltmak.
5. Boş durumları genel ikon yerine modüle özgü illüstrasyon ve yönlendirici CTA ile tasarlamak.
6. Büyük ama seyrek grafikleri küçültüp “risk, değişim, neden ve sonraki adım” içgörülerine dönüştürmek.
7. Dashboard'u KPI vitrini olmaktan çıkarıp günlük operasyon alanına çevirmek.
8. Satış ve servis Kanbanlarında aşama ilerlemesi, yaşlanma ve WIP bilgisini belirginleştirmek.
9. Belge ekranlarına ilk sayfa önizlemesi, revizyon ve imza/durum bağlamı eklemek.
10. Global asistanı içerik üzerine binen yüzen düğme yerine güvenli alanı olan bağlamsal bir yüzeye dönüştürmek.
11. Türkçe arayüzde tarih, terim ve durum adlarını tamamen yerelleştirmek.
12. Dialog ve formlarda aynı bölümleme, özet, doğrulama ve birincil aksiyon standardını uygulamak.

### Öncelik tanımı

- **P0:** Görsel güven, kullanım güvenliği veya ana operasyon hızını doğrudan etkileyen konu.
- **P1:** Premium algıyı ve günlük tarama/işlem hızını belirgin biçimde artıran konu.
- **P2:** İncelik, boş durum, yardımcı görsel ve mikro etkileşim iyileştirmesi.

---

## 2. Denetim yöntemi ve kapsam kanıtı

Denetim dört kanalla yapıldı:

- Kod envanterinde **34 ana navigasyon yüzeyi**, giriş/şifre akışları, müşteri ve satış detayları ile herkese açık şikâyet formu çıkarıldı.
- Yerel çalışan uygulamada **127 masaüstü senaryosunun 116'sı** otomatik görüntülendi. Kalan 11 senaryo seçici/bağlam sınırlaması nedeniyle hedefli denetim ve kaynak incelemesiyle tamamlandı; bunlar render hatası olarak değerlendirilmedi.
- Müşteri, satış, servis, teklif, teslimat, ürün, satın alma, fatura ve herkese açık form gibi kritik yüzeyler için ayrı hedefli denetimler yapıldı.
- **28 ana modül + 5 yönetim ekranı** 390 px mobil genişlikte kontrol edildi. Harita katmanları ve bilinçli yatay durum şeritleri dışında kontrolsüz gövde taşması gözlenmedi.

Bu bir görsel ve etkileşim mimarisi denetimidir. Tam WCAG uygunluk testi, kullanıcı araştırması, görev tamamlama süresi ölçümü ve performans profili ayrıca yapılmalıdır.

---

## 3. Korunması gereken güçlü taraflar

- Barlow Condensed başlık, Inter arayüz metni ve mono veri yaklaşımı endüstriyel ürün için doğru bir temel.
- Lacivert/kırmızı ana marka ile operasyon mavisi, grafit, çelik gri ve başarı yeşili dengeli.
- “Datum rail / kalibrasyon çizgisi” motifi markaya özgü ve doğru ölçüde kullanıldığında güçlü.
- Tablo, Kanban, takvim, harita, komut paleti ve yardımcı asistan gibi farklı çalışma biçimleri zaten mevcut.
- Dialoglar genel olarak ekran içinde kalıyor; mobil ana rotalarda belirgin yerleşim kırılması yok.
- Satış ve servis detaylarında üç kolonlu bağlam + içerik + aktivite yapısı güçlü bir başlangıç.
- Dashboard, raporlar ve harita ilk bakışta kurumsal ve güven veren yüzeyler.

---

## 4. Rakip kıyası: bizde eksik olan UI kalıpları

| Ürün | Güncel güçlü kalıp | Haksan'daki boşluk | UI-only karşılık |
|---|---|---|---|
| Zoho CRM | Rol bazlı Canvas düzenleri, yeniden kullanılabilir kayıt bileşenleri, koşullu görünürlük ve görsel kayıt sayfaları | Modüller arasında kayıt başlığı ve detay kompozisyonu değişiyor | Rol bazlı varsayılan yoğunluk ve tek bir kayıt başlığı/form sistemi |
| Trello | Board, Table, Calendar, Timeline, Dashboard ve Map arasında kolay geçiş; kart üzerinde hızlı işlemler | Görünümler modül bazında var ama ortak bir görünüm değiştirici dili yok | Uygun modüllerde standart görünüm seçici, kart hover işlemleri ve kompakt yoğunluk |
| Odoo CRM | Sürükle-bırak akışı, sıradaki aksiyonun güçlü gösterimi, 360 derece fırsat geçmişi | Kayıtlar durumu gösteriyor; “şimdi ne yapılmalı?” bağlamı zayıf | Her kayıt başlığında sıradaki aksiyon, sorumlu, tarih ve risk özeti |
| HubSpot | Kaydedilmiş/preset görünümler, durgun/riskli fırsat filtreleri, sağ bağlam paneli ve yönlendirilmiş aksiyonlar | Filtreler var ama risk/aktivite odaklı hazır çalışma alanları tutarlı değil | “Bugün”, “geciken”, “aktivitesiz”, “riskli” görsel presetleri ve bağlam paneli |
| Salesforce | Kanban/liste geçişi, kart detay paneli, aşama rehberliği ve uyarılar | Kanban kartları kalabalık; detay için bağlam kaybı yaşanıyor | Karttan hızlı yan panel, aşama rehberi, yaşlanma ve WIP göstergesi |
| monday CRM | Aktivite, pipeline ve rapor içgörülerinin aynı iş bağlamında toplanması | Global asistan ayrı ve yüzen; kayıt bağlamına yeterince gömülü değil | Asistan/öneriyi ilgili kayıt detayının içgörü alanına bağlamak |

**Sonuç:** Rakiplerin renk veya genel görünüşünü kopyalamak gerekmiyor. Haksan'ın avantajı “teknik hassasiyet + operasyonel netlik” olabilir. Eksik olan, bu kimliği her kayıt ve çalışma alanında aynı disiplinle uygulamaktır.

Kaynaklar: [Zoho CRM Canvas](https://help.zoho.com/portal/en/kb/crm/faqs/canvas/articles/faq-canvas-in-zoho-crm), [Trello Views](https://trello.com/en/guide/activate-views), [Odoo CRM Features](https://www.odoo.com/app/crm-features), [HubSpot Sales Workspace](https://knowledge.hubspot.com/prospecting/create-and-manage-deals-in-the-sales-workspace?app=1), [Salesforce Kanban](https://help.salesforce.com/s/articleView?id=sf.kanban_use.htm&language=en_US&type=5), [monday CRM](https://monday.com/crm/features).

---

## 5. Önerilen premium tasarım yönü

### 5.1 Tasarım tezi

**Teknik hassasiyet + operasyonel netlik.** Uygulama gösterişli bir tüketici ürünü gibi değil; pahalı fiziksel makineleri, uzun satış döngülerini ve kritik servis operasyonlarını yöneten güvenilir bir kontrol yüzeyi gibi hissettirmeli.

### 5.2 Görsel sistem

| Katman | Öneri |
|---|---|
| Renk | Mevcut Navy `#000C69`, Red `#CF060C`, Operation Blue `#2457D6`, Graphite `#18202A`, Steel Canvas `#F4F6F8`, Success `#087F5B` korunmalı. Durum renkleri semantik olarak sabitlenmeli. |
| Tipografi | Barlow Condensed yalnızca sayfa/kayıt başlığı ve güçlü sayılar; Inter gövde ve kontroller; mono font seri no, tutar ve teknik veri için kullanılmalı. |
| Köşe/gölge | 10 px temel radius; en fazla üç yükselti seviyesi. Gölge sadece etkileşimli/yükselmiş yüzeyde. |
| İmza motifi | Datum rail; kayıt başlıkları, makine detayı ve çıktı önizlemesinde sınırlı. Her karta uygulanmamalı. |
| Yoğunluk | Varsayılan “rahat”, uzman kullanıcı için “kompakt”; tablo ve Kanban aynı yoğunluk tercihine uymalı. |
| Hareket | 160–220 ms hover, aşama geçişi ve sayı geri bildirimi; `prefers-reduced-motion` desteği. |
| İkon | Eylemler ve durumlar için tek çizgi stilinde Lucide; yalnız alan nesneleri için özel CNC glifleri. |

### 5.3 Standart kayıt başlığı

Her müşteri, satış, teklif, makine, sevkiyat, kurulum ve servis detayında aynı sırayı kullanın:

1. Kimlik: logo/foto/render + kayıt adı + kod/seri no.
2. Durum: tek güçlü durum rozeti veya gerçek stepper.
3. Bağlam: müşteri, sorumlu, lokasyon, son aktivite.
4. Sıradaki adım: tarih, sahip, risk ve tek birincil CTA.
5. İkincil işlemler: gruplanmış menü; yıkıcı işlem ayrı ve düşük görsel ağırlıkta.

### 5.4 Standart liste ve form dili

- Yapışkan tablo başlığı; kimlik sütunu gerektiğinde dondurulmalı.
- Kolon seçici, rahat/kompakt yoğunluk ve modüle uygun kayıtlı görünüm görsel olarak standartlaştırılmalı.
- Satır hover'ında en fazla üç hızlı işlem gösterilmeli.
- Uzun form tek blok olmamalı; kimlik, ilişki, finans, teknik bilgi gibi bölümlere ayrılmalı.
- Formun sağında veya üstünde kısa kayıt özeti bulunmalı; alt aksiyon çubuğu yapışkan olmalı.
- Hata, başarı, kaydedilmemiş değişiklik ve yükleme durumları aynı desenle gösterilmeli.

---

## 6. Sayfa bazında tam denetim

### 6.1 Giriş, kabuk ve genel çalışma alanları

| Sayfa/yüzey | Puan | Gözlenen eksik | Önerilen UI değişikliği | Görsel fırsat | Öncelik |
|---|---:|---|---|---|---|
| Giriş | 4,0 | Sol tarafta küçük özellik kartları kalabalık; logolar düşük çözünürlüklü; sağda kullanılmayan alan var | Vektör logolar, daha net tek mesaj, daha az yardımcı kart, güçlü form odağı | Tek ve sakin isometrik CNC hücresi/3D makine renderı | P1 |
| Şifremi Unuttum | 3,7 | Bağlam sade fakat marka devamlılığı zayıf | Giriş ile ortak hero/başlık, ilerleme ve gönderim sonrası net durum | Küçük çizgisel güvenlik/anahtar illüstrasyonu | P2 |
| Yeni Şifre Belirleme | 3,7 | Parola kuralı ve başarı beklentisi yeterince görsel değil | Canlı kural listesi, güç göstergesi, başarı ekranı | Dekoratif görsel gereksiz | P2 |
| Uygulama kabuğu / sol menü | 3,4 | 34 modül uzun scroll yaratıyor; aktif bağlam ve rol odağı zayıflıyor | Kapatılabilir gruplar, sabitlenenler, son kullanılanlar, daha net aktif rail | Vektör logo ve alan nesnesi glifleri | P0 |
| Üst bar | 3,5 | Global aksiyonlar aynı ağırlıkta sıkışıyor | Birincil hızlı oluştur, arama ve bildirim hiyerarşisi; ekran başlığını bağlama dahil etme | Görsel gereksiz | P1 |
| Dashboard | 3,8 | Altı KPI kartında sayı kesiliyor; bazı ikonlar semantik değil; grafikler fazla yüksek | 3–4 ana KPI + ikincil mini şerit; “Bugün/Riskte/Sıradaki” alanı; tarih karşılaştırma | Banner'da çok hafif teknik makine line-art; grafiklerde sparkline | P0 |
| Chat | 2,5 | Büyük boş tuval ve genel konuşma ikonu | Yönlendirici boş durum, konuşma grupları, kaliteli avatarlar ve net yeni sohbet CTA | Takım/servis temalı 2D/isometrik boş durum | P1 |
| Takvim | 3,8 | Koyu operasyon banner'ı fazla alan kaplıyor; boş ay cansız | Daha kompakt üst özet, sağ “yaklaşanlar” rail'i, açıklayıcı legend ve sürükleme geri bildirimi | Yalnız onboarding/boş durumda takvim + dişli illüstrasyonu | P1 |
| Çağrı Asistanı | 3,2 | Bekleyen/işlenen/yoksayılan çağrılarda niyet, önem ve önerilen eylem hiyerarşisi zayıf | Çağrı kartında firma, intent, güven, aciliyet, süre ve tek sonraki aksiyon | Dalga formu/telefon glifi; boş durumda hafif illüstrasyon | P0 |
| Global Arama | 3,8 | Sonuç tipinde İngilizce `customer` gibi etiketler; grup ve klavye rehberi sınırlı | Tam Türkçe türler, son aramalar, aksiyon grupları, klavye ipuçları | Tutarlı modül ikonları | P1 |
| Hızlı Oluştur | 3,4 | Yalnız üç öğe; görsel gruplama ve bağlam zayıf | Mevcut eylemleri modüle göre grupla, kısa açıklama ve son kullanılan sırası | Çizgi ikon yeterli | P2 |
| Bildirimler | 3,0 | 75 yeni gibi büyük yığın; tekrar eden çağrı bildirimleri; küçük yoksay aksiyonu | Bugün/Önceki grubu, okunmadı işareti, toplu işlem, olay tipi ikonları | Küçük semantik ikonlar | P0 |
| Kullanıcı menüsü | 3,8 | Temel olarak güçlü | Aktif rol/departman bağlamını daha net, profil/ayar ayrımını görsel olarak kuvvetli yap | Avatar | P2 |
| Global Asistan | 2,9 | Sağ alt içerik ve tablo aksiyonlarının üzerine binebiliyor | İçerik safe-area'sı, küçültülmüş/dock edilmiş durum, kayıt bağlamına taşınan içgörü paneli | Marka glifi; 3D kullanılmamalı | P0 |

**Teknik/polish notu:** Yardım merkezi tetikleyicisiyle ilişkili `SlotClone`/ref React uyarısı görüldü. Bu doğrudan bir görsel hata olmasa da tooltip/focus erişilebilirliğini kırabilecek bir P1 kalite borcudur.

### 6.2 Satış ve CRM

| Sayfa/yüzey | Puan | Gözlenen eksik | Önerilen UI değişikliği | Görsel fırsat | Öncelik |
|---|---:|---|---|---|---|
| Firmalar | 3,7 | Filtre alanı uzun; firma ikonları tekrarlı; sağlık ve sonraki işlem yok | Tek saved-view toolbar, firma logosu, sağlık/son aktivite/sonraki işlem; yapışkan başlık | Firma logosu; harita küçük önizleme | P0 |
| Firma Detayı | 3,7 | Sekmeler bilgi açısından güçlü fakat kayıt başlığı ve aksiyon bağlamı standart değil | Standart kayıt başlığı, ilişki özeti, aktivite timeline, yapışkan birincil aksiyon | Logo ve tesis/fabrika fotoğrafı isteğe bağlı | P1 |
| Kişiler | 3,8 | Genel initials; hızlı iletişim eylemleri ve ilişki bağlamı zayıf | Kaliteli avatar/initials, birincil kişi semantiği, satır hover'ında ara/e-posta, firma bağlamı | Avatar/foto | P1 |
| Satış Kartları / liste | 3,5 | Durum, tutar, sahip ve sonraki işlem aynı hiyerarşide | Kimlik ve fırsat değerini öne çıkar; risk ve sıradaki adımı standartlaştır | Ürün/makine küçük görseli | P0 |
| Satış Kanban | 3,6 | Kartlar kalabalık; Proforma/Sözleşme aksiyonları sürekli görünür; boş kolonlar yer tutuyor | Kompakt/rahat kart, hover aksiyonları, sticky kolon toplamı, WIP/yaşlanma, boş kolon daraltma | Ürün küçük resmi, aşama ikonları | P0 |
| Satış Kartı Detayı | 3,7 | Tüm aşama pill'leri aynı lacivert; tamamlanan/mevcut/gelecek ayrımı zayıf; çok chip var | Gerçek stepper, risk/sıradaki eylem özeti, düzenli aktivite timeline, yıkıcı aksiyonu geri çek | Makine thumbnail veya teknik çizim | P0 |
| Satış Haritası | 3,8 | Filtre paneli düz/disabled görünümlü; seçili sonuç ilişkisi zayıf | Güçlü marker-row eşleşmesi, cluster/heatmap durumları, seçili firma kartı | Kategori marker glifleri, logo | P1 |
| Teklifler | 3,7 | Büyük trend grafiği; ret oranının nedeni/aksiyonu yok; detay footer'ında eşit ağırlıklı çok işlem | Kompakt trend + içgörü, ret nedeni özeti, yapışkan birincil aksiyon, ikincil menü | PDF ilk sayfa önizlemesi | P0 |
| Proformalar | 3,0 | Tek KPI kartı dengesiz; satırlar genel; uzun müşteri metni zor taranıyor | Kompakt özet şeridi, belge kapağı, revizyon/durum/sonraki işlem | İlk sayfa thumbnail | P1 |
| Sözleşmeler | 3,0 | Proformayla aynı genel tablo hissi; imza ve revizyon bağlamı zayıf | İmza durumu, revizyon, geçerlilik ve sonraki işlem; birleşik belge timeline | İlk sayfa thumbnail / imza glifi | P0 |
| Dokümanlar | 3,2 | Yedi KPI tek sırada ve bazı etiketler kesiliyor; taksonomi dağınık | Belge türlerini grupla; son/pending alanları; ortak preview drawer | PDF/PNG ilk sayfa önizlemesi | P0 |
| Satış Fiyat Listesi | 3,1 | Alt alan boş; seçenek chip'leri daralıyor; ürün kimliği zayıf | Görsel ürün satırı/kartı, fiyat karşılaştırma, net düzenleme affordance, detay paneli | Gerçek ürün cutout veya 3D render | P0 |
| Referanslar | 2,4 | Yalnız arama + düz tablo; projenin niteliği görünmüyor | Zengin satır veya kart/list görünümü; makine, tarih, lokasyon, ana kişi ve proje vurgusu | Gerçek makine fotoğrafı, logo, 3D ürün cutout | P0 |

### 6.3 Operasyon, ürün, stok, satın alma ve lojistik

| Sayfa/yüzey | Puan | Gözlenen eksik | Önerilen UI değişikliği | Görsel fırsat | Öncelik |
|---|---:|---|---|---|---|
| Ürünler | 3,2 | Thumbnail'ler küçük/tutarsız; kategori sekmeleri sıkışıyor; katalog hissi zayıf | Görsel katalog varsayılanı + liste alternatifi, seri grupları, güçlü fiyat/uygunluk, tutarlı crop | En yüksek öncelikli şeffaf WebP/AVIF 3D ürün renderları | P0 |
| Stok | 3,5 | Seyrek veride büyük grafikler; kritik stok aşağıda kalıyor | Kritik/yeniden sipariş alanı üstte, kompakt dağılım, depo heatmap/rack görünümü | Ürün görseli; yalnız genel/boş durumda küçük 3D raf/kutu | P0 |
| Satın Alma Siparişleri | 3,2 | Tek tedarikçi grafiği fazla alan; ETA/onay/status yolculuğu zayıf | Kompakt tedarikçi içgörüsü, ETA ve onay stepper'ı, zengin satır kimliği | Boş durumda palet/konteyner illüstrasyonu | P1 |
| Sevkiyatlar | 3,4 | Donut büyük; rota ve taşıyıcı olmasına rağmen yolculuk görsel değil | Rota strip/stepper, gümrük ve ETA, taşıyıcı logosu, kompakt dağılım | Detay/boş durumda 3D konteyner veya kamyon | P1 |
| Kurulumlar | 3,4 | Yaklaşan ziyaret alanı iyi; ana listede teknisyen, durum ve rota önceliği zayıf | Kurulum yolculuğu, teknisyen/tarih chip'i, upcoming route rail, ürün görseli | Makine kurulum illüstrasyonu yalnız boş durumda | P1 |
| Teslimatlar | 3,1 | Tablo seyrek; genel firma ikonları; durum seçiciler baskın | Makine/ürün görseli, imza/form durumu, teslim milestone ve yakın teslimler | Makine thumbnail; boş durumda teslim illüstrasyonu | P1 |
| Makineler / Varlıklar | 2,5 | Müşteri öne çıkarken makine, model, seri ve garanti kimliği geride kalıyor | Makine-first kart/tablo; seri/model, garanti progress, saha, servis durumu; güçlü detay başlığı | En yüksek öncelikli gerçek/3D makine renderı, opsiyonel turntable | P0 |

### 6.4 Finans

| Sayfa/yüzey | Puan | Gözlenen eksik | Önerilen UI değişikliği | Görsel fırsat | Öncelik |
|---|---:|---|---|---|---|
| Ödemeler ve Kasa | 3,5 | Aynı KPI'da karışık para birimleri; boş denge alanı | Para birimi bazlı bakiye kartı, nakit akışı sparkline, yaklaşan risk, hizalı mono sayılar | Dekoratif görsel yok | P0 |
| Muhasebe Faturaları | 3,5 | Tablo iyi fakat gecikme/aging ve belge bağlamı zayıf | Aging durumu, vade planı, sticky toplam ve invoice preview | Belge thumbnail | P1 |
| Cari Hesaplar / Müşteri Bakiyeleri | 3,3 | Yatay yoğunluk yüksek; firma kimliği kayboluyor | Dondurulmuş firma kolonu, aging bucket/heatmap, bakiye trendi, para birimi netliği | Dekoratif görsel yok | P0 |
| Vadeler | 3,7 | Küçük yoğun event kartları ve “+17 daha” bağlamı azaltıyor | Takvim + agenda split, legend, tutar hiyerarşisi, risk rozeti, günlük sticky özet | Dekoratif görsel yok | P1 |

### 6.5 Servis

| Sayfa/yüzey | Puan | Gözlenen eksik | Önerilen UI değişikliği | Görsel fırsat | Öncelik |
|---|---:|---|---|---|---|
| Servis Talepleri | 3,2 | Satırlarda boşluk fazla; badge'ler üst üste; SLA, sahip ve sonraki işlem zayıf | Sorun özeti + aciliyet/SLA + sahip + sonraki adım kolonları; hazır görünümler | Makine thumbnail ve arıza glifi | P0 |
| Servis Talebi Detayı | 3,5 | Sekme adları daralıyor; makine/garanti bağlamı görsel olarak zayıf | Makine başlığı, garanti göstergesi, servis journey stepper, güçlü zamanlayıcı ve aksiyon alanı | Teknik makine line-art / parça görseli | P0 |
| Servis Kanban | 3,2 | İlk aşamada yüzlerce kayıt; kart ve kolonlar operasyon taramasına göre büyük | Kompakt kart, WIP/aging, boş kolon daraltma, sticky toplam, hızlı detay paneli | Makine/parça küçük görseli | P0 |
| Servis Fiyat Listesi | 3,0 | Aynı/ilgisiz görsel tekrar ediyor; parça güvenilirliği düşüyor | Standart 48–64 px parça görseli, üretici, uyumluluk ve fiyat hiyerarşisi | Gerçek makro fotoğraf veya temiz 3D exploded-part render | P0 |
| Herkese Açık Servis Şikâyeti | 3,8 | Responsive temel güçlü; güven ve süreç beklentisi daha iyi anlatılabilir | Adım göstergesi, dosya gereksinimi ipucu, gönderim sonrası takip beklentisi | Hafif servis/teknisyen line-art | P1 |

### 6.6 Raporlama, yönetim ve ayarlar

| Sayfa/yüzey | Puan | Gözlenen eksik | Önerilen UI değişikliği | Görsel fırsat | Öncelik |
|---|---:|---|---|---|---|
| Raporlar | 3,8 | Dört kolonlu özet yoğun; aksiyon metinleri daralıyor; içgörü önceliği sınırlı | Öncelikli içgörü kartları, sparklines, drilldown hiyerarşisi, kayıtlı rapor presetleri | 3D/dekoratif görsel yok | P1 |
| Kullanıcılar | 3,1 | Ay seçici/tarih yereli sıkışıyor; kilitli hesap alanı boşken büyük; kimlik/status yeterince görünür değil | Avatar, aktif/kilitli durum, rol/departman chip'i, kompakt kilitli uyarı | Avatar | P0 |
| Roller | 3,5 | Yetki matrisi büyük; eksenleri takip etmek zor | Yapışkan ilk kolon ve başlık, modül accordion'u, satır/kolon seçim kontrolü, efektif yetki özeti | Görsel yok | P0 |
| Departmanlar | 2,7 | Çok seyrek; tekrarlanan “Hedef Belirle”; organizasyon ilişkisi görünmüyor | Aynı kayıtlarla organizasyon kartı/ağaç görünümü, yönetici/hedef özeti, daha iyi kod-açıklama hiyerarşisi | Yalnız boş durumda basit organizasyon line-art | P1 |
| Ayarlar — Genel | 3,0 | Çok geniş boş alan; kayıt davranışı ve bölüm sınırları zayıf | İki kolonlu düzen, sticky sol alt menü, bölüm açıklaması, kaydedilmemiş değişiklik barı | Görsel yok | P1 |
| Ayarlar — Şirket | 3,1 | Marka/kurum alanlarında canlı bağlam yok | Logo/renk/kurumsal bilgi için güvenli canlı önizleme ve bölümleme | Logo ve marka varlık önizlemesi | P1 |
| Ayarlar — Bildirimler | 3,1 | Tercihlerin etki alanı ve kanal hiyerarşisi daha net olabilir | Kanal bazlı matris, kritik olay grubu, sticky kaydet ve değişiklik özeti | Semantik kanal ikonları | P1 |
| Ayarlar — CRM Alanları | 2,9 | Alan yöneticisi yoğun; kapsam ve bağımlılıklar kolay kayboluyor | Ağaç/accordion, alan tipi chip'i, sürükleme tutamacı, sticky aksiyon, önizleme | Görsel yok | P0 |
| Ayarlar — Teknik Bilgiler | 2,9 | Teknik alan yapısı yoğun ve eşit ağırlıkta | Kategori ağacı, kapsam etiketi, kullanım önizlemesi, silme/bağımlılık teyidi | Domain glifleri; 3D yok | P0 |

---

## 7. Tüm popup, dialog, drawer ve popover denetimi

Aşağıdaki öneriler mevcut aksiyonları değiştirmez; açılan yüzeylerin başlık, özet, bölümleme, risk ve birincil aksiyon dilini standartlaştırır.

### 7.1 Global, auth ve çağrı yüzeyleri

| Yüzey | UI iyileştirmesi | Öncelik |
|---|---|---|
| Manuel Santral | Numara/kişi bağlamı, son arama ve tek güçlü arama CTA'sı; keypad görsel ritmi | P1 |
| Onay Bekleyen Firma Talepleri | Talep özeti, değişen alan vurgusu, onay/ret gerekçesi ve sticky karar barı | P0 |
| Global Arama | Türkçe sonuç tipi, gruplu sonuçlar, son kullanılanlar ve klavye ipucu | P1 |
| Hızlı Oluştur | Eylem ikonları, kısa açıklama ve son kullanılan önceliği | P2 |
| Yardım Merkezi | Kategori hiyerarşisi, arama, ilgili ekran bağlamı; tetikleyici ref uyarısını giderme | P1 |
| Bildirim popover'ı | Gün/olay grubu, toplu okundu, okunmadı ayrımı ve daha büyük hedefler | P0 |
| Kullanıcı menüsü | Aktif rol/departman, hesap ve sistem işlemlerini ayıran bölümleme | P2 |
| Asistan paneli/drawer | Kayıt bağlamı, kaynak/öneri ayrımı, dock/minimize ve içerik safe-area | P0 |
| Şifremi Unuttum | E-posta adımı, gönderim sonrası durum ve geri dönüş linki | P2 |
| Yeni Şifre Belirleme | Parola kuralları, güç göstergesi ve başarı teyidi | P2 |
| Çağrı eylem dialogları | Arayan/firma özeti sabit; dinamik form bölümleri; sonuç aksiyonu sticky | P0 |
| Manuel Arama Kaydı | Numara, tarih, sonuç, not ve ilişkilendirilen kayıt blokları | P1 |

### 7.2 Firma, kişi, satış ve aktivite yüzeyleri

| Yüzey | UI iyileştirmesi | Öncelik |
|---|---|---|
| Yeni Firma | Kimlik/iletişim/vergi/adres bölümlemesi, sağ kısa özet, sticky kaydet | P0 |
| Firma Düzenle | Değişen alan vurgusu ve kaydedilmemiş değişiklik barı | P1 |
| Firma Detayı dialog'u | Sayfa detayıyla aynı standart kayıt başlığı ve sekme dili | P0 |
| Firma Silme | Firma adı, etkilenen kayıt özeti ve geri dönüşsüzlük metni | P0 |
| Borç Dağılımı | Para birimi ayrımı, aging dağılımı, toplam ve vade hiyerarşisi | P1 |
| Yeni Kişi | Kimlik/firma/iletişim bölümlemesi ve birincil kişi açıklaması | P1 |
| Kişi Düzenle | Değişiklik özeti, avatar/firma bağlamı | P2 |
| Kişi Detayı | Hızlı ara/e-posta, firma ve son aktivite özeti | P1 |
| Kişi Silme | Kişi/firma kimliği ve ilişkili kayıt uyarısı | P0 |
| Yeni Satış Kartı | Adımlı veya bölümlü form; müşteri/ürün/değer/sahip özeti | P0 |
| Satış Kartı Detayı | Gerçek stepper, risk ve sonraki adım; daha sade footer | P0 |
| Kaybedildi Olarak İşaretle | Neden seçenekleri, not, sonraki öğrenim ve net sonuç özeti | P0 |
| Satış Kartı Silme | Etkilenen teklif/proforma/sözleşme sayısı ve açık kimlik | P0 |
| Yeni Aktivite | Aktivite türü, tarih/saat, sahip ve ilişki bağlamını tek satır özette göster | P1 |
| Aktivite Düzenle | Önceki/yeni zaman ve sahip değişikliğini okunur tut | P2 |
| Ödeme Planı | Taksit timeline'ı, toplam doğrulaması, para birimi ve kalan tutar | P0 |
| Yeni Teklif | Müşteri/ürün/bedel özeti, bölümleme ve sabit toplam alanı | P0 |
| Teklif Düzenle | Revizyon numarası, değişen kalemler ve toplam farkı | P0 |
| Teklif Detayı | Belge preview + metadata + tek birincil işlem; ikincilleri menüle | P0 |
| Stok Seçimi | Arama, uygunluk/rezervasyon, ürün thumbnail, seçili özet | P0 |

### 7.3 Belge yüzeyleri

| Yüzey | UI iyileştirmesi | Öncelik |
|---|---|---|
| Yeni Proforma | Müşteri, teklif kaynağı, tutar ve tarih blokları; sticky oluştur | P1 |
| Yeni Sözleşme | Taraflar, tarih, şablon, imza ve belge özeti | P0 |
| Doküman Yükle | Drag-drop, izin verilen tür/boyut, ilerleme, kategori ve güvenli dosya özeti | P0 |
| Doküman Önizleme | Büyük preview, sayfa kontrolleri, metadata ve eylem rail'i | P0 |
| Doküman Detayı | Revizyon, sahip, ilişki ve aktivite; preview ile aynı yüzey dili | P1 |
| Belge Şartları Şablon Editörü | Bölüm navigasyonu, değişiklik durumu, önizleme ve sticky kaydet | P0 |
| Kargo Etiketi Yazdır | Gerçek baskı boyutu önizlemesi, yazıcı/kağıt bilgisi ve güvenli print CTA | P1 |

### 7.4 Ürün, stok, satın alma ve lojistik yüzeyleri

| Yüzey | UI iyileştirmesi | Öncelik |
|---|---|---|
| Ürün İçe Aktar | Dosya gereksinimi, kolon eşleme, hata önizleme ve sonuç özeti | P0 |
| Yeni Ürün | Görsel yükleme, kimlik/fiyat/teknik veri bölümlemesi; canlı kart preview | P0 |
| Ürün Düzenle | Mevcut render, değişiklik özeti ve teknik alan grupları | P0 |
| Ürün Detayı | Büyük ürün görseli, seri/model, fiyat ve teknik özellik grid'i | P0 |
| Opsiyonel Ekipman Ekle | Uyumluluk, thumbnail, fiyat ve seçili toplam | P0 |
| Ürün Silme | Bağlı teklif/stok/servis kaydı özeti | P0 |
| Yeni Stok Kalemi | Ürün, depo, miktar, kritik eşik ve birim özeti | P0 |
| Rezervasyon Firması | Firma arama, seçili firma özeti ve rezervasyon etkisi | P1 |
| Makine Rezervasyonu | Makine renderı, seri no, uygunluk, süre ve çakışma uyarısı | P0 |
| Satın Alma Siparişi Oluştur | Tedarikçi, kalemler, ETA, toplam ve onay özeti | P0 |
| Satın Alma Siparişi Detayı | Onay/teslimat stepper'ı, satır toplamı ve belge ilişkileri | P0 |
| Yeni Sevkiyat | Rota, taşıyıcı, kalemler, ETA ve gümrük bölümlemesi | P0 |
| Yeni Teslimat / Kurulum Raporu | Makine, firma, fotoğraf/imza, kontrol listesi ve tamamlama özeti | P0 |
| Kurulum Raporu | Fotoğraf/evrak preview, teknisyen ve imza doğrulaması | P0 |
| Yeni Kurulum | Makine, saha, teknisyen, tarih ve hazırlık özeti | P0 |
| Yeni Makine / Varlık | Ürün renderı, seri/model, müşteri/saha, garanti ve sahiplik | P0 |
| Makine Detayı | Makine-first hero, garanti progress, servis geçmişi ve teknik bilgi | P0 |
| Kullanıcı Firması | Kullanıcı-firma ilişki kapsamı ve etkisini açık özetle | P1 |

### 7.5 Finans yüzeyleri

| Yüzey | UI iyileştirmesi | Öncelik |
|---|---|---|
| Yeni Kasa Hareketi | Hareket türü, para birimi, hesap, tutar ve yeni bakiye önizlemesi | P0 |
| Tahsilat Ekle | Firma/fatura ilişkisi, para birimi, kalan tutar ve doğrulama özeti | P0 |
| Muhasebe Faturası Oluştur | Belge kimliği, cari, kalemler, vergi ve sabit toplam | P0 |
| Muhasebe Faturası Düzenle | Değişen tutar/vergi ve revizyon özeti | P0 |
| Muhasebe Faturası Detayı | İlk sayfa preview, aging/vade, ödeme ilişkileri | P1 |
| Müşteri Bakiye / Ekstre Detayı | Dondurulmuş özet, aging, para birimi ve hareket timeline'ı | P0 |

### 7.6 Servis yüzeyleri

| Yüzey | UI iyileştirmesi | Öncelik |
|---|---|---|
| Yeni Servis Talebi | Makine/firma seçimi, sorun tipi, önem, SLA ve dosya özeti | P0 |
| Servis Talebi Detayı | Makine başlığı, servis stepper'ı, SLA, sahip ve sıradaki adım | P0 |
| Yeni Dahili Şikâyet | Kaynak, kategori, önem, ilgili kayıt ve beklenen çözüm | P0 |
| Herkese Açık Şikâyet Linki | Link kapsamı, süre, kopyala/paylaş geri bildirimi ve gizlilik metni | P0 |
| Şikâyet Detayı | Firma/makine bağlamı, önem, timeline ve çözüm özeti | P0 |
| QR Kod — servis | Kod amacı, süre/geçerlilik, indirme/yazdırma ve önizleme | P1 |
| QR Kod — makine | Makine kimliği, seri no, etiket boyutu ve baskı önizlemesi | P1 |

### 7.7 Takvim, chat ve yönetim yüzeyleri

| Yüzey | UI iyileştirmesi | Öncelik |
|---|---|---|
| Yeni Etkinlik | Tür, tarih/saat, katılımcı, ilişki ve tekrar özeti | P1 |
| Etkinlik Düzenle | Çakışma, değişen zaman ve katılımcı bildirimi | P1 |
| ICS İçe Aktar | Dosya özeti, bulunacak etkinlik sayısı, çakışma ve sonuç | P1 |
| Yeni Sohbet | Kişi arama, rol/firma bağlamı ve seçili katılımcı | P2 |
| Yeni Grup | Grup adı, üyeler, amaç ve avatar/ikon | P2 |
| Grup Ayarları | Üye/izin/isim bölümleri ve yıkıcı işlemleri ayırma | P1 |
| Kayıt Paylaş | Kayıt preview, hedef kişi/grup, erişim kapsamı | P0 |
| Yeni Kullanıcı | Kimlik, rol, departman, erişim ve davet özeti | P0 |
| Kullanıcı Düzenle | Kimlik başlığı, değişiklik özeti, erişim durumu | P1 |
| Departman ve Bölüm Atama | Organizasyon ağacı, seçili yol ve etki özeti | P0 |
| Rol Ata | Rol açıklaması, kritik yetki özeti, efektif erişim | P0 |
| Kullanıcı Limitleri | Mevcut/yeni limit ve kullanım progress'i | P0 |
| Hesap Kilidini Aç | Kullanıcı kimliği, kilit nedeni ve sonuç | P0 |
| Kullanıcı Sil | Sahip olduğu kayıtlar/atama etkisi ve geri dönüşsüzlük | P0 |
| Hedef | Ölçü, dönem, mevcut/önerilen hedef ve progress preview | P1 |
| Departman Hedefi | Departman, dönem, ölçü ve dağılım özeti | P1 |
| Yeni Rol | Rol adı, açıklama, başlangıç şablonu ve yetki özeti | P0 |
| Yeni Departman | Hiyerarşik üst, kod, açıklama ve önizleme | P1 |
| Lookup Düzenle | Kullanım alanı, sıralama, renk/durum ve silme etkisi | P0 |

### 7.8 Popover ve küçük yüzey aileleri

| Aile | Ortak eksik | Ortak standart |
|---|---|---|
| Departman/bölüm seçicileri | Uzun adlarda bağlam ve hiyerarşi kaybı | Breadcrumb/ağaç izi, arama ve seçili kapsam özeti |
| Satır aksiyon menüleri | Aksiyon sırası modülden modüle değişebilir | Görüntüle/düzenle/iş akışı/yıkıcı sırası ve semantik ikon standardı |
| Filtre/kolon seçicileri | Uygulanan filtre sayısı ve geri alma zayıf | Aktif filtre sayacı, temizle, kaydet ve varsayılan görünüm dili |
| Combobox ve multi-select | Uzun seçenek ve seçili öğe kalabalığı | Arama, grup, `+N` özeti, açıklayıcı empty/no-result durumu |
| Tarih/saat seçicileri | Türkçe arayüzde ABD tarih formatı görülebiliyor | `gg.aa.yyyy`, Europe/Istanbul bağlamı ve okunur tarih özeti |
| Tooltip | Küçük ikonlarda kullanım tutarsızlığı | Yalnız açıklama gereken ikonlarda, klavye erişilebilir ve gecikmesi standart tooltip |

---

## 8. Durum tasarımı denetimi

Her ana yüzey ve dialog yalnız dolu/verili haliyle değil, aşağıdaki durumlarla tasarım sistemine bağlanmalı:

| Durum | Bugünkü genel risk | Premium standardı |
|---|---|---|
| Boş | Genel ikon + tek cümle; modül bağlamı zayıf | Modüle özgü 2D/isometrik illüstrasyon, neden, tek CTA ve örnek sonuç |
| İlk yükleme | Bazı yüzeylerde bağlama göre farklı | Nihai düzeni koruyan skeleton; ani layout shift olmamalı |
| Yenileme | Tam skeleton veya sessiz bekleme riski | Mevcut veri korunurken küçük progress/refresh durumu |
| Hata | Teknik veya genel mesaj | Ne oldu, ne korunuyor, tekrar dene ve güvenli destek yolu |
| Yetkisiz | Boş ekranla karışabilir | Kilit glifi, erişim kapsamı ve yetki isteği yönlendirmesi |
| Sonuç yok | Boş kayıtla karışabilir | Aktif filtreleri göster, tek tık temizle ve alternatif arama öner |
| Başarı | Toast tek başına kaybolabilir | İlgili satır/kartta kısa görsel doğrulama + gerektiğinde toast |
| Kaydedilmemiş | Formdan çıkış riski | Sticky değişiklik barı, kaydet/vazgeç ve kapatma koruması |
| Silme/yıkıcı | Başlık ve etki bağlamı her yerde aynı değil | Nesne adı, etki özeti, farklı renk alanı ve güvenli onay |
| Offline/yavaş ağ | Operasyon kullanıcıları için kritik | Bağlantı durumu, tekrar deneme, korunmuş form verisi |

---

## 9. İllüstrasyon, ikon, PNG ve 3D kullanım haritası

### 9.1 Kullanım matrisi

| Alan | Önerilen varlık | Neden | Kullanılmaması gereken yaklaşım |
|---|---|---|---|
| Giriş hero | Tek 3D/isometrik CNC hücresi | Marka dünyasını ilk anda anlatır | Çok nesneli stok sahne veya sürekli dönen ağır WebGL |
| Ürün kataloğu/detayı | Gerçek ürün fotoğrafı veya şeffaf 3D render | Ürünü premium ve karşılaştırılabilir yapar | Farklı açı/ışık/arka planlı rastgele görseller |
| Makine varlığı/detayı | Gerçek makine renderı; opsiyonel 8–12 kare turntable | Seri/model kimliğini merkeze alır | Her tablo satırında interaktif 3D |
| Referanslar | Sahadaki gerçek kurulum fotoğrafı + firma logosu | Sosyal kanıt ve proje bağlamı | Genel fabrika stok fotoğrafı |
| Servis fiyat listesi | Parça makro fotoğrafı veya exploded-part 3D | Parça tanım güvenini artırır | Aynı temsili görseli tüm satırlarda tekrar etmek |
| Stok | Ürün thumbnail; boş/özet için isometrik raf | Fiziksel envanter hissi | Büyük dekoratif depo görseliyle veriyi itmek |
| Sevkiyat/teslimat/kurulum | Detay veya boş durumda konteyner, kamyon, toolbox illüstrasyonu | Süreci konuya bağlar | Finansal tabloların içine dekorasyon eklemek |
| Chat/takvim/boş sonuç | Hafif 2D veya izometrik empty-state | Boşluğu açıklayıcı hale getirir | Ana veri varken illüstrasyonu baskın tutmak |
| Finans, rapor, roller, ayarlar | Semantik ikon ve veri görseli | Burada güven ve netlik önemlidir | Dekoratif 3D, fotoğraf veya maskot |
| Onay/silme/hata | Küçük semantik sistem ikonu | Riski açıklaştırır | Sevimli illüstrasyonla riski yumuşatmak |

### 9.2 Dosya ve üretim standardı

- **İkon ve teknik diyagram:** SVG; 16/20/24 px grid, 1.75–2 px stroke, tek tutarlı köşe dili.
- **Ürün/makine renderı:** şeffaf WebP veya AVIF; 1:1 ya da 4:3; aynı 3/4 kamera açısı, soğuk stüdyo ışığı; 640 ve 1280 px türev.
- **Fotoğraf:** WebP/AVIF; gerçek sahada kontrollü renk düzenleme; minimum 2x kaynak.
- **PNG:** yalnız eski sistem uyumluluğu, screenshot veya şeffaf önizleme zorunluluğunda. Yeni ikonlarda PNG kullanılmamalı.
- **PDF thumbnail:** sunucu/istemci güvenli önizleme çıktısı; gerçek ilk sayfa. Dekoratif belge görseli olmamalı.
- **3D:** ilk tercih önceden render edilmiş WebP/AVIF. WebGL yalnız ürün/makine detayında gerçek inceleme değeri varsa yüklenmeli.
- İçerik görsellerinde açıklayıcı `alt`; salt dekoratif illüstrasyonda boş `alt`.
- Tüm görseller sabit en/boy oranıyla lazy-load edilmeli; layout shift yaratmamalı.

### 9.3 Özel CNC ikon seti adayları

Standart aksiyon ikonlarını yeniden çizmek yerine yalnız domain nesneleri için küçük bir özel set üretin:

- Torna, freze, pres, spindle, takım tutucu
- Makine varlığı, yedek parça, opsiyonel ekipman
- Palet, sandık, konteyner, sevkiyat, kurulum
- Servis/RMA, garanti, bakım, arıza, uzaktan destek
- Seri no, teknik föy, kalibrasyon, kontrol listesi

---

## 10. Öncelikli premium dönüşüm sırası

### İlk 10 ekran

1. **Uygulama kabuğu:** vektör logo, menü yoğunluğu, asistan safe-area, global aksiyon hiyerarşisi.
2. **Ürünler:** görsel katalog ve standart render sistemi.
3. **Makineler/Varlıklar:** makine-first kimlik ve premium detay başlığı.
4. **Dashboard:** günlük iş, risk ve sıradaki adım merkezi.
5. **Satış Kanban + satış detay:** kart yoğunluğu, stepper, risk ve hızlı panel.
6. **Servis Kanban + servis detay:** SLA, sahip, makine ve operasyon yoğunluğu.
7. **Referanslar:** gerçek proje/makine görselleriyle sosyal kanıt.
8. **Servis Fiyat Listesi:** gerçek parça görsel sistemi.
9. **Teklif/Sözleşme/Doküman:** preview, revizyon ve aksiyon hiyerarşisi.
10. **Giriş:** premium makine hero'su ve yüksek çözünürlüklü marka varlıkları.

Bu sıralama, aynı tasarım bileşenlerinin sonraki sayfalara taşınmasını sağlar. Örneğin ürün/makine görsel standardı satış, servis, stok, teslimat ve referanslarda tekrar kullanılabilir.

---

## 11. Uygulama yol haritası

Tahminler UI-only çalışma içindir; mevcut API ve iş akışlarının korunduğu varsayılmıştır.

### Faz 0 — Tasarım temeli (1–2 hafta)

- Vektör logo ve mevcut varlık envanteri.
- Figma/token kütüphanesi: renk, tipografi, spacing, radius, elevation, durum.
- Standart sayfa başlığı, kayıt başlığı, tablo toolbar'ı, empty state ve form/dialog şablonu.
- Türkçe tarih/terim standardı.
- Asistan safe-area ve responsive yoğunluk kuralları.
- Görsel/3D üretim brief'i ve örnek üç ürün/makine varlığı.

### Faz 1 — En yüksek etki (3–5 hafta)

- Dashboard.
- Ürünler ve makineler.
- Referanslar ve servis fiyat listesi.
- Satış/servis Kanbanları ve detayları.
- Uygulama kabuğu ve giriş.

### Faz 2 — Tüm modüllere yayılım (4–6 hafta)

- Firma, kişi, harita ve çağrı asistanı.
- Teklif, proforma, sözleşme ve dokümanlar.
- Stok, satın alma, sevkiyat, teslimat ve kurulum.
- Finans ekranları.
- Kullanıcı, rol, departman ve tüm ayar sekmeleri.
- Raporlanan dialog/popup şablonlarının tamamı.

### Faz 3 — İncelik ve kalite (2–3 hafta)

- Loading/empty/error/permission/offline durumları.
- Mikro etkileşim ve reduced-motion.
- Klavye, focus ve ekran okuyucu denetimi.
- Mobil ve tablet görsel regresyon.
- Görsel performans, lazy-loading ve responsive image kaynakları.

---

## 12. Özellikleri korumak için kabul kriterleri

UI dönüşümünün tamamı aşağıdaki kapılardan geçmelidir:

- Mevcut route, aksiyon, form alanı, yetki ve API çağrısı bire bir korunmalı.
- Hiçbir CTA yalnız dekoratif görsel içinde saklanmamalı.
- Eski/yeni ekran için rol bazlı görev kontrol listesi hazırlanmalı.
- Masaüstü, tablet ve mobil için görsel regresyon seti tutulmalı.
- Tüm dialoglar klavye ile açılmalı, kullanılmalı ve kapanmalı; focus dialog içinde kalmalı.
- Tablo ve Kanban kompaktlığı okunabilirlik ve dokunma hedefini bozmamalı.
- Durum rengi tek bilgi taşıyıcısı olmamalı; metin/ikonla desteklenmeli.
- Ürün görselleri ekranın LCP'sini gereksiz yükseltmemeli; responsive boyut ve lazy-load zorunlu.
- Tarih ve para birimi sunumu Türkçe bağlama uygun, değerler mevcut veriyle aynı olmalı.
- Silme/onay akışlarının etki kapsamı azaltılmamalı veya belirsizleştirilmemeli.

---

## 13. Başarı ölçümü

Premium görünüm yalnız beğeniyle değil, operasyon sonucuyla ölçülmeli:

| Metrik | Ölçüm önerisi |
|---|---|
| Kayıt bulma süresi | Firma, makine ve servis kaydı için medyan süre |
| Kanban tarama hızı | Riskli/gecikmiş kartı bulma süresi |
| Form tamamlama | Teklif, servis talebi ve teslimat formunda süre ve hata oranı |
| İlk tık doğruluğu | Sıradaki işlem için doğru CTA'nın ilk seçim oranı |
| Filtre kullanımı | Kayıtlı görünüm ve hazır risk görünümü kullanımı |
| Dialog terk oranı | Uzun formlarda açıp kapatma/tamamlamama oranı |
| Görsel performans | LCP, CLS ve toplam görsel aktarım bütçesi |
| Destek sinyali | “Nerede/Ne yapmalıyım?” türü destek taleplerindeki değişim |

---

## 14. Kapsam envanteri

### Ana navigasyon yüzeyleri

Dashboard, Chat, Takvim, Çağrı Asistanı, Firmalar, Kişiler, Satış Kartları, Satış Kanban, Satış Haritası, Teklifler, Proformalar, Sözleşmeler, Dokümanlar, Ödemeler ve Kasa, Muhasebe Faturaları, Cari Hesaplar/Müşteri Bakiyeleri, Vadeler, Satış Fiyat Listesi, Referanslar, Ürünler, Stok, Satın Alma Siparişleri, Sevkiyatlar, Kurulumlar, Teslimatlar, Makineler/Varlıklar, Servis Talepleri, Servis Kanban, Servis Fiyat Listesi, Raporlar, Kullanıcılar, Roller, Departmanlar, Ayarlar.

### Ek yüzeyler

Giriş, Şifremi Unuttum, Yeni Şifre Belirleme, Firma Detay Sayfası, Firma Detay Dialog'u, Satış Kartı Detay Dialog'u, Servis Talebi Detayı ve Herkese Açık Servis Şikâyeti.

### Ayar sekmeleri

Genel, Şirket, Bildirimler, CRM Alanları, Teknik Bilgiler.

### Denetlenen pencere aileleri

Global arama/oluşturma/yardım/bildirim/asistan; firma/kişi; satış/aktivite/teklif/ödeme planı; proforma/sözleşme/doküman; ürün/stok/satın alma; sevkiyat/teslimat/kurulum/makine; finans; servis/şikâyet/QR; takvim/ICS; chat/paylaşım; kullanıcı/rol/departman/hedef/lookup; filtre, kolon, combobox, multi-select ve tarih seçiciler.

---

## 15. Nihai karar

Haksan'ın premiumlaşması için baştan tasarım yapmak veya rakip bir CRM'i görsel olarak kopyalamak gerekmiyor. En doğru yatırım sırası:

1. Mevcut endüstriyel kimliği net bir tasarım sistemine bağlamak.
2. Fiziksel ürün dünyasını ürün, makine, parça ve referans görselleriyle gerçek hale getirmek.
3. Her kayıtta durum, risk ve sıradaki adımı aynı görsel hiyerarşide göstermek.
4. Uzman kullanıcı için liste/Kanban yoğunluğunu ve hızlı işlemleri geliştirmek.
5. Tüm dialog ve durumları tek kurumsal kalite seviyesine getirmek.

Bu yaklaşım mevcut özellikleri değiştirmeden uygulamanın daha pahalı, daha güvenilir ve daha operasyonel görünmesini sağlar.

