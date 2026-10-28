# Haksan web + mobile-v2 uygulama analizi

> **Güncel devam sonucu:** Rapordaki ürün kurtarma, mobil query/focus ve geri dönüş kod eksikleri sonradan düzeltildi. Güncel 559 mobil / 744 web / 29 API testi ve yayın öncesi kalan kapılar için [Kalan düzeltmelerin sonucu](remaining-fixes-20261028.md). Aşağıdaki bölüm ilk analiz anının kaydıdır.

Tarih: 28 Ekim 2026. Bu rapor güncel kaynak taraması, doğrulanmış hatalar, uygulanan düzeltmeler ve otomatik test sonuçlarını kapsar. Canlı veri tabanına yazılmadı; API, mağaza paketi veya OTA yayını yapılmadı.

## 1. Karar özeti

Ortak formların görünümü ve veri durumu yönetimi iyileştirildi. Bu turdaki en önemli işlevsel düzeltme, mobil ürün formunda teknik bilgi/donanım isteği başarısız olduğunda mevcut verinin boş veriyle üzerine yazılabilmesinin önlenmesidir. Web firma/kontak combobox'larının ilk 25 kayıtta kalması, kapsam değişiminde eski firma seçeneklerini göstermesi ve bazı hataları gizlemesi düzeltildi.

**Güncel doğrulama:** web 738/738 test, mobil 543/543 test, odaklı API 15/15 test; üç uygulamanın TypeScript kontrolleri ve web production build başarılı. Bu sonuçlar canlı sistem veya tüm cihazlar için uçtan uca onay değildir.

## 2. Kaynak kapsamı ve ölçüm yöntemi

| Ölçüm | Mobil | Web |
|---|---:|---:|
| Taranan TSX dosyası | 299 | 224 |
| Form/seçim bileşeni kullanılan dosya | 133 | 118 |
| Sayılan form/seçim kullanım noktası | 635 | 1.068 |
| Ortak metin alanı | 367 Field + 10 IconField | 413 Input + 90 Textarea |
| Yerel/özel metin alanı | 24 TextInput | 36 input + 1 textarea |
| Genel seçim bileşeni | 88 OptionPicker + 7 MultiOptionPicker + 22 SearchSelect | 23 Combobox + 195 Select |
| Firma/kontak seçici kullanımı | 22 CompanyPicker + 10 ContactPicker; ayrıca ortak sarmalayıcılar | 31 RemoteCompanyCombobox + 9 RemoteContactCombobox |

Sayılar AST ile bulunan **kaynak kullanım noktalarıdır**; çalışma anındaki alan, kayıt veya test kapsam yüzdesi değildir. Bir bileşen liste içinde yüzlerce kez oluşturulabilir. Test dosyaları ve numaralı kopya dosyaları envanter dışında tutulur; numaralı kopyalar silinmez. Kaynak kopyasının aktifliği import ağacıyla ayrıca değerlendirilmelidir.

Mobil rota haritası: 5 ana sekme, 40 kayıtlı modül, layout dosyaları hariç 98 ortak sayfa ve 91 modal. 40 modülün tamamının index sayfası var. Sekmeler aynı Expo Router array-group sayfa ağacını kullanır.

Tekrarlanabilir taramalar:

```sh
node scripts/audit-form-surfaces.mjs
node scripts/audit-mobile-v2-read-routes.mjs
```

İlk komut UI alanları/API hook importları/yerel geri bildirim bileşenleri/izin çağrıları için envanter üretir. Bir dosyada yerel ErrorState bulunmaması tek başına hata sayılmaz; durum üst bileşende yönetilebilir. İkinci komut 481 backend handler'a karşı 215 mobil GET kullanımının 215'ini eşler; çözümlenemeyen ifade ve eksik yol yoktur. Rota varlığı gerçek yanıt, veri yetkisi ve iş kuralı doğrulaması değildir.

## 3. Düzeltilen veri ve davranış sorunları

