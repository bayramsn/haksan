# Web ↔ Mobil v2 denetimi: açılır alanlar, veri alanları, hiyerarşi, tasarım (28.10.2026)

Beş paralel inceleme yapıldı: CRM, belge/finans, ürün/stok/servis, yönetim/rapor ve hiyerarşi/tasarım. Kilit bulgular ayrıca elle doğrulandı. Önceki denetim: [parite-denetimi-2026-10-27.md](parite-denetimi-2026-10-27.md).

Kısaltmalar:
- `M` = `app/(tabs)/(home,companies,opportunities,calendar,modules)`
- `MS` = `src`
- `MD` = `app/modal`
- `W` = `apps/web/src/app/components`

## Özet

- **Sayfa paritesi tam.** Web menüsündeki 27 anahtarın hepsinin mobil karşılığı var. Mobilde webde olmayan modüller de var: Hedefler, Satış Siparişi, Satın Alma, Bakım Planı, Şikâyet Kutusu, Görüşme Yardımcısı, Takvim Senkronu. Katalogdaki 40 modülün 40 klasörü var.
- **Rota taşıması sağlam.** `(tabs)/<x>` → ortak grup taşıması commit'lenmemiş durumda, ama 161 statik rota dizesinin tamamı bir dosyaya çözülüyor. `tsc --noEmit` temiz geçiyor.
- **27.10 hatalarının durumu.** H1–H11'in hepsi düzeldi. Fırsat detayındaki görev listesi ve cari tutarlarının tüm dövizlerle gösterimi de düzeldi.
- **Asıl açık üç yerde:**
  1. Webin lookup'tan ya da hazır şablondan doldurduğu açılır alanlar.
  2. Basılı belgeler (PDF).
  3. Tasarım sistemi borcu. 27.10'daki tasarım önerilerinin hiçbiri uygulanmadı.

---

## 1. Açılır alanlar: kaynak / seçenek farkları

### Yüksek
| Alan | Web | Mobil | Fark |
|---|---|---|---|
| Fırsat aşama sayfası → Kayıp → Rakip firma | `W/dialogs/CloseCaseDialog.tsx:239-260`: rakip listesi, arama, "listede yok → kaydet" | `M/modules/opportunities/[id].tsx:1371` serbest `Field`, `:407` yalnız `lostCompetitorName` | `competitorId` kaydedilmiyor. `MS/ui/sales/LostCaseFields.tsx` yalnız CloseCaseSheet ve QualificationBoard'da kullanılıyor, bu ekranda yok |
| Teklif "Teslim Şekli" → şart metinleri | `W/dialogs/QuoteDialog.tsx:1340-1355`: seçim, `QUOTE_NOTE_VARIANTS` şablonundan ödeme, teslim ve garanti metnini dolduruyor | `MD/quote-form.tsx:689-703` | Yalnız etiket yazılıyor, şablon bağı yok |
| Şart şablonu seçici | `W/dialogs/DocumentTermsTemplateEditor.tsx:256-268`: hazır varyantlar + kayıtlılar + "Özel" | `MS/ui/documents/TermsTemplatePicker.tsx:11-57` | Mobil yalnız kayıtlı şablonları gösteriyor. Hazır teklif/sözleşme varyantları (`QUOTE_/CONTRACT_NOTE_VARIANTS`) mobilde hiç yok |
| Lazer profili (seri/kabin/güç/model) | `W/dialogs/CreateDialogs.tsx:4530-4536`, zorunlu (`:4045`) | `MS/ui/products/ProductForm.tsx`: YOK | Mobilde lazer ürünü teknik konfigürasyonsuz oluşturuluyor |

