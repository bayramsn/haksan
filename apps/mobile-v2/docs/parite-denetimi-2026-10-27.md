# Web ↔ Mobil alan denetimi ve tasarım önerileri (27.10.2026)

Beş paralel inceleme birleştirildi: CRM/satış, belge/finans, servis/lojistik/stok, yönetim/rapor/sohbet ve tasarım.
Kısaltmalar: `M` = `apps/mobile-v2/app/(tabs)/(home,companies,opportunities,calendar,modules)`, `MS` = `apps/mobile-v2/src`, `W` = `apps/web/src/app/components`, `A` = `apps/api/src/modules`.

**Genel tablo:** Mobil, sayfa ve uç düzeyinde webe çok yakın. Yönetim, Meta, görevler, takvim, fuar, hedefler, fiyat listeleri ve stok neredeyse birebir. Asıl açıklar dört yerde toplanıyor:
1. Yanlış veya bayat gösterim (hatalar).
2. Webin istemcide birleştirdiği, mobilin hiç almadığı bilgi (makine, görev, belge listeleri).
3. Mobilde hiç üretilemeyen basılı belgeler (PDF).
4. Yalnız yüklenen sayfada çalışan filtreler.

---

## 1. Hatalar — veri yanlış ya da kayboluyor (önce bunlar)

| # | Sorun | Yer | Düzeltme |
|---|---|---|---|
| H1 | Teklif "Revizyonlar" bölümü hiç dolmuyor: tekil `documentNo` ile aranıyor | `M/modules/quotes/[id].tsx:113,136-141` | `useQuoteList({ opportunityId })` |
| H2 | Teklif toplamında gümrük satırı yok; ara toplam + KDV − iskonto genel toplamı tutmuyor | `M/modules/quotes/[id].tsx:512-519`, tip `MS/api/endpoints.ts:843` | `customsTotal` tipe ve toplam kartına |
| H3 | Taslak proforma/sözleşmede kalemler ve toplamlar boş ("Dondurulmuş kalem verisi yok") | `MS/ui/documents/CommercialDocumentDetail.tsx:203-286` | Snapshot yoksa elde zaten olan `quote.data` gösterilsin |
| H4 | Firma Belgeler sekmesinden yüklenen dış teklif hiçbir yerde listelenmiyor | `M/modules/companies/[id].tsx:421-440, 1016-1047` | `fileLinksApi` ile `external_quote` listesi |
| H5 | Karlılık aylık grafiği: API `"YYYY-MM"` dönüyor, mobil `number` sanıyor → ay etiketi bozuk, boş aylar yok | `MS/api/reports.api.ts:72`, `MS/ui/reports/YearEndSection.tsx:98-106` | Tip düzelt, 12 ayı sıfırla doldur |
| H6 | Özet bildirimlerin tıklanabilir `items` satırları gösterilmiyor | `MS/api/endpoints.ts:287-301` | Tipe ve karta ekle |
| H7 | Bildirim hedefi `task:<id>`/`ticket:<id>` kayıt yerine listeye gidiyor; `focus` yok | `MS/modules/navigate.ts:48-58` | `query` ve `focus` çözümlemesi |
| H8 | Kasa: teslim edilmemiş fırsata bağlı "beklenen" alacaklar webde gizli, mobilde sayılıyor → KPI farklı | `MS/ui/finance/cash-movements.ts:73-92` | Web kuralını uygula |
| H9 | Profilde departman sabit "Tanımlı" yazıyor | `M/more/profile.tsx:43` | `/auth/me` `departments[]` adını göster |
| H10 | Firma "Sorumlu" alanı aslında oluşturan kişi | `M/modules/companies/[id].tsx:475-484` | Etiketi "Oluşturan" yap |
| H11 | "Onayla" düğmeleri iOS'ta kırmızı (`destructive`) | `quotes/[id].tsx:234`, `opportunities/[id].tsx:650` | `default` stil |

## 2. Webde olup mobilde görünmeyen bilgi — yüksek/orta öncelik