| Alan | Doğrulanmış sorun | Uygulanan sonuç |
|---|---|---|
| Web firma/kontak seçimi | Yalnız ilk 25 kayıt; devam kontrolü yok | Infinite query, devam düğmesi, sonraki sayfa hatası ve yeniden deneme. İlişki türüne göre bitmiş alt sorgu yeniden sayfalanmaz. |
| Web firma kapsamı | keepPreviousData, bölüm/departman değişirken eski seçenekleri gösterebiliyordu | Yeni kapsam anahtarında önceki seçenekler taşınmaz. |
| Web kontak hatası | Sürekli bulunan Belirtilmedi satırı yüzünden CommandEmpty içindeki hata görünmeyebiliyordu | Liste ve seçili kayıt hataları bağımsız görünür uyarı ve yeniden deneme ile sunulur. |
| Web yeni firma önerisi | Kullanıcının yeni metni, henüz tamamlanmamış eski arama sonucuyla karşılaştırılıyordu | Debounce tamamlanıp başarılı sonuç ve tüm devam sayfaları değerlendirilmeden oluşturma önerilmez. |
| Genel web combobox | Kapatıp açınca eski arama kalabiliyordu; yükleme/hata modeli yoktu | Arama kapanışta temizlenir; yükleme/hata/yeniden deneme desteklenir; hata veya yüklemede serbest oluşturma önerilmez. |
| Mobil uzaktan seçim | Debounce sırasında önceki arama sonucu seçilebilir, veri hatasında serbest metin önerilebilirdi | Bekleyen aramada eski sonuç gösterilmez; yükleme ve hata ayrı gösterilir. |
| Mobil TokenSelect | Kaynak listesi hata/yeniden deneme özellikleri sarmalayıcıda kayboluyordu | Hata ve yeniden deneme SearchSelect'e aktarılır; fırsat atama kuralının Kaynaklar alanına bağlanır. |
| Mobil firma seçenekleri | Sorgu hatası ve başarılı boş sonuç aynı sabit varsayılan seçeneklere dönüşebiliyordu | Sorguların ayrı durumları dışarı verilir; varsayılanlar yalnız başarılı boş yanıtta kullanılır. Firma grubu, sektör, kaynak ve vergi dairesinde yükleme/hata/yeniden deneme görünür. |
| Mobil ürün detayı | Specs/equipment hata sonucunun boş diziyle hydrate edilmesi, sonraki kayıtta mevcut veri kaybına yol açabilirdi | Her iki parça başarıyla yüklenmeden düzenlenebilir snapshot oluşturulmaz; hata ve yeniden deneme ekranı vardır; kaydetme de bütünlüğü kontrol eder. |
| Mobil ürün kaydetme | Ürün oluşturulup ayrıntılar başarısız olunca tekrar deneme yeniden POST yapabiliyordu | Başarılı oluşturmanın kimliği form oturumunda korunur; tekrar deneme aynı ürünü tamamlar. Kaydetme sürerken ikinci işlem engellenir. |
| Mobil ürün sınıfı | Düzenlenmiş teknik bilgiler sınıf değişiminde açık uyarı olmadan eski sınıfa ait kalabiliyordu | Kullanıcı mevcut teknik bilgilerin korunacağını açıkça onaylar; veri sessizce silinmez. |
| Mobil ürün seçenekleri | Sınıflandırma/marka/para birimi/muadil/şablon yükleme sorunları boş seçenek sanılabiliyordu | Ayrı yükleme ve tekrar deneme; zorunlu kaynaklar eksik veya hatalıyken kaydetme engeli. Mevcut muadil seçimleri hata nedeniyle temizlenmez. |
| Web istenen makine | Yetkisiz veya başarısız katalog, eşleşme yok gibi görünüyordu | Katalog yetkisi ve yükleme hatası açıkça açıklanır; katalog hatasında yeniden deneme; makine adının elle yazılabileceği belirtilir. Yetki genişletilmez. |

## 4. Ortak form tasarımı

### Mobil

