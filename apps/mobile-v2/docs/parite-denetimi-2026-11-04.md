# Canlı web → mobil işlem eşleştirmesi

Referans: AWS’de yayımlanan Haksan ERP/CRM’nin salt okunur ekran incelemesi ve aynı çalışma ağacındaki web/API sözleşmeleri. Web kaynakları değiştirilmedi. Kullanıcının açık onayıyla gereken API PDF uçları eklendi. Üretim verisine yazım veya yayın yapılmadı.

## Bu turda tamamlananlar

| Alan | Mobilde eklenen işlem |
|---|---|
| Sözleşme | Web ile aynı hazır teslim şartları, alıcı/tarih/KDV/kontrol markası yer tutucuları ve seçime bağlı gümrük/KDV/nakliye/teslim süresi |
| Proforma ve sözleşme PDF | Yetkili kaydın dondurulmuş verisinden sunucuda üretim; proforma şablon seçimi; özel/no-store yanıt, 10/dk sınır |
| Mail | Firma kapsamlı, en fazla beş teklif eki; ürün teknik PDF eki ve sunucuda üretilen proforma/sözleşme ekiyle incelenebilir mail taslağı; hesap kapsamlı ve 30 dakika süreli bellek içi belge aktarımı |
| Ticari fatura PDF | Yetkili taslakta güncel tekliften salt okunur çıktı; kesinleşmiş faturada yalnız kayıtlı snapshot; web ile aynı ticari fatura şablonu |
| Ürün | Teknik özellik, konfigürasyon ve ekipman içeren fiyat bilgisi taşımayan PDF; izin verilen ürün fotoğrafını gömme; PDF paylaşımı ve mail taslağı |
| Servis teklifi | Web ile aynı not şablonları; şablon yönetimi izinleri; imza seçimi ve mevcut imzayı koruma; kayıtlı tekliften PDF |
| Lojistik | Kargo etiketi, irsaliye ve kurulum tutanağı için PDF paylaşımı; yüklü nüsha varsa onu tercih etme |
| Rapor | Ayrıntılı aktivite, operasyonel, yıl sonu ve hedef gerçekleşme raporlarının PDF paylaşımı; hedefte fatura kırılımı, son altı ay seyri, kümülatif ölçütler, ekip sırası ve kişisel PDF/e-posta taslağı |
| Firma listesi | Şehre bağlı ilçe filtresi; aynı liste/arama/bölüm/sıralama parametreleriyle sunucu Excel ve PDF çıktısı |
| Fuar | Listeyle aynı filtrelere ve tam veri kümesine uygulanan sunucu Excel/PDF dışa aktarımı |

Yeni PDF uçları: `POST /proformas/:id/generate-pdf`, `POST /contracts/:id/generate-pdf`. İstemci HTML’i veya snapshot’ı kabul edilmez. Yetki her indirmede yeniden denetlenir. Snapshot’ı eksik eski belgelerde güncel teklifin fiyatı sessizce kullanılmaz; belgeyi yeniden kaydetmeyi isteyen 409 yanıtı verilir.

Devam çalışmasında `POST /commercial-invoices/:id/generate-pdf` eklendi. `/mail/send` mevcut web HTML payload’ını korur; mobilin yeni `document: { id, kind, variantKey? }` isteğinde PDF’i yetkili kaydın dondurulmuş verisinden sunucu üretir. Şablon seçimi yalnız izin verilen proforma varyantlarıdır. 15 MB toplam ek sınırı korunur.

Mobilde olmayan `mail.send` izin koduna bağlı kapı kaldırıldı: webdeki gibi kişisel webmail özelliği ve bağlı/aktif gönderici hesabı kontrol edilir. Belgenin kendi okuma yetkisi ve sunucu erişim kontrolleri korunur.

PDF motoru başlatılamadığında yaşam döngüsü gözlemcisinin ek bir yakalanmamış promise hatası oluşturması düzeltildi; asıl hata ve yeniden deneme davranışı korunur.

## Doğrulama

