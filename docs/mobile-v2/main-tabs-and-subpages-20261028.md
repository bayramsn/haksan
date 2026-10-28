# Ana sekmeler, alt sayfalar ve ortak tasarım incelemesi

> **Devam güncellemesi:** Burada tespit edilen yönlendirme ve geçmişsiz geri dönüş kod eksikleri sonraki çalışmada düzeltildi. Güncel doğrulama ve yayın sınırları: [remaining-fixes-20261028.md](remaining-fixes-20261028.md).

Tarih: 28 Ekim 2026. Kapsam: web ve mobile-v2 kaynak kodu; fiziksel cihaz ve oturum açılmış canlı ekran testi yapılmadı.

## Ekran haritası

| Ana sekme | Kök | İçerik ve alt akışlar |
|---|---|---|
| Ana Sayfa | `/` | Bugün; Rapor → Özet, Grafikler, Hedefler; bildirimler ve profil |
| Firmalar | `/companies` | Firma listesi → firma detayı → kontak, fırsat, teklif, görev, belge, cari ve makine işlemleri |
| Fırsatlar | `/opportunities` | Fırsat listesi → süreç, bilgiler, teklif, belge, ödeme, not/görüşme; oluşturma ve düzenleme formları |
| Takvim | `/calendar` | Ay, Hafta, Gün, Liste; tarih/kullanıcı/tür/arşiv filtreleri; etkinlik formu ve içe aktarma |
| Modüller | `/modules` | Altı menü grubu; kayıt listeleri, detaylar ve işlem formları |

Beş sekme aynı Expo Router array-group alt sayfa ağacını paylaşır: `app/(tabs)/(home,companies,opportunities,calendar,modules)`. Her grubun başlangıç sayfası ayrı tanımlıdır. `/companies` ve `/modules/companies` aynı liste bileşenini; `/opportunities` ve `/modules/opportunities` aynı fırsat listesi bileşenini kullanır. Bu, beş ayrı ekran uygulaması olduğu anlamına gelmez.

Envanter: **98 ortak TSX sayfa dosyası**, **40 modül**, **91 modal rota dosyası**. `_layout.tsx` dosyaları sayfa sayısına dahil edilmedi. Bunlar kaynak dosyası sayılarıdır; her sayfanın cihazda doğrulandığını göstermez. Kayıtlı 40 modülün tamamının index sayfası var.

## Modüller ve alt sayfaları

Katalogdaki sekiz teknik grup, `module-menu.ts` tarafından web menüsüne uyumlu altı görünür gruba dönüştürülür. Yetkiye kapalı modüller mevcut tasarımda kilitli satır olarak gösterilebilir; erişim kapısı ayrıca denetlenir.

### Genel

| Modül | Kaynak ağacındaki alt sayfalar |
|---|---|
| Takvim | Liste/merkez; ayrı detay rotası yok |
| Görevler | Liste/merkez → `[id]` |
| Fuar | Liste/merkez; ayrı detay rotası yok |
| Görüşme Yardımcısı | Liste/merkez → `[id]` |
| Aktiviteler | Liste/merkez → `[id]` |

### Satış

| Modül | Kaynak ağacındaki alt sayfalar |
|---|---|
| Firmalar | Liste/merkez → `[id]` |
| Fırsatlar | Liste/merkez → `[id]` |
| Fırsat Kanbanı | Liste/merkez; ayrı detay rotası yok |
| Meta Merkezi | Liste/merkez; ayrı detay rotası yok |
| Referanslar | Liste/merkez; ayrı detay rotası yok |
| Hedefler | Liste/merkez; ayrı detay rotası yok |

### Satış Operasyonu

| Modül | Kaynak ağacındaki alt sayfalar |
|---|---|
| Kontaklar | Liste/merkez → `[id]` |
| Firma Haritası | Liste/merkez; ayrı detay rotası yok |
| Teklifler | Liste/merkez → `[id]` |
| Ticari Belgeler | Liste/merkez → `[kind]/[id]` |
| Proformalar | Liste/merkez → `[id]` |
| Sözleşmeler | Liste/merkez → `[id]` |
| Satış Fiyat Listesi | Liste/merkez; ayrı detay rotası yok |
| Satış Siparişleri | Liste/merkez → `[id]` |