- Firma, kontak, satış firma seçicisi ve genel seçenekler aynı SelectionRow hiyerarşisini kullanır: etiket, çok satırlı yardımcı bilgi, renk ve simgeyle seçili durum.
- SelectionStatus, önbellekte satır bulunsa da hata/güncelleme durumunu görünür tutar. Hata yalnız boş listeye bağlı değildir.
- Field: temaya uygun yer tutucu, görünür sınır, odak rengi, çok satırlı alan için yeterli yükseklik, salt okunur alan ayrımı; yinelenen etiketlerde hata açıklaması kimlikleri benzersizdir. Kullanıcının onFocus/onBlur callback'leri korunur.
- TokenSelect: en az 44pt kaldırma alanı, uzun etiket sarma ve devre dışı durum bilgisi.
- Tarih/saat ve firma seçici başlıkları ortak ölçülere getirildi. Uzun firma adları tek satırda kesilmek zorunda değildir.
- FormScreen: tablet içeriği 720pt ile sınırlı, alt işlem düğmeleri aynı genişliğe hizalı; klavye kaçışı ve kaydırma korunur.
- Önceki turdaki HostedSheet kapatma düğmesi, tablet merkez paneli, SheetMenu kaydırması ve ortak başlık iyileştirmeleri korunur.

### Web

- Combobox: düğme/arama/liste hiyerarşisi, seçili işaret, çok satırlı etiket ve açıklama; doğru CSS değişkeniyle tetikleyici genişliği.
- Command listesi: kullanılabilir ekran yüksekliğiyle sınırlı kaydırma, daha geniş arama alanı ve tutarlı klavye odak yüzeyi.
- Input, Textarea ve Select: ortak köşe, sınır, odak, devre dışı ve geçersiz alan görünümü. Textarea dikey büyütülebilir.
- Teknik konfigürasyondaki native select'ler de ortak zemin/sınır/odak düzenine alınır; küçük veya dokunmatik ekranda en az 44px yükseklik.
- Önceki turdaki diyalog, popover ve işlem menüsü yüzeyleri korunur. Özel çizilen her ekranın görsel olarak tek tek onaylandığı iddia edilmez.

## 5. Modül bazlı uygulama değerlendirmesi

| Alan | İncelenen akış | Bu turun kanıtı / sınırı |
|---|---|---|
| Ana sayfa / rapor panoları | Bugün, rapor özet/grafik/hedef, KPI geçişleri | Kaynak rota haritası ve tüm web/mobil testler; gerçek KPI–DB karşılaştırması yok. |
| Firmalar / kontaklar | Liste → detay → oluştur/düzenle; adres, kaynak, birim, kontak seçimi | Combobox sayfalama/kapsam/hata regresyonları ve seçenek durumu düzeltmeleri. |
| Fırsatlar / kanban / süreç | Firma/kontak/istenen makine, teklif, belgeler, ödeme ve aktivite geçişleri | Katalog hata/yetki açıklaması; mevcut ayrıntılı iç sekme haritası. Özel geri dönüş ve query/focus eşitliği hâlâ aşağıdaki açık kalemlerde. |
| Ürün / stok / fiyat listesi | Bölüm kapsamı, sınıflandırma, marka, muadil, teknik bilgi, donanım, kaydetme | Ürün snapshot/kısmi kayıt testleri; API ürün sayfalama ve sınıflandırma testleri; Sac İşleme gerçek kullanıcı/cihaz testi yok. |
| Teklif / proforma / sözleşme / belgeler | Paylaşılan seçiciler, metin alanları, şablon ve form iskeletleri | Ortak değişiklikler ve mevcut test paketi; gerçek PDF/mail/ıslak imza akışı bu tur çalıştırılmadı. |
| Finans / cari / vade / rapor | Tutarlar, ödeme biçimi, firma seçimi, rapor ve dışa aktarma | Önceki veri denetiminin para birimi ve sayfalama düzeltmeleri korunur; bu tur tüm paketler başarılı. Gerçek muhasebe bakiyesi uzlaştırılmadı. |
| Lojistik / teslimat / kurulum | Kayıt ilişkileri, form girişleri, durumlar | Kaynak/GET rota envanteri; gerçek sevkiyat veya kurulum işlemi oluşturulmadı. |
| Servis / makineler / bakım / şikayet | Makine ilişkisi, servis talebi ve yardımcı formlar | Ortak form bileşenleri ve rota envanteri; gerçek saha/seri numarası verisiyle cihaz pilotu yok. |
| Meta | Lead, kampanya, mesaj, yorum, kitle, katalog | Önceki filtre/sayfalama/güvenlik raporu ile ilişkilendirildi; canlı Meta hesabı çağrısı yapılmadı. |
| Yönetim / ayarlar | Kullanıcı/rol/departman, firma seçenekleri, atama kuralı, imzalar | Kaynak hatası taşınması düzeltildi; gerçek rol matrisiyle uçtan uca oturumlar kurulmadı. |
| Sohbet / bildirimler | Liste, konuşma, yönlendirme, okunmamış sayısı | Kaynak haritası ve otomatik testler; push teslimatı ve arka plan cihaz testi yok. |
| Telefon / Siri / sesli yardımcı | Taslak ve native girişlerin ortak akışı | İlk kapsamın gerçek cihaz yayın kapıları sürer; otomatik arama algılama veya Siri desteği tamamlandı sayılmaz. |