- Mobil TypeScript ve 723 test başarılı. İndirme sırasında hesap/bölüm değişimi, aynı adlı eşzamanlı dosyalar, süreli e-posta taslağı, rapor tablolarında güvenli metin ve tüm kayıtların korunması, firma il/ilçe ve Excel/PDF sorgu eşleşmesi, aylık seyirde sıralı istek/iptal/kısmi hata, kümülatif hesap ve kişisel çıktının diğer kişileri dışlaması kapsanır.
- Son kaynak değişiklikleriyle Android ve iOS Hermes dışa aktarma başarılı.
- iOS Simulator native derlemesi başarılı (`BUILD SUCCEEDED`); üretilen uygulamada sürüm/runtime 1.3.0 ve ExpoPrint sembolleri doğrulandı. Bu, fiziksel cihaz etkileşim testi değildir.
- Yeni belge uçları için 30 test başarılı: şablon/medya güvenliği ve izole PostgreSQL üzerindeki HTTP/tenant/bölüm/firma erişimi. İki şablonla gerçek Chromium PDF üretimi başarılı.
- PDF motorunun başlatma hatası/eşzamanlı istek/yeniden deneme regresyonu başarılı.
- Tam API paketi: 145 dosya/946 test geçti, 10 dosya/39 test atlandı, iki test hata verdi (sohbette konum gönderimi 401; toplu mail abonelikten çıkma isteğinde HTTP parse hatası). İlgili iki dosya ve PDF başlatma regresyonu tekrar çalıştırıldı: 3 dosya/12 test geçti. İlk hataların kök nedeni bu tekrar koşumuyla kanıtlanmadı; tam paket kesintisiz başarılı sayılmadı.
- Yerel mobil önizlemede giriş, 41 modüllü katalog, sözleşme hazır şart seçimi ve teslim süresinin forma aktarılması, ürün teknik PDF eyleminin görünürlüğü kontrol edildi. Mail gönderilmedi; sözleşme test taslağı kaydedilmeden kapatıldı.
- Devam çalışması: 28 mail eki/schema/izin/legacy PDF testi ve 14 ticari belge/fatura HTTP ve veri koruma testi başarılı; shared build, API TypeScript ve API derleme başarılı. SMTP tamamen taklit edildi. Yerel önizlemede sözleşmedeki “PDF ekli e-posta hazırla” eylemi, doğru konu/belge eki ve gönderici hesabı kurulmadan gönderimin engellenmesi görüldü. Test sunucusunun webmail özelliği yalnız loopback SMTP hedefiyle geçici açıldı; hesap kurulmadı ve mesaj gönderilmedi.
- Yeni native bağımlılık `expo-print` nedeniyle sürüm/runtime 1.3.0 olarak ayrıldı. Eski runtime’a OTA gönderilmedi.
- Rapor/firma devam çalışması yalnız mobil kaynaklarında yapıldı; yeni API ya da bağımlılık eklenmedi. Operasyonel PDF kişi/departman/dönem ve kur uyarılarını, yıl sonu PDF altı ayrıntı tablosunu, hedef PDF seçili kapsamın kişi/departman ölçütlerini, manuel hedefleri, notları ve fatura katkılarını içerir. PDF tabloları mobilde ortak güvenli baskı bileşeniyle düzenlendi; masaüstü CSS ve grafiklerinin birebir kopyası değildir. Veri yüklenirken PDF eylemi engellenir; işlem düğmeleri eşzamanlı ikinci basışı engeller.
- Yerel önizlemede İstanbul → Bayrampaşa seçimiyle firma listesi ve iki filtre özeti görüldü; şehir seçilmeden ilçe alanı kapalıydı. Firma işlemlerinde Excel/PDF seçenekleri ve operasyonel/karlılık/hedef raporlarında PDF düğmeleri doğrulandı. Bu kontrol native dosya paylaşım penceresinin fiziksel cihazda doğrulandığı anlamına gelmez.
- Gelişmiş hedef devamı: Ocak→seçili ay raporları yalnız istenince ve sırayla alınır. Son altı ayın eksik yüzdesi sıfır yapılmaz; `—` olarak korunur. Yıl başı toplamı bütün aylardaki ölçüt hedef/gerçekleşen toplamından yeniden hesaplanır. Ekip sırası departman/risk filtrelerinden önce hesaplanır. Dönem/hesap/bölüm değişiminde eski seyir kullanılmaz; iptal veya ağ hatasında kısmi seyir sunulmaz.
- Hedef raporu ekip/kişi PDF’i ve aynı raporun sunucuda PDF’e dönüştürülecek e-posta taslağını destekler. Kişisel çıktı diğer kişileri, hedefi olmayan ekip üyelerinin adlarını ve ekip notlarını içermez. Belge aktarımı aynı 30 dakika/hesap kapsamında bellek içi depoyu kullanır; URL yalnız rastgele taslak kimliği taşır. Göndermeden önce `reports.export` ve aktif gönderici hesabı denetlenir; sunucu da mevcut rapor eki yetkisini uygular. Departman raporu 403 olduğunda eski departman verisi kullanılmaz ve izinli kullanıcı raporunun çıktısı engellenmez.
- Yerel önizlemede Kasım için seyir yükleme, Haziran–Kasım ayrıntısı, kişisel e-posta taslağında doğru kişi/konu/ek ve Ekim’e geçince seyirin yeniden “yükle” durumuna dönmesi doğrulandı. E-posta gönderilmedi. Bu devamda da yeni API, web değişikliği veya native bağımlılık yok.