### Operasyon

| Modül | Kaynak ağacındaki alt sayfalar |
|---|---|
| Ürünler | Liste/merkez → `[id]` |
| Stoklar | Liste/merkez → `[id]`, `scan` |
| Ödemeler & Kasa | Liste/merkez → `[id]` |
| Muhasebe Faturaları | Liste/merkez → `[id]` |
| Cari Rapor | Liste/merkez → `[companyId]` |
| Vade Takvimi | Liste/merkez; ayrı detay rotası yok |
| Sevkiyat | Liste/merkez → `[id]` |
| Satın Alma | Liste/merkez → `[id]` |
| Tahsilatlar | Liste/merkez → `[id]` |

### Servis

| Modül | Kaynak ağacındaki alt sayfalar |
|---|---|
| Makineler | Liste/merkez → `[id]` |
| Teslimat Kayıtları | Liste/merkez → `[id]` |
| Kurulumlar | Liste/merkez → `[id]` |
| Servis Talepleri | Liste/merkez → `[id]` |
| Şikayet Kutusu | Liste/merkez → `[id]`, `links` |
| Servis Kanbanı | Liste/merkez; ayrı detay rotası yok |
| Servis Fiyat Listesi | Liste/merkez; ayrı detay rotası yok |
| Bakım Planları | Liste/merkez → `[id]` |

### Yönetim

| Modül | Kaynak ağacındaki alt sayfalar |
|---|---|
| Raporlar | Liste/merkez; ayrı detay rotası yok |
| Kullanıcılar | Liste/merkez → `[id]` |
| Roller & Yetkiler | Liste/merkez → `[id]` |
| Departmanlar | Liste/merkez; ayrı detay rotası yok |

## İç sekmeler ve web karşılıkları

- Firma detayı: Genel, Geçmiş, Satış Kartları, Aktivite, Teklifler, Görevler, Cari, Belgeler. Web’de Makineler ayrı sekmedir; mobilde Genel içinde yer alır ve makine detayına geçer. Bu bir yerleşim farkıdır.
- Fırsat detayı: Süreç, Fırsat bilgileri, Teklifler, Belgeler, Ödeme bilgileri, Notlar ve görüşmeler. Web’de zaman çizelgesi/teklifler/dokümanlar/ödemeler ile süreç çalışma alanı kullanılır. Aynı içerik farklı bölümlenmiştir.
- Meta: Genel bakış, Lead’ler, Kampanyalar, Mesajlar ve yorumlar, Otomasyonlar ve CAPI, Kitleler, Katalog, Bağlantılar ve sağlık.
- Raporlar: Genel, Operasyonel, Karlılık, Hedef Takibi, Analitik.
- Ortak yardımcı sayfalar: bildirimler; sohbet listesi, yeni sohbet, grup, konuşma detayı; profil, kapsam seçimi, hakkında; şirket/menu/webmail/imza/takvim eşitleme/departman/sözlük/atama/teknik bilgi ayarları.

## Veri ve erişim incelemesi

- Ana sekme görünürlüğü `useCanAccessModule`; modül erişimi `canAccessModule` ve modül layout kapısı üzerinden yürür. Kullanıcı, rol ve departman yönetimi admin/super_admin sınırına sahiptir. Sunucu yetkilendirmesinin yerini istemci görünürlüğü alamaz.
- Ürünler `useAllProducts` ile veriyi yükler; seçili bölüm ve servis rolü için `visibleCatalog` filtresi uygulanır. Önbellek anahtarı tenant/kullanıcı/bölüm/departmanı içerir. Sac İşleme’nin gerçek veriyle boş görünme senaryosu ayrıca cihaz ve yetkili API oturumuyla doğrulanmalıdır.
- Firma detayı kontak/fırsat/teklif/aktivite/görev/makine/finans kaynaklarını birleştirir. Cari listeleri sekme açılınca yüklenir; makineler Genel içinde gösterilir.