## 6. Güvenlik ve veri bütünlüğü

Bu turda yeni bağımlılık kurulmadı; istemciye secret eklenmedi. Combobox değişiklikleri sunucu yetkisini genişletmez. Ürün controller'ı AuthGuard ve PermissionsGuard kullanır. Backend'de global throttler, Helmet ve CORS allowlist yapılandırmaları bulunur; bunların production ortam değerleri bu tur doğrulanmadı.

Hesap/bölüm/departman değişimindeki önceki yanıt ve cache izolasyonu çalışmaları `web-mobile-joint-audit-20261028.md` içinde anlatılmıştır. Bu tur özellikle web firma seçicisinde kapsamlar arası placeholder taşınması kaldırıldı. Kaynak düzeyindeki kontroller tüm endpoint'ler için penetrasyon testi veya tenant sızıntısı olmayacağı sertifikası değildir.

Ürün oluşturma endpoint'i tenant+model kodu için mevcut kayıt kontrolü yapar; benzersizlik çakışması temiz 409 hatasına çevrilir. Bu yüzden ilk POST yanıtı kaybolduğunda aynı modelin mutlaka mükerrer oluşacağı iddia edilmez. **Eksik kalan:** belirsiz ilk POST sonucunda aynı işlem kimliğiyle sonucu geri alma/tamamlama protokolü yoktur. Yeni istemci düzeltmesi yalnız kimliği başarıyla alınmış oluşturmayı aynı form oturumunda güvenle devam ettirir; uygulama öldürülüp açıldığında bu oturum belleği kalıcı değildir.

## 7. Açık kalemler ve kabul ölçütleri