## Tamamlandı sayılmayan alanlar

- Native sesli/görüntülü sohbet araması ve ses kaydının gerçek cihazda doğrulanması; çağrı/Siri/izin ve arka plan senaryoları. Uygulama kodu ve native derleme hazır olması gerçek iki cihaz testi yerine geçmez.
- İncelenmemiş masaüstü işlem kombinasyonları. Webin mail gövdesi HTML editörü değil, kalın metin işaretleri kullanan düz metindir; mobil karşılığı aşağıda eklenmiştir. Raporlarda masaüstünün tüm grafik/CSS ve yönetici değerlendirme baskı düzeninin birebir kopyası hedeflenmedi; aktarılan veri ve kullanılabilir mobil çıktılar doğrulandı.
- Tüm telefon/tablet yönleri ve her rol/alan/çevrimdışı kombinasyonunun uçtan uca doğrulanması. Kaynakta ekran bulunması tam işlev eşitliği kanıtı değildir.
- Bağımlılık taramasında mevcut üretim ağacında 9 high, 59 moderate, 3 low bulgu var; critical yok. Bunlar tüm uygulamanın güvenli olduğuna dair onay olarak değerlendirilmez. SDK’yı topluca yükselten zorlayıcı audit düzeltmesi uygulanmadı.
- Bu değişiklikler AWS’ye, TestFlight’a veya APK kanalına yayımlanmadı; canlı sunucu yeni PDF uçlarını henüz sunmaz.

Önceki 41 modül ve yerel kayıt akışı denetiminin ayrıntıları: [işlev denetimi](./mobile-functional-audit-2026-11-04.md).


## Ses, arama ve metin düzenleme devamı

- Webin mevcut sohbet sinyalleşmesiyle yetkili iki kişilik sohbetlerde uygulama açıkken sesli/görüntülü arama eklendi. Gelen davet kendiliğinden mikrofon/kamera açmaz; kabul gerekir. Yanlış kişi/konuşma sinyalleri reddedilir. Hesap değişimi, kilit, arka plan, kapanma ve bağlantı hatasında medya kaynakları bırakılır. Arama süresi SDP yanıtıyla değil RTC bağlantısıyla başlar; bağlantı kurulamaması 30 saniyede sonlandırılır.
- Ses kaydı açık kullanıcı işlemiyle başlar; beş dakika ve 25 MB sınırı vardır. Kaydı inceleyip sohbete eklemek ve mesajı göndermek ayrı işlemlerdir. Geçici dosyalar temizlenir. Ses dinleme yetkili dosya kimliği ve sunucunun imzalı indirme adresini kullanır; mesajdaki rastgele URL indirilmez.
- Mail gövdesine web ile aynı kalın metin işaretleri ve güvenli önizleme eklendi. HTML çalıştırılmaz. Teklif notlarında harfli, proforma şartlarında bölümler arasında devam eden sayılı önizleme bulunur; kayıtlı metin değiştirilmez.
- Yeni ExpoAudio/WebRTC native bağımlılıkları için uygulama/runtime 1.4.0 ayrıldı. Android arka plan ses servisi, wake lock ve üretim overlay izinleri kaldırıldı. Önceki runtime sürümlerine OTA gönderilmedi.
- Tekrarlanan CNG üretiminde mevcut widget hedefinin silinmesine yol açan apple-targets 4.0.7 referans sorunu sürümle sınırlı yerel plugin sarmalayıcısıyla giderildi; üç regresyon testi geçti. Node_modules üzerinde kalıcı yama yapılmadı.
- Android debug APK ve release manifest üretimi başarılı. Release manifestte SYSTEM_ALERT_WINDOW, WAKE_LOCK ve FOREGROUND_SERVICE yok. Debug APK geliştirme aracının overlay iznini içerir; üretim paketi olarak sunulmadı.
- iOS arm64 Simulator derlemesi başarılı; pakette 1.4.0 runtime ile ExpoAudio/WebRTC sembolleri doğrulandı ve ayrı QA simülatörüne kuruldu. Simülatör arayüzü bu ortamda kullanılamadığı için açılış/etkileşim doğrulaması yapılmadı.
- Fiziksel iOS imzalı derlemesi engellendi: Xcode hesabı tanımlı değil ve uygulama/widget geliştirme profilleri bulunamadı. Kullanıcının son bildirimi iPhone'un Finder'da görünmediği yönünde. Telefona yükleme, mikrofon, gerçek iki uçlu ses/video, Siri ve fiziksel paylaşım testleri tamamlanmadı. Android cihaz erişimi yok; başlatılan emülatör kaynak yetersizliği nedeniyle kullanılamadı ve kapatıldı.
- Bu devamda tarayıcı kullanımı Work ayarlarında kapalıydı; önceki önizleme doğrulamaları yeni ses/metin bileşenlerinin görsel doğrulaması sayılmaz. Web kaynakları değiştirilmedi; AWS/TestFlight/OTA yayını yapılmadı.