**CRM / satış**
- Fırsat detayında bağlı **açık görevler listesi yok** (yalnız "oluştur" var). API `opportunityId` filtresini destekliyor. — Yüksek
- Fırsat detayında bağlı proforma/sözleşme/fatura listesi, tahsilat planı ve sevkiyat/kurulum kayıtları yok; yalnız modül düğmeleri var. — Orta
- Firma detayı:
  - Satış kartı satırında tutar ve tarih yok.
  - Görevlerde durum, öncelik ve atanan yok.
  - Cari yalnız ilk dövizi gösteriyor; "en yakın vade" yok.
  - Adreslerde sevkiyat/fatura rozeti ve yol tarifi yok.

  Önem: Orta.
- Fırsat listesi: para birimi, firma kararı ve sıralama filtreleri yalnız yüklenen sayfada çalışıyor (API parametresi yok). — Orta
- Aktivite akışında firma adı ve filtre yok (API join yapmıyor). — Orta

**Belge / finans**
- Sözleşme içeriği (model, adet, teslim, teknik özellik, ödeme planı), belge kalemlerinde iskonto ve KDV sütunu, müşteri vergi/adres bloğu. — Orta
- İskonto onay eşiği uyarısı yok (`requiresDiscountApproval` paylaşılan kural). — Orta
- USD karşılıkları yok; mobildeki "kur ucu yok" yorumu güncel değil, `/fx/rates` var. — Orta

**Servis / lojistik / stok**
- Servis listesi ve kanban kartında makine model/seri no yok: API listesi yalnız `customerDeviceId` dönüyor. **API değişikliği gerekli** (`customerDevice {model, serialNumber, warrantyEndDate}`). — Yüksek
- Basılı belgeler mobilde üretilemiyor: kurulum tutanağı (teslimat/kurulum), irsaliye, kargo etiketi, servis teklifi, ürün teknik PDF'i. Web bunları istemcide HTML olarak basıyor. **API'de PDF ucu gerekli** (`service-form-pdf.ts` kalıbı). — Yüksek
- Kayıt tipi, kaynak, garanti ve severity filtreleri ile kanban sütun sayıları yalnız yüklenen sayfadan hesaplanıyor (API parametresi/özeti yok). — Orta
- Makine servis geçmişi firma aramasıyla çekilip istemcide süzülüyor (`customerDeviceId` filtresi yok). — Orta
- Teslimat detayı tekil uç yerine listeden yükleniyor (`GET /deliveries/:id` yok); derin bağlantıda kırılgan. — Orta
- Garanti rozeti ve makine QR etiketi yazdırma yok. — Orta

**Rapor / bildirim / sohbet**
- Sohbet: sesli mesaj kaydı ve satır içi ses oynatma yok; sesli/görüntülü arama butonu "desteklenmiyor" diyor. — Yüksek/Orta
- Hedef raporu: aylık seyir (sparkline), sıra, "E-posta gönder" (PDF), "Hedef atanan kişi" KPI'ı yok. — Orta
- Haftalık aktivite raporu: teklif satırında durum, fiyat ve iskonto yok; "Teklif veren kişiler" özeti yok. — Orta
- Operasyonel/karlılık/hedef raporlarında PDF/Yazdır yok (`expo-print` ile çözülebilir). — Orta
- Bildirim tercihleri: webde yalnız localStorage'da duruyor ve hiçbir yerde okunmuyor (etkisiz); API ucu yok. Mobilde karşılığı yok. — Orta

**Bilinçli olarak webde bırakılabilecekler:** tablo/kart geçişi, sürükle-bırak kanban, spec şablonu yönetimi, öneri seed yükleme, canlı kurumsal önizleme.

## 3. Tasarım önerileri