| Öncelik | Açık kalem | Tamamlanma kanıtı |
|---|---|---|
| P1 | İlk ürün POST yanıtı kaybolduğunda deterministik işlem kurtarma | Aynı işlem anahtarı için tek sunucu sonucu; timeout, tekrar gönderim ve yeniden açılış testi. Mevcut model benzersizliği korunmalı. |
| P1 | Sac İşleme ve departman erişimleriyle gerçek kullanıcı pilotu | Aynı hesapta CNC → Sac İşleme → departman → çıkış/hesap değişimi; gerçek ürün/marka/teklif kayıtlarını web ve fiziksel Android/iPhone'da karşılaştırma. |
| P1 | Arama sonrası Android/Siri yayın kapıları | Fiziksel cihazda rol/izin/iptal/cevapsız/çift SIM/soğuk başlangıç/kilitli cihaz; onay öncesi iş kaydı oluşmaması; doğru yeni runtime paketi. |
| P2 | Web navigate query/focus ile mobil liste odağının tam eşitliği | Genel routeForNavigation, özel eşlemeler dışındaki query/focus değerlerini bırakıyor. Ürün/teklif/stok/ödeme odaklarını tipli sözleşmeyle okuyup doğru kayıt/filtreyi açma testleri. Önceki raporda tespit edildi; bu tur değiştirilmedi. |
| P2 | Özel fırsat geri dönüşü | Ortak hiyerarşik fallback ile özel router.back kullanımını soğuk başlangıç/deep-link/sekme senaryolarında doğrulama. Kaynaktan kesin cihaz hatası ilan edilmez. |
| P2 | Görsel ve erişilebilirlik kabulü | Uzun Türkçe metin, 320–375px ekran, yatay, tablet, klavye, karanlık tema, VoiceOver/TalkBack ve web klavye akışı. Tarayıcı kullanımı ayarlarda kapalı; ekran görüntüsü doğrulaması yapılmadı. |
| P2 | Web başlangıç yükü | Production build ana chunk yaklaşık 1.834 kB / gzip 452 kB. Rota bölme kararı ölçülmüş açılış/sayfa geçişi verisine dayanmalı. Bu tur bundle parçalanmadı veya performans ölçülmedi. |

Bu tablo doğrulanmış kod eksikleriyle cihaz/ortam doğrulama eksiklerini birbirinden ayırır. UI envanterindeki bütün satırlar elle tek tek gezilmiş kabul edilmez; canlı DB, mail, Meta, push ve native arama gibi dış sistemleri kapsayan tam uçtan uca kabul yapılmadan “uygulamanın tüm eksikleri kapandı” sonucu çıkarılamaz.

## 8. Güncel test ve derleme sonuçları

| Kontrol | Sonuç |
|---|---|
| Mobil bütün test paketi | 543/543 geçti |
| Web bütün test paketi | 121 dosya, 738/738 geçti; tek işçi/sıralı koşu |
| Combobox odaklı web paketi | 18/18 geçti; tam paketin içindedir, ayrıca toplanmaz |
| Ürün ve seçim yeni regresyonları | Kısmi yüklemede hydrate etmeme, aynı ürünle devam, sınıf değişimi onayı, debounce ve hata durumu |
| API odaklı testler | 15/15: ürün sayfalama, taxonomy resolution, firma/kontak liste sözleşmesi; kontrollü yanıtlar, canlı DB yok |
| TypeScript | Web, mobile-v2 ve API başarılı |
| Web production build | Başarılı; büyük chunk uyarısı sürüyor |
| Mobil GET rota taraması | 215/215 eşleşme, 0 çözümlenemeyen yol |
| Değişiklik whitespace kontrolü | Başarılı |

Gerçek Radix Popover/Command testleri eklenince test ortamındaki hoisted Floating UI/cmdk bağımlılıklarının mobil React kopyasına çözülmesi görüldü. Vitest inline bağımlılık çözümlemesi web React sürümünde kalacak biçimde düzeltildi. Bu bir test ortamı düzeltmesidir; production Vite çözümlemesinde yeni bir React hatası ilan edilmez. Önceki tur tam web koşusunda görülen tek süre aşımı bu koşuda gerçekleşmedi; kalıcı olarak ortadan kalktığının kanıtı sayılmaz.

## 9. İlgili çıktılar

- `form-surface-inventory-20261028.json`: dosya/alan/API hook/yerel feedback envanteri.
- `main-tabs-and-subpages-20261028.md`: ana sekme ve alt sayfa haritası.
- `main-tabs-route-inventory-20261028.json`: modül, alt rota ve modal listesi.
- `api-read-route-audit.json`: mobil GET–backend eşleştirmesi.
- `web-mobile-joint-audit-20261028.md`: önceki web/mobil veri, scope, Meta ve finans denetimi.
- `data-parity-audit-20261027.md`: önceki mobil veri denetimi ve native yayın sınırları.