### Orta
| Alan | Web | Mobil | Fark |
|---|---|---|---|
| Sevkiyat paket birimi | `CreateDialogs.tsx:5245` `useLookupRows("shipment-package-units")` | `MS/ui/service/logistics.ts:27-33`: 5 sabit değer | Ayarlardan eklenen birim mobilde görünmüyor |
| Servis personeli / kurulum teknisyeni | `CreateDialogs.tsx:6499, 6961`: Servis rolü veya departmanına göre süzülüyor | `MS/ui/service/fields.tsx:120-124`, `MD/installation-form.tsx:185`: tüm dizin | Süzgeç yok |
| Ürün tedarikçisi | `CreateDialogs.tsx:4268`: ilişki `supplier` veya `supplier_customer` | `ProductForm.tsx:290` CompanyPicker | Tüm firmalar seçilebiliyor |
| Ürün para birimi | `CreateDialogs.tsx:4338`: sabit USD/EUR/TRY | `ProductForm.tsx:69` `useLookup('currencies')` | Seçenek kümeleri farklı. Aynı ters fark alacak/kasa formlarında da var (`CreateDialogs.tsx:6289,6467` ↔ `MD/new-receivable.tsx:67`). **Hangi tarafın doğru olduğuna karar verilmeli** |
| Kontak → Karar yetkisi | `CreateDialogs.tsx:1152`: sabit 2 seçenek | `MS/features/contacts/contact-form-screen.tsx:165`: `decision-roles` lookup (seed'de 5) | Etiketler farklı. Lookup boşsa alan hiç görünmüyor |
| Fırsat oluştur → Müşteri | `CreateDialogs.tsx:2044`: arama + "yeni firma oluştur" | `MD/create-case.tsx:220` | Satır içinde yeni firma oluşturulamıyor |
| Fırsat oluştur → Talep edilen makine | `CreateDialogs.tsx:1981`: TEZGAH + bölümün `productGroupCode` değeri | `MD/create-case.tsx:242` | Bölüm seçimi listeyi daraltmıyor |
| Aktivite → Atanan | `CreateDialogs.tsx:2979`: ileri tarihli aktivite görev olarak düşüyor | `MS/features/activity-form-screen.tsx`: YOK | Alan yok |
| Teklif ürün seçici filtreleri | `QuoteDialog.tsx:1664-1697`: grup/kategori/alt kategori/tip | `MS/ui/documents/pickers.tsx:293` | Yalnız metin araması var |
| Hazır not / not boyutu | `QuoteDialog.tsx:2118, 2134` | `MD/quote-form.tsx:745` düz alan | `NoteTemplatePicker` yalnız mail'de kullanılıyor |
| Alacak → Teklif bağlama | `CreateDialogs.tsx:6447` | `MD/new-receivable.tsx`: YOK | Alacak teklife bağlanamıyor |
| Teklif PDF logosu | `W/pages/offers/OffersPage.tsx:1240-1300`: Haksan/Firma/Logosuz | `M/modules/quotes/[id].tsx:304` | Logo seçimi yok. **API parametresi gerekli** |
| Uyumlu opsiyonel donanım (ürün + sevkiyat) | `CreateDialogs.tsx:4287-4330, 5323-5361` | `ProductForm`, `MD/shipment-new.tsx`: YOK | Uyumluluk kısıtı ve hızlı ekleme yok |
| Ürün Durum / Kontrol Ünitesi / Fotoğraf | `CreateDialogs.tsx:4432, 4255, 4377` | `ProductForm.tsx`: YOK | Üç alan eksik |
| Operasyonel rapor: Temsilci + Departman | `W/pages/reports/OperationalReport.tsx:234-245`: birlikte çalışıyor, yalnız aktif kullanıcılar | `MS/ui/reports/OperationalSection.tsx:96-116` | Temsilci seçilince departman sıfırlanıyor. Pasif kullanıcı ayrımı ve arama yok |
| Mail ek kaynağı | `W/mail/ComposeMailDialog.tsx:517`: katalog kütüphanesi + otomatik PDF | `MD/mail-compose.tsx:92` | Fırsat yoksa hiç ek eklenemiyor |

### Düşük
- **Makine seçicide garanti ipucu yok.** Web: `CreateDialogs.tsx:6553`. Mobil: `fields.tsx:205`.
- **Servis teklifinde imza seçici yok.** Web: `ServicePages.tsx:2481`.
- **Aktivite türü etiketleri farklı.** Kodlar aynı.
- **Hedef raporunun varsayılan görünümü farklı.** Web "Eksik/Riskli" ile, mobil "Tümü" ile açılıyor (`TargetSection.tsx:41`).
- **"Teklifi gönderen" listesinin kaynağı farklı.** Mobil `/opportunities/assignees` kullanıyor.
- **Stok sabitleri shared'den import edilmiyor, elle kopyalanmış** (`MS/ui/products/stock-logic.ts:21-54`).
- **Giriş ekranında etiket yanıltıcı.** Etiket "E-posta" diyor, ama kullanıcı adıyla da giriş yapılabiliyor.

> Ters yönde bir örnek: fırsat atama kuralında şehir/kaynak alanı mobilde lookup seçici, webde serbest metin. Burada düzeltilmesi gereken web.

## 2. Webde gösterilip mobilde olmayan veri alanları

| Ekran | Eksik | Kanıt (web → mobil) | Öncelik |
|---|---|---|---|
| Servis liste/kanban kartı | Makine model/seri, tip/kaynak/garanti rozeti, SLA kalan gün | `ServicePages.tsx:842-853, 2165-2175` → `MS/ui/service/TicketCard.tsx:47-77`. **API join gerekli** | Yüksek |
| Sözleşme detayı | Model, adet, teslim ayı/şekli, sözleşme tarihi, teknik özellik, aksesuar, ödeme planı tablosu | `W/dialogs/DocumentDetailDialog.tsx:403-450` → YOK | Orta |
| Belge müşteri bloğu | Adres, vergi dairesi/no, telefon, faks | `DocumentDetailDialog.tsx:282-287` → `MS/ui/documents/CommercialDocumentDetail.tsx:245` | Orta |
| Belge kalemleri | İskonto ve KDV oranı sütunu | `DocumentDetailDialog.tsx:315,326` → `CommercialDocumentDetail.tsx:283-289` | Orta |
| Teklif / kasa / ödeme | ≈USD/TRY karşılığı, tek USD KPI toplamı | `QuoteDialog.tsx:1402`, `PaymentsPage.tsx:67,166,933` → `/fx/rates` yalnız gümrükte kullanılıyor | Orta |
| Teklif | İskonto onay eşiği uyarısı | `QuoteDialog.tsx:1103,1390` → mobilde `requiresDiscountApproval` hiç yok | Orta |
| Fırsat detayı | Ödeme/tahsilat satırları; Rakip özeti | `SalesCaseDetail.tsx:1938-1975` → `[id].tsx:1253` yalnız düğmeler var. `:1288` yalnız `lostCompetitor?.name` okuyor, serbest metinle girilen ad boş çıkıyor | Orta |
| Firma detayı | Satış kartında tutar/tarih; görevde atanan/öncelik/durum; en yakın vade; adreste sevkiyat/fatura rozeti | `CustomerDetail.tsx:567-580, 262`, `TaskList.tsx:117`, `CompanyFinancePanel.tsx:130` → `companies/[id].tsx:419, 629, 1018` | Orta |
| Aktivite | Akışta firma adı ve filtre; formda @bahsetme ve dosya | `CreateDialogs.tsx:2945, 2958` → `activities/index.tsx:75`. Filtre için API hazır; firma adı için join gerekli | Orta |
| Makine | Liste satırında servis sayısı; servis kartı/detayında garanti rozeti | `MachinesPage.tsx:378` → `customer-devices/index.tsx:85`; `ServicePages.tsx:3138` → `TicketPanels.tsx:488` | Orta |
| Ürün detayı | Lazer teknik tablosu | `ProductDetailDialog.tsx:627` → YOK | Orta |
| Hedef raporu | "Hedef Atanan Kişi" KPI'ı, sıra, sparkline/YTD, departman kaynağı, dönüştürülemeyen döviz uyarısı | `TargetPerformanceReport.tsx:1039, 1109, 1124, 1076, 1022` → `TargetSection.tsx` | Orta |
| Haftalık aktivite | Teklif satırında durum, il/ilçe, birim fiyat, iskonto | `ActivityLogReportCard.tsx:228-258` → `ActivityLogSection.tsx:128` | Orta |
| Yönetici özeti / operasyonel rapor | Trendler, kaynak kayıt listesi, hücre drill-down'ı (`focus`/ay) | `ReportsPage.tsx:120`, `OperationalReport.tsx:80-87` → `OverviewSection.tsx`, `OperationalSection.tsx:24` | Orta |
| Bildirimler | İstemcide üretilen 10 uyarı türü: lead SLA, ödeme gecikmesi, servis SLA, stok… | `Layout.tsx:415` + `lib/operations.ts:486` → `M/notifications.tsx` yalnız sunucu bildirimlerini gösteriyor | Orta |

**Yeni bulunan hata:** Hedef raporunda departman yüzdesi üye ortalamasına düşünce durum çipi yine `own.status` değerini, yani "Hedef yok" gösteriyor. Web durumu ortalamadan hesaplıyor (`TargetPerformanceReport.tsx:314-323` → `TargetSection.tsx:134-141`).

## 3. Mobilde olmayan aksiyonlar

| Aksiyon | Durum | Ne gerekiyor | Öncelik |
|---|---|---|---|
| Kurulum tutanağı, irsaliye, kargo etiketi | Ekranlar var ama `fileId` geçirilmiyor, sonuç "mobilde üretilmez" (`MS/.../DocumentCapture.tsx:42`) | API PDF ucu (`service-form.pdf` kalıbında) | Yüksek |
| Servis teklifi PDF | `ServiceQuoteEditor.tsx:244`: düğme devre dışı | API PDF ucu | Yüksek |
| Global arama (⌘K: firma, kontak, fırsat, teklif, stok, servis) | YOK (`Layout.tsx:714`, `CommandPalette.tsx:95`) | Mobil arama ekranı | Yüksek |
| Ticari fatura PDF | `kind==='invoice'` için kapalı | API `commercial-invoices/:id/generate-pdf` | Orta |
| Rapor yazdır/PDF (4 rapor) + hedef raporu e-postası | Yalnız metin paylaşımı ve Excel var | `expo-print` kurulu değil | Orta |
| Ürün teknik PDF / teknik bilgi e-postası | YOK | — | Orta |
| Makine QR etiketi yazdırma | Yalnız link paylaşımı (`customer-devices/[id].tsx:219`) | — | Orta |
| Sohbette sesli mesaj ve arama | Ses dosyası belge gibi açılıyor, arama "desteklenmiyor" diyor | Ses kütüphanesi | Orta |
| Firma görevini satırdan tamamlama; sevkiyat/teslimat satırında hızlı durum değiştirme | Yalnız detayda | — | Düşük |

**Bilinçli olarak webde kalabilecekler:** sürükle-bırak kanban (mobilde uzun basma + sheet karşılığı var), canlı kurumsal önizleme, yazdırma öncesi önizleme, Genel ayarlar (para birimi/saat dilimi; webde de yalnız localStorage'da duruyor).

**Bildirim tercihleri:** Webde etkisiz. `notifyNewCase` hiçbir yerde okunmuyor ve API ucu yok. Mobile taşımadan önce API ucu yapılmalı.

## 4. API tarafında gereken işler

1. Servis listesine `customerDevice {model, serialNumber, warrantyEndDate}` join'i.
2. Servis listesine `ticketType`, `source`, `warranty` ve `customerDeviceId` sorgu parametreleri, kanban sütun özetiyle birlikte. Şu an tip/kaynak/garanti süzgeçleri ve sütun sayıları yalnız yüklenen sayfadan hesaplanıyor (`service-tickets/index.tsx:86-90`, `service-kanban/index.tsx:56-67`).
3. `GET /deliveries/:id`. Detay şu an listeden yükleniyor (`deliveries/[id].tsx:31`).
4. PDF uçları: kurulum tutanağı, irsaliye, kargo etiketi, servis teklifi, ticari fatura; teklif PDF'ine logo parametresi.
5. Fırsat listesine `currency` ve `companyDecision` parametreleri. `sortBy`/`sortDir` zaten var, mobil kullanmıyor.
6. Aktivite listesine firma adı join'i.
7. Bildirim tercihleri ucu.

## 5. Hiyerarşi

```
(tabs) 5 sekme: Ana Sayfa · Firmalar · Fırsatlar · Takvim · Modüller
 └ ortak grup M: her sekmenin kendi Stack'i
    ├ Ana Sayfa → kısayollar (Görevler, Takvim, Teklifler), bildirim, sohbet baloncuğu
    ├ Modüller → 6 web grubu + Yönetim → 40 modül → ~27 detay → 91 modal
    └ more/* (19 ekran) ← başlıktaki profil düğmesi
```

| # | Sorun | Kanıt |
|---|---|---|
| N1 | Firmalar, Fırsatlar ve Takvim için ikişer URL var (`/companies` ve `/modules/companies`). Erişim kapısı iki ayrı yerde | `M/companies.tsx:2-6`, `modules/_layout.tsx:16`, `catalog.ts:168` |
| N3 | Fırsat detayı kendi başlığını kullanıyor; `canGoBack` yedeği yok. Derin bağlantıdan açılınca geri dönülemiyor | `opportunities/[id].tsx:114-146` |
| N4 | catalog.ts'teki 8 grup ile `modulesByGroup`/`matchesModuleSearch` ölü kod. Hub, module-menu.ts'teki web gruplarını kullanıyor | `catalog.ts:30-41, 248-259` |
| N5 | Etiketler tutarsız: sekmede "Fırsatlar", hubda "Fırsat"; "Stoklar"/"Stok"; "Kurulumlar"/"Kurulum" | `(tabs)/_layout.tsx:23`, `shared/navigation.ts:74,93,105` |
| N6 | Sohbet kapalıysa kullanıcı `/more`'a yönleniyor | `chat/_layout.tsx:10` |
| N2 | `/calendar`, Ana Sayfa yığınında açılırsa geri oku yerine logo çıkabilir (cihazda doğrulanmadı) | `index.tsx:401,408`, `hierarchy.ts:7` |

Dokunuş sayısı:
- Fırsat ve teklif oluşturmak 2 dokunuş.
- Stok taramak 3 dokunuş.
- Servis talebi açmak 3 dokunuş + kaydırma.
- Ziyaret kaydetmek firma araması + 3 dokunuş.

Ziyaret ve servis talebi için Ana Sayfa'da kısayol yok.

## 6. Tasarım

**Detay sayfaları tutarsız:**
- 4 ayrı sekme uygulaması var: `Tabs`, CompanyTabs, ContactTabs ve fırsattaki satır içi sekmeler. Bunlara ek olarak `Segmented` var. Hepsi pill biçiminde, oysa DESIGN.md §4 alt çizgili sekme istiyor.
- Çek-yenile yalnız firma, servis, kurulum ve makine detaylarında var.
- Hiçbir detayda sabit alt eylem çubuğu yok.

**Token uyumu:**
- `Loading` hâlâ spinner (`MS/ui/index.tsx:379`). Kullanan dosya sayısı 57'den 81'e çıktı.
- Uyarı rengi `#d97706` beyaz zeminde 3,19:1 (AA altı). Yer: `theme.config.js:39`, `global.css:28`.
- 12px altı metin: 11px'te 187, 10px'te 28+14, 9px'te 3+10 kullanım.
- Yatay boşluk karışık: `SCREEN_PAD=26` 138 yerde, `px-4` 149 yerde; 14 ekran ikisini birden kullanıyor.
- Para biçimi en az 7 farklı şekilde yazılıyor: formatPrice "TL", `usd` "$", "TRY", yerel kopyalar.
- `Avatar.tsx:15` mor renk (`#7c3aed`) kullanıyor, DESIGN.md bunu yasaklıyor.
- `onboarding.tsx:204` sabit `#d9d9d9` koyu temaya uymuyor.

**27.10 önerilerinin durumu:** formatAmount kısmen uygulandı. Kalan önerilerin hiçbiri yapılmadı: warning rengi, iskelet, çevrimdışı ErrorState, SyncStatus'un başlığa gömülmesi, tek Tabs, tek boşluk token'ı, hub düzeni, 12px taban, fırsatta DetailHeader, DetailActionBar, dense ListRow, saha özeti.

## 7. Önerilen sıra

**1. Küçük, yalnız istemci tarafı işler (hata ve tutarlılık)**
- Fırsat aşama sayfasında `LostCaseFields` kullanılsın; özetteki Rakip alanına `lostCompetitorName` yedeği eklensin.
- Hedef raporundaki departman çipi hatası.
- Paket birimi lookup'tan gelsin.
- Servis personeli ve tedarikçi süzgeçleri.
- İskonto onay uyarısı (`requiresDiscountApproval`).
- Para birimi listeleri için tek bir karar (sabit liste mi, lookup mı).

**2. Ortak tasarım düzeltmeleri** (çok ekranı birden düzeltir)
- warning `#b45309`.
- `Loading` iskelete dönsün.
- Fırsat detayında `DetailHeader`.
- Tek `Tabs` ve tek boşluk token'ı.
- Hub: kilitli modüller katlansın, son kullanılanlar üste.

**3. Mobil UI işleri** (API zaten veriyor)
- Hazır teklif/sözleşme şablonları ve teslim şekli bağı.
- Sözleşme içeriği, müşteri bloğu, kalemde iskonto/KDV.
- USD karşılıkları için ortak `/fx/rates` hook'u.
- Firma detayı alanları.
- Aktivite formunda Atanan ve Dosya; akışta filtre.
- Fırsat ödeme listesi.
- Hedef ve haftalık rapor alanları.

**4. API gerektirenler:** §4'teki liste.

**5. Büyük özellikler**
- Lazer konfigürasyonu ile ürün formu.
- Global arama.
- Rapor PDF'leri (`expo-print`).
- Sohbette ses.
- QR etiket yazdırma.

## Doğrulamanın sınırı

Bu bir kaynak kodu karşılaştırması. Ekranlar cihazda ya da simülatörde açılmadı. N2 bu yüzden doğrulanmadı.
