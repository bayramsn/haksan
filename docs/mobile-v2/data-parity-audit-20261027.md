# Mobile v2 API ve bölüm/departman veri denetimi

27 Ekim 2026. Hedef `apps/mobile-v2`; referanslar mevcut web ekranları ve NestJS controller/service sözleşmeleri. Üretime yazma, migration uygulama, OTA veya mağaza yayını yapılmadı.

## Doğrulanmış kök neden

CNC → Sac İşleme geçişinde `queryClient.clear()` açık ekranın QueryObserver'ını yeni sorguya bağlamıyordu. Eski CNC ürünleri ekranda kalırken yeni bölümün istemci filtresi bunları eliyor, boş katalog görünüyordu. Gerçek TanStack QueryClient/QueryObserver ile hata tekrarlandı. Hesap/bölüm/departman/yetki değişiminde ekran alt ağacını yeniden oluşturan sınır ve ayrıca kapsamlı ürün sorgu anahtarları eklendi. Bölüm değişince doğru API sorgusunun çalıştığı regresyonla doğrulandı. Bu düzeltme Android ve iOS ortak veri katmanındadır; kullanıcının fiziksel Android kurulumunda canlı backend testi yapılmadı.

## Kapatılan veri hataları

| Alan | Önceki hata | Düzeltme |
|---|---|---|
| Ortak oturum/kapsam | Eski yanıt, refresh/retry ve iyimser geri alma yeni hesaba/kapsama taşınabiliyordu | Kullanıcı, tenant, API, bölüm, departman ve yetki nesliyle yanıt/tekrar/geri alma koruması; ekranların yeniden oluşturulması |
| Çevrimdışı kuyruk | İşlem gecikirken hesap değişirse sonraki gönderim veya yeni kuyruk kaydı yanlış hesaba geçebiliyordu | Başlangıç kapsamını koruma ve değişimde gönderimi durdurma |
| Tüm bölümler | Kaynak özelindeki tüm-bölüm izni mobil seçimde yok sayılıyordu | Web ile aynı resource accessScopes kararı; sunucu kaynak yetkileri korunur |
| Ürün/fiyat/katalog | Ürün anahtarı kapsamı taşımıyordu; fiyat listeleri ve katalog dosyaları ilk sayfada kalıyordu | Kapsamlı anahtarlar, tüm sayfalar |
| Ürün stoku | İlk stok arama sayfası model kimliğine göre elenince sonraki sayfadaki doğru stok gizleniyordu | Tüm arama sayfalarından sonra kesin ürün kimliği filtresi |
| Görevler | Liste ve firma/fırsat ilişkileri ilk 100 kayıtla sınırlıydı | Sayfaların tamamını yükleme |
| Teklif kararları | Satıldı/WIN kontrolü, tercih edilen teklif, ödeme planı varsayılanı, revizyon ve açık teklif toplamı eksik ilk sayfaya dayanıyordu | İş kararı ve toplamlar için tamamlanmış teklif verisi; eksik yüklemede kaydı engelleme/hata gösterme |
| Firma ilişkileri | Makine/fatura/alacak/ödeme ilk 20; aktiviteler ilk 50; kontak önizlemesinden tamamına erişim eksikti | İlişkili veri sayfaları tamamlanır; aktivite/tarihçe yükleme düğmesi; firmaya filtreli kontak listesi bağlantısı |
| Referanslar | 25×200 kayıt sonrası sessiz kesilme | Sayfa tavanının kaldırılması; bozuk yanıtın hata olması |
| Ekler ve seçimler | Servis/fırsat/fuar/firma ekleri, erişim talepleri ve fuar ürün seçenekleri ilk sayfada kalıyordu | Tüm sayfalar; zarf biçimleri korunur |
| Ticari belge dosyası | Nüsha meta verisi ilk dosya sayfasında bulunamazsa boş görünüyordu | Dosya kimliği bulunana veya son sayfaya kadar arama; hata/tekrar deneme |
| Meta lead filtreleri | search/status/platform şemada siliniyor, connectionId serviste uygulanmıyordu | Ayrı doğrulama şeması, parametreli SQL ve liste/toplamda aynı filtre; tenant/bölüm/departman korunur |
| Meta geçmiş/analiz | Mesaj ve içgörü ilk 100 satırla sınırlıydı | Dizi yanıtlarında da tüm sayfaları yükleme; mesaj sırası korunur |
| Ana sayfa servis KPI | Şikâyet başvuru sayısı “Açık servis” olarak gösteriliyordu | `/service-tickets/summary` açık/toplam değerleri |
| Kurulum/bakım | Eski teslimat ve bakım planlarının sonraki sayfalarına ulaşılamıyordu | Sonraki sayfa kontrolleri ve hata/tekrar deneme |
| Makine servis geçmişi | Ağ hatası kayıt yok olarak gösterilebiliyordu | Açık hata ve tekrar deneme; kısmi veri uyarısı |
| Firma para birimleri | Açık teklifler farklı para birimleriyle toplanıp cari ilk para birimiyle etiketleniyordu; diğer cari para birimleri gizleniyordu | Teklifler ve finans özeti her para birimi için ayrı tutarla gösterilir; kur dönüşümü varsayılmaz |