## Bulgular ve kalan doğrulama

1. **Web yönlendirme bağlamı eşitliği eksik.** `src/modules/navigate.ts:63–74` bazı kayıt öneklerini ve haftalık rapor/hedef odaklarını işler; diğer `query`/`focus` değerlerini genel rota dönüşünde bırakır. Örneğin `routeForNavigation("products", "lazer")` filtresiz `/modules/products` döndürür. Web `App.tsx` ProductsPage’e `initialQuery` geçirirken mobil ürün listesi URL arama parametresi okumaz. Bu raporda tespit edildi; henüz düzeltilmedi. Mevcut bildirim controller’ındaki açıkça tanımlı görev/servis/şikayet/rapor/hedef hedefleri için özel eşlemeler bulunur; tüm bildirimler bozuk olarak değerlendirilmemelidir.
2. **Geri dönüş uygulamaları farklı.** Ortak DetailHeader geçmiş yoksa hiyerarşik üst sayfaya gider; fırsatın özel OpportunityHeader bileşeni doğrudan `router.back()` kullanır. Bunun soğuk başlangıç, dış bağlantı ve sekme geçişi testleri gereklidir; kaynak kodundan kesin bir cihaz hatası ilan edilmedi.
3. **Kaynak envanteri görsel kapsam kanıtı değildir.** 98 sayfa + 91 modalın tamamı tek tek çalıştırılmadı. Uzun Türkçe etiketler, küçük/yatay ekran, tablet, klavye, karanlık tema, ekran okuyucu ve erişim değişikliği senaryoları yayın öncesi kontrol edilmelidir.

## Uygulanan ortak tasarım

- Mobil PickerField: 56pt alan, belirgin sınır ve ikon yüzeyi.
- Yeni SelectionRow: tekli/çoklu/uzaktan seçimde ortak satır, seçili renk + onay simgesi, radio/checkbox erişilebilirlik durumu, uzun metin sarma.
- HostedSheet: görünür kapatma düğmesi, erişilebilirlik kaçış eylemi, güvenli alan sınırı; tablette 600pt ile sınırlı merkez panel.
- SheetMenu: ikon yüzeyleri, seçili/tehlikeli işlem ayrımı, dinamik ekran yüksekliği sınırı ve kaydırılabilir içerik.
- ScreenHeader/DetailHeader: daha dengeli başlık boyutu, sola hizalı detay hiyerarşisi; ModalShell: tablette 720pt form genişliği ve açıklama yüzeyi. Native modal başlıkları ortak font ve zemin kullanır.
- Web DropdownMenu/Select/Popover: uyumlu köşe, kenarlık, gölge, odak rengi; menü satırlarında mobilde 44px hedef. Dialog: daha yumuşak yüzey ve ayrılmış başlık; azaltılmış hareket tercihi gözetilir.
- Değişiklikler bu ortak bileşenleri kullanan ekranlara yayılır; özel çizilmiş her sayfanın ayrıca yeniden tasarlandığı iddia edilmez.

## Doğrulama

- Web ve mobil TypeScript kontrolleri geçti.
- Mobil mevcut testleri: 531/531 geçti. Bunlar görsel test değildir.
- Web’de ComposeMailDialog, TaskCompletionDialog ve ApprovalsDialog testleri: 9/9 geçti.
- Web production build geçti; mevcut büyük bundle uyarısı devam ediyor.
- Yerel tarayıcı kullanımı Work ayarlarında kapalı olduğu için görsel önizleme doğrulanamadı; geçici demo dosyaları temizlendi. Fiziksel Android/iPhone kontrolü yapılmadı.
- API/iş kaydı davranışı bu tasarım çalışmasında değiştirilmedi; yayın yapılmadı.

Makine tarafından okunabilir tam liste: `main-tabs-route-inventory-20261028.json`.