### Hızlı kazanımlar (ortak bileşen, çok ekranı birden düzeltir)
1. **Kontrast:** `theme.config.js` içinde açık tema `warning` #d97706 → #b45309. Şu an küçük metinde 3,1:1 (AA altı); "Takipsiz" çipi ve çevrimdışı şeridi güneşte okunmuyor. Tek satırlık değişiklik.
2. **Durum bileşenleri** (`MS/ui/index.tsx`):
   - `Loading` dairesel spinner yerine iskelet göstersin (DESIGN.md §4 yasaklıyor; 57 dosyada kullanılıyor).
   - `ErrorState` `OfflineError`'ı nötr "Çevrimdışı, son veriler" olarak göstersin.
   - `SyncStatus` başlık bileşenlerine gömülsün.
3. **Tek `Tabs` bileşeni ve tek yatay boşluk token'ı:** Şu an 4 ayrı sekme kopyası var; boşluk bazı ekranlarda `SCREEN_PAD = 26`, bazılarında `px-4`. 26pt dar telefonda genişliğin yaklaşık %14'ünü yiyor.

### Ekran bazlı
| Öneri | Etki | Efor |
|---|---|---|
| Firma detayının ilk kartı "Saha özeti" olsun: bakiye/gecikmiş tutar, açık fırsat, son ziyaret, sonraki aksiyon, tek dokunuşla aranacak kontak. Künye alta katlansın; başlıkta firma adı yazsın | Yüksek | M |
| Fırsat detayı `DetailHeader` kullansın (logo yerine başlık; derin bağlantıdan doğru geri dönüş); Önceki/Sonraki küçük ikon olsun; hero'da "Ara" | Yüksek | S |
| Servis talebi hero kartında "Ara · Yol tarifi · Zamanlayıcı" satırı olsun; makine model/seri ve garanti rozeti ilk satırda | Yüksek | S |
| Ortak `DetailActionBar`: cam sekme çubuğunun üstünde sabit 2–3 eylem (başparmak erişimi) | Yüksek | M |
| `ListRow` için `dense` varyantı (3 satır: başlık+tutar / konum+sonraki aksiyon / tek çip); firma satırındaki vergi no, oluşturan gibi alanlar detaya | Yüksek | M |
| Modül merkezi: erişilemeyen 48 modülden kilitliler gizlensin/katlansın, üste "Son kullanılan" 4–6 kutu | Yüksek | S |
| Para/tarih biçimi tek yerde: 7 farklı biçim var ("₺1.234,50", "1.234 TL", "1.234,00 TRY", "$ 1.234", "22,2 Mn TRY"…) → `formatAmount(value, code, {compact})` + lint kuralı | Orta | S |
| Teklif/belge/fatura için ortak "Para özeti" kartı: ara toplam, iskonto, KDV, gümrük, genel toplam, ≈TRY/USD | Orta | M |
| Teklif detayında R1→R2→R3 revizyon şeridi (H1 düzeltmesiyle birlikte) | Orta | S |
| Fırsat listesinde istemci filtresi açıkken "Yüklenen N kart içinde süzüldü · tümünü yükle" bandı (sessiz eksik sonucu önler) | Orta | S |
| Tek tarayıcı: seri no/QR hem stokta hem müşteri cihazında arasın; makine kartı + açık servisler + "Servis talebi aç" | Orta | M |
| Taban metin 12px (şu an 187 yerde 11px, 28 yerde 10px, 3 yerde 9px) | Orta | S |

## 4. Önerilen sıra
1. **Hatalar H1–H11.** Hepsi istemci tarafında, küçük işler.
2. **Hızlı kazanımlar 1–3.** Ortak bileşenler, onlarca ekranı birden düzeltir.
3. **Mobil UI işleri** (API zaten veriyor):
   - fırsat görev listesi
   - firma detay alanları
   - belge/teklif para özeti
4. **API gerektirenler:**
   - servis listesine makine bilgisi
   - PDF uçları (tutanak, irsaliye, etiket, servis teklifi)
   - liste filtre parametreleri
   - `GET /deliveries/:id`
   - bildirim tercihleri ucu
5. **Daha büyük özellikler:** sohbette ses, rapor PDF/e-posta, saha özeti ve aksiyon çubuğu.