## Tekrarlanabilir denetim

`node scripts/audit-mobile-v2-read-routes.mjs` TypeScript AST ile controller decorator'larını ve mobil src/app okuma çağrılarını tarar. Sonuç `api-read-route-audit.json`: 481 backend handler, 215 mobil GET çağrı noktası, 215 kayıtlı rota eşleşmesi, 0 çözümlenemeyen rota ifadesi. Dinamik backend yolları wildcard olarak eşlenir. Bu ölçüm API yolu varlığını doğrular; her endpoint'in gerçek veri/rol/cihaz kombinasyonunda başarıyla çalıştığını kanıtlamaz.

Eski regex tabanlı web aksiyon raporu 336/345 gösteriyor. İki note-template oluştur/güncelle çağrısı koşullu ifade nedeniyle yanlış eksik sayılıyor; arayüzde zaten bağlılar. Üç rakip ürün/güncelleme sarmalayıcısının web ekranında da tüketicisi yok. Dört publicComplaint işlemi oturumsuz web müşteri formuna ait. Bu farklar kayıp mobil veri ekranı olarak raporlanmadı.

## Doğrulama ve sınır

- Mobil v2 tüm testler: 524/524 geçti (önceki 483'e ek 41 regresyon).
- Mobil ve API TypeScript kontrolleri geçti; shared build geçti.
- Meta filtre/güvenlik ve görüşme yardımcısı odaklı API testleri: 33/33 geçti. Meta testleri gerçek Drizzle SQL/parametrelerini inceler; üretim DB kullanmaz.
- Android Expo export 3.859 modülle başarıyla tamamlandı. İmzalı APK/AAB değildir.
- Yeni kodda bağımlılık eklenmedi. Değişikliklerin diff whitespace kontrolü geçti.
- ADB cihaz listesi boş: fiziksel cihaz oturumu ve kullanıcının üretim rolüyle ekranlar tek tek doğrulanmadı. Gerçek PostgreSQL eşzamanlılık/performans testi yapılmadı.
- Haritadaki açıklanmış 3.000 firma sınırı, son kayıt önizlemeleri ve ayrı tam listeye bağlantısı olan özetler bilinçli olarak korunur.
- Sayfaları tam yüklemek büyük veri kümelerinde daha çok okuma isteği gerektirir; ağ hatasında kısmi sonuç tam liste gibi sunulmaz.

Mevcut Android uygulaması bu yerel düzeltmeleri kendiliğinden içermez. Görüşme yardımcısının native köprü değişikliğiyle birlikte yeni 1.2.0 binary/runtime gerekir; önceki runtime'a uyumsuz OTA gönderilmemeli. Meta sunucu düzeltmesi API yayını gerektirir. Yayın sonrası gerçek kullanıcı rolüyle bölüm/departman geçişi, sac işleme kataloğu, firma ilişkileri ve sayfa-2 kayıtları cihazda kontrol edilmelidir.