- Son ses/metin kaynaklarıyla mobil TypeScript kontrolü başarılı; test paketi: 748 test başarılı, sıfır hata/atlama. Çağrı testleri sahte sinyal/medya uçlarıyla çalışır; fiziksel ağ ve ses testi değildir.
- Son bağlantı zaman aşımı düzeltmesi dahil Android ve iOS Hermes dışa aktarımları başarılı.


## Fiziksel iPhone paketleme devamı

- Xcode hesabı açıldıktan ve kullanıcı Geliştirici Modu'nu etkinleştirdikten sonra iPhone 16 kablolu/eşleştirilmiş olarak doğrulandı.
- İmzalı iphoneos derlemesi başarılı. İlk genel cihaz profili bu telefonu kapsamadığı için kurulum reddedildi; bağlı cihaz hedefi ve provisioning device registration ile uygulama ve widget profilleri yenilendi. İki profilin de bağlı telefonu içerdiği seçici olarak doğrulandı.
- Cihaza özel ikinci derleme başarılı; Haksan 1.4.0 (1) telefona kuruldu ve native süreç başlatıldı. Bu paket Debug geliştirme paketidir; yerel Metro 8081 kullanır. TestFlight/OTA yayını değildir.
- Bu kayıt anında uygulama kodunun yüklenmesi ve telefondaki ekran/izin sonucu kullanıcıdan bekleniyor. Native sürecin başlaması, giriş/ana sayfa veya ses/video işlevinin doğrulandığı anlamına gelmez. Önceki Xcode profil ve fiziksel bağlantı engeli giderildi; etkileşim testleri tamamlandı sayılmadı.


## AWS ile bağımsız iPhone testi hazırlığı

- Kullanıcı Debug paketindeki “No development servers found” ekranından sonra yerel sunucu yerine AWS ile denemeyi istedi. Yerel Metro kapatıldı. Mevcut AWS `/health` adresi doğrulanmış HTTPS üzerinden HTTP 200 ve JSON `ok: true` döndürdü; AWS/web/API yayını yapılmadı.
- Release artifact kontrolünde EXConstants.bundle/app.config eksik bulundu. Expo Constants SDK 54 betiğinin `basename $PROJECT_DIR` ifadesi boşluk içeren çalışma yolu nedeniyle config üretimini sessizce atlıyordu. Proje CNG plugin'i yalnız bu betiğin alt sürecine `PROJECT_DIR=Pods` verir; gerçek/özel PROJECT_ROOT korunur. Node_modules değiştirilmedi. Mevcut işaretli Podfile için de idempotent geçiş eklendi.
- Bağımsız Mobile Release Engineer incelemesi düzeltmenin kapsamını doğruladı. Gerçek Expo betiğini boşluk içeren geçici projede çalıştıran ve eski Podfile geçişini sınayan iki yeni test geçti; widget plugin testleriyle toplam beş paketleme testi ve Ruby söz dizimi kontrolü başarılı. Mobil kaynaklar değişmedi; önceki 748 mobil test ve TypeScript sonucu geçerlidir.
- Düzeltilmiş iphoneos Release derlemesi başarılı. Haksan.app/EXConstants.bundle/app.config içindeki API adresi `https://crm.52-28-67-148.sslip.io/api/v1` olarak doğrulandı. Gömülü main.jsbundle 14.720.167 bayt. Uygulama ve widget imzalama profilleri test iPhone'unu içeriyor.
- Hazır Release artifact: `/tmp/haksan-mobile-v2-device-1.4.0/Build/Products/Release-iphoneos/Haksan.app`. TestFlight/OTA yüklemesi yapılmadı.
- Son cihaz kontrolünde iPhone eşleştirilmiş ve Geliştirici Modu açık, fakat bağlantı durumu `unavailable`. Bu yüzden bağımsız AWS Release paketi henüz telefona kurulmadı. Önceki kurulum Debug paketiydi; yeni Release'in açılışı, AWS girişi ve ses/video etkileşimi doğrulandı sayılmaz. Kullanıcıdan kablo bağlantısını yenilemesi istendi.
