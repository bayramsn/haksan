# mobile-v2 ↔ Web Eşleşme Tablosu

> Kaynak: `apps/web/src/app/App.tsx` (TITLES + switch), `apps/web/src/app/components/Layout.tsx` (izin/departman),
> web sayfa bileşenleri ve `apps/mobile-v2/app/**` ekranları; aksiyon işaretleri
> `docs/mobile-v2/web-action-coverage.json` (2026-10-15) ile.
> Yeniden ölçüm: `node scripts/audit-action-parity.mjs --target=mobile-v2`.
>
> ✅ = mobil aynı HTTP metodu + yolu çağırıyor / ekranda var · ❌ = yok.
> Durum: **Tam** (tüm görünüm, ana alan ve aksiyon var) · **Eksik** · **Yok** (mobil ekran yok).

## Özet

- Web aksiyon kapsamı: **138 / 345** (%40).
- Hiçbir web sayfası mobilde **Tam** değil.

| Durum | Sayı | Sayfalar |
|---|---:|---|
| Eksik | 30 | dashboard, chat, calendar, tasks, customers, contacts, sales-map, sales-cases, kanban, offers, proformas, contracts, documents, sales-price-list, payments, accounting-invoices, customer-balances, due-dates, products, stock, shipments, installations + deliveries, purchase-orders, sales-orders, machines, service-requests, service-kanban, service-price-list, reports, settings |
| Yok | 8 | targets, references, trade-fairs, meta, users, roles, departments, public-service-complaint (kapsam dışı) |

Not: `purchase-orders` web'de bileşen olarak var ama menüden render edilmiyor. `sales-orders` web'de ayrı bir sayfa değil; Teklifler sayfasındaki "Satış Siparişleri" kartı. İkisi de mobilde ayrı modül olduğundan tabloya dahil edildi.

## Aşama ataması

| Aşama | Kapsam | Sayfalar |
|---|---|---|
| 2 — Satış çekirdeği | Fırsat akışı, Hedefler, dashboard | sales-cases, kanban, targets, dashboard |
| 3 — Mevcut ekranların paritesi | Mobil ekranı olan, eksik alan/aksiyonlu sayfalar | customers, contacts, sales-map, tasks, calendar, chat, payments, accounting-invoices, customer-balances, due-dates, products, stock, shipments, installations + deliveries, purchase-orders, sales-orders |
| 4 — Servis | Servis akışı, makineler, servis fiyatları | service-requests, service-kanban, machines, service-price-list |
| 5 — Belge ve satış destek | Teklif ve ticari belgeler, referans, fuar | offers, proformas, contracts, documents, sales-price-list, references, trade-fairs |
| 6 — Yönetim | Yönetim, ayarlar, raporlar, Meta | users, roles, departments, settings, reports, meta |
| Kapsam dışı | Oturumsuz müşteri formu | public-service-complaint |

## Doğrulanmış hatalar (aşama beklemeden düzeltilmeli)

Kodla doğrulandı (2026-10-15):

| # | Hata | Yer | Etki |
|---|---|---|---|
| 1 | Garanti onay/ret yanlış yola gidiyor: mobil `POST /service-tickets/:id/warranty/approved\|rejected`, API `…/warranty/approve\|reject` | `apps/mobile-v2/src/api/endpoints.ts` `decideWarranty` | Mobilde garanti onaylama/reddetme her zaman 404 |
| 2 | "Yeni Teklif" FAB'ı işlevsiz (`onPress={() => {}}`) | `apps/mobile-v2/app/(tabs)/modules/quotes/index.tsx` | Teklif oluşturulamıyor |
| 3 | Sohbet başlığında sabit "6 üye, 2 çevrimiçi" | `apps/mobile-v2/app/(tabs)/chat/[id].tsx` | Yanlış bilgi |
| 4 | Servis listesinde her talebin konumu sabit "İstanbul, Türkiye" | `apps/mobile-v2/app/(tabs)/modules/service-tickets/index.tsx` | Yanlış bilgi |
| 5 | Teklif özet grafiğinde sabit "Bu Ay (Mayıs)", "1 May / 15 May / 31 May" | `apps/mobile-v2/app/(tabs)/modules/quotes/index.tsx` | Yanlış bilgi |

İzin uyumsuzlukları (web kuralı esas alınmalı):

- **sales-price-list:** mobil fiyat düzenleme sayfası izin kontrolsüz açılıyor ve liste/peşin fiyatı değiştirilebiliyor; web'de yalnız super_admin kampanya fiyatı düzenler.
- **due-dates:** web `payments.read`, mobil `receivables.read`; web admin olmayanlardan "Ödeme" kayıtlarını gizliyor, mobil göstermiyor.
- **purchase-orders:** onay için mobil ek olarak `purchase_orders.approve` istiyor.
- **service-price-list:** mobil modül servis yerine `sales-price-list` navKey'ine bağlı.
- Modül görünürlüğü: web `canAccessNavKey` admin rolüne tüm menüyü açar, kullanıcı/rol/departman sayfalarını yalnız admine gösterir; mobil yalnız super_admin'i muaf tutuyordu (76d861412 ile düzeltildi). Web `NAV_ROLES` menü öğesine yazılıyor ama filtrelemede kullanılmıyor; departman kısıtı yok.

## Program genelinde tekrar eden eksikler

Aşamalarda ortak bileşen olarak bir kez çözülmeli:

- **Excel dışa aktarma** (`/exports/*`): firmalar, kontaklar, fırsatlar, teklifler, belgeler, finans, cari, stok, sevkiyat, satın alma, servis. Mobilde dosyayı indirip paylaşım sayfasıyla açan tek bir yardımcı.
- **Uygulama içi e-posta** (`mail.send`): firma, kontak, fırsat ve teklifte web uygulama içi mail atıyor, mobil `mailto` açıyor.
- **Seçici bileşenler:** firma, kontak ve tarih/saat seçici. Takvim, görev, servis ve satın alma formlarında elle metin girişi var.
- **Dosya ekleri:** kayda bağlı belge listesi, önizleme ve sonradan yükleme (ödeme, fırsat, servis talebi, şikayet, kurulum).
- **KPI şeritleri:** web sayfalarının çoğunda olan özet kartları mobilde eksik.
- **Yazdır/PDF:** sunucu PDF'i olan belgeler (cari ekstre, kurulum tutanağı, kargo etiketi, irsaliye, sözleşme, proforma) mobilde açılıp paylaşılmalı.

---

## Sayfalar — Genel ve CRM

### dashboard — Gösterge Paneli
- **Web:** `apps/web/src/app/components/pages/Dashboard.tsx`, `pages/dashboard/DashboardBriefing.tsx`, `pages/dashboard/DashboardTasksPanel.tsx`, `pages/dashboard/SalesQualificationPanel.tsx`, `pages/dashboard/TargetWorkspace.tsx`, `pages/TeamActivityPanel.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/index.tsx` (+ `src/api/dashboard.ts`)
- **İzin:** yok (her zaman erişilebilir) · departman: hepsi
- **Görünümler:** web: sekmeler Özet / Operasyon / Grafikler / Hedefler; Brifing; Görev paneli; Ekip Aktivitesi (gün/hafta/ay/yıl + detay penceresi); Yönetim Merkezi (risk/fırsat/aksiyon/trend, Rapor Detayı); grafik detayına inme (drilldown); mobil: sekmesiz tek kaydırmalı sayfa; pull-to-refresh; bildirim zili
- **Alanlar/filtreler:** web: role göre sıralanan KPI'lar (Aktif Müşteri, Ciro, Fırsat $, Geciken, Açık Servis, Aktif Makine); Canlı durum; Satış Performansı (kazanma oranı, döngü, ort. fırsat, pipeline hızı); Satış Trendi; Fırsat Dağılımı pastası; Öncelikli İşler; Sinyaller; Bugün Yapılacaklar; Açık Satış Kartları; Açık Servis Talepleri; dönüşüm/servis/stok riski/sevkiyat/kâr/makine KPI'ları; aylık satış (1A/3A/6A/1Y); Satış Hunisi; Departman Performansı radarı; Aylık Ciro; Kazanan vs Kaybedilen; görev sayaçları (mine/today/overdue/upcoming/all/completed) + ekip tablosu; mobil: KPI'lar Açık Fırsatlar, Bu Ay Teklifler, Tahsilat (6 ay, değişim), Sevkiyat; Satış Trendi (tahsilat çizgisi); Fırsat Aşama Özeti hunisi (5 + Diğer, dönüşüm oranı); Üretim & Stok (Stokta/Rezerve/Sevkiyatta); "Bugünkü Görevler" (bugünkü takvim etkinlikleri); Yaklaşan Etkinlikler (14 gün)
- **Aksiyonlar:** tasks.counts ✅ · tasks.list ✅ · tasks.summary ❌ · report.myTargetProgress ❌ · report.targetProgress ❌ · report.teamActivity ❌ · report.teamActivityDetails ❌ · admin.users ❌ · admin.departments ❌ · admin.divisions ❌ · admin.userTargets ❌ · admin.saveUserTarget ❌ · admin.departmentTargets ❌ · admin.saveDepartmentTarget ❌ · admin.divisionTargets ❌ · admin.saveDivisionTarget ❌ · UI: Hedefler "CSV / Excel" dışa aktarım ❌ · "Yazdır / PDF" ❌
- **Durum:** Eksik
- **Eksikler:**
  - Özet / Operasyon / Grafikler / Hedefler sekme yapısı yok.
  - Görev paneli yok: mobil "Bugünkü Görevler" alanı görev değil, takvim etkinliği gösteriyor; ekip görev özeti (tasks.summary) yok.
  - Hedefler alanı (TargetWorkspace) yok: hedef ilerlemesi, hedef atama/düzenleme ve CSV/PDF çıktısı bulunmuyor.
  - Ekip Aktivitesi paneli ve detay penceresi yok.
  - Brifing, Satış Kalifikasyon paneli, Yönetim Merkezi, Öncelikli İşler, Sinyaller, Açık Satış Kartları ve Açık Servis Talepleri listeleri yok.
  - Aktif Müşteri, Geciken alacak, Açık Servis ve Aktif Makine verileri mobilde hesaplanıyor ama ekranda gösterilmiyor; Ciro ve Satış Performansı KPI'ları da yok.
  - Grafikler sekmesindeki grafikler yok (aylık satış dönem seçimi, Departman Performansı radarı, Aylık Ciro, Kazanan vs Kaybedilen) ve grafik detayına inme yok.

### chat — Sohbet
- **Web:** `apps/web/src/app/components/pages/chat/ChatPage.tsx`, `pages/chat/GroupDialogs.tsx`, `pages/chat/ShareRecordDialog.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/chat/index.tsx`, `app/(tabs)/chat/new.tsx`, `app/(tabs)/chat/new-group.tsx`, `app/(tabs)/chat/[id].tsx`
- **İzin:** yok (her zaman erişilebilir) · departman: hepsi
- **Görünümler:** web: sohbet listesi (Okunmamış / Tüm gruplaması, toplam okunmamış sayısı), mesaj alanı, Yeni Sohbet, Yeni Grup, Grup Ayarları, mesaj arama, sesli/görüntülü arama; mobil: sohbet listesi, Yeni sohbet (rehberden kişi seçerek birebir sohbet), Yeni grup (yalnız super_admin), sohbet ekranı (sonsuz kaydırma, anlık güncelleme, gün ayraçları)
- **Alanlar/filtreler:** web: liste araması; mesaj araması (en az 2 karakter); grup alanları başlık, açıklama, "yalnız yöneticiler yazabilir" (onlyAdminsCanPost), üyeler; ✓✓ görüldü bilgisi; satır içi resim/ses; kayıt kartı (refCard); mobil: liste araması, okunmamış rozeti; grup alanları başlık, açıklama, onlyAdminsCanPost, üyeler; yazma yetkisi (canPost)
- **Aksiyonlar:** chat.directory ✅ · chat.conversations ✅ · chat.createDm ✅ · chat.createGroup ✅ · chat.conversation ❌ · chat.updateGroup ❌ · chat.addMembers ❌ · chat.removeMember ❌ · chat.setMemberRole ❌ · chat.messages ✅ · chat.sendMessage ✅ · chat.markRead ✅ · chat.editMessage ✅ · chat.toggleReaction ✅ · chat.deleteMessage ✅ · chat.webrtcConfig ❌ · file.signedUpload ✅ · file.uploadBinary ❌ · opportunity.list ✅ · quote.list ✅ · service.tickets ✅ · UI: konum paylaşımı ✅ · ek açma/paylaşma ✅ · GIF ❌ · emoji seçici ❌ · kayıt paylaşımı ❌ · sesli mesaj kaydı ❌ · sesli/görüntülü arama ❌
- **Durum:** Eksik
- **Eksikler:**
  - Grup ayarları yok: grup düzenleme, üye ekleme/çıkarma ve üye rolü değiştirme bulunmuyor.
  - Sesli/görüntülü arama yok: başlıktaki arama düğmelerinin `onPress`'i yok, WebRTC yapılandırması da çekilmiyor.
  - Başlıkta sabit kodlu "6 üye, 2 çevrimiçi" metni gösteriliyor.
  - Mikrofon simgesi var ama sesli mesaj kaydı yok; emoji simgesi yalnızca süs, GIF desteği de yok.
  - Kayıt paylaşımı (firma/teklif/fırsat/servis) yok ve gelen kayıt kartları (refCard) gösterilmiyor.
  - Sohbet içinde mesaj araması yok.
  - Ekler satır içinde gösterilmiyor (resim/ses önizlemesi yok); "görüldü" işareti her mesajda koşulsuz çıkıyor.
  - Listede Okunmamış / Tüm gruplaması yok.

### calendar — Takvim
- **Web:** `apps/web/src/app/components/pages/CalendarPage.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/calendar.tsx` → `app/(tabs)/modules/calendar/index.tsx`, `app/modal/calendar-event.tsx`
- **İzin:** `calendar.read` · departman: hepsi
- **Görünümler:** web: Ay / Hafta / Gün / Liste; Yaklaşanlar kenar paneli; önceki/sonraki/Bugün/yenile; çift tıklayarak oluşturma; mobil: yalnız ay ızgarası + seçili günün listesi + yaklaşan 5 etkinlik
- **Alanlar/filtreler:** web: sahip filtresi (super_admin); "Arşivi göster"; düzenleyicide Etkinlik türü (customer_visit, meeting, call, task, other), Kime (sahip atama), Firma (customer_visit için zorunlu), Başlık, Başlangıç/Bitiş, Konum, Not, Tüm gün, Tamamlandı; etiketlerde firma, konum ve kaynak (cihaz/içe aktarma); mobil: tür etiketleri; formda türler meeting/visit/service/call/task/other, Başlık, Konum, Başlangıç/Bitiş (metin, "YYYY-AA-GG SS:DD"), Tüm gün, Açıklama
- **Aksiyonlar:** calendar.events ✅ · calendar.create ✅ · calendar.update ✅ · calendar.remove ✅ · calendar.restore ❌ · calendar.owners ✅ (uç nokta tanımlı ama hiçbir ekran kullanmıyor) · calendar.importPreview ❌ · calendar.importCommit ❌ · UI: .ics içe aktarma ❌ · cihaz takvimine ekleme (yalnız mobil) ✅
- **Durum:** Eksik
- **Eksikler:**
  - Hafta / Gün / Liste görünümleri yok.
  - Sahip filtresi ve sahip atama ("Kime") yok.
  - "Arşivi göster" ve "Geri al" yok; mobil silmeyi kalıcı olarak anlatıyor, web ise 30 günlük arşive alıyor.
  - .ics içe aktarma yok (önizleme/onay, ±6 ay, varsayılan tür).
  - Tür listesi uyuşmuyor: mobilde `customer_visit` yok, yerine `visit` ve `service` var.
  - Formda firma seçici yok (firma yalnız route parametresiyle geliyor); customer_visit için zorunlu firma kuralı da yok.
  - Formda Tamamlandı alanı yok (yalnız listedeki Alert menüsünden değiştiriliyor); tarih/saat seçici yerine elle metin girişi var.
  - Etiketlerde etkinliğin kaynağı (cihaz/içe aktarma) gösterilmiyor.

### tasks — Görevler
- **Web:** `apps/web/src/app/components/pages/tasks/TasksPage.tsx`, `pages/tasks/TaskList.tsx`, `pages/tasks/TaskDetailPanel.tsx`, `pages/tasks/TaskFormDialog.tsx`, `pages/tasks/TaskCompletionDialog.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/tasks/index.tsx`, `app/(tabs)/modules/tasks/[id].tsx`, `app/modal/task.tsx`
- **İzin:** `tasks.read` · departman: hepsi
- **Görünümler:** web: Tüm / Bana Atananlar / Bugün / Gecikenler / Yaklaşan / Geçmiş (sayılarla); ekip özeti (tasks.manage); liste + detay paneli; mobil: aynı görünüm etiketleri + sayılar, liste, detay ekranı
- **Alanlar/filtreler:** web: arama; Durum, Öncelik, Atanan ve Oluşturan filtreleri; sıralama (dueAt/priority/createdAt/status); liste sütunları Görev, İlgili kayıt, Atanan, Öncelik, Durum, Son tarih; detayda Açıklama, Oluşturulma, Tamamlanma, yorumlar + hareketler; formda Görev adı, Atanacak kullanıcı, Öncelik, Son tarih, Hatırlatma, Durum, İlgili firma/kontak seçici, Tamamlama notu, Açıklama; mobil: satırda başlık, ilgili kayıt, son tarih, öncelik (acil/yüksek), atanan, durum; detayda Atanan, Firma, Kontak, Fırsat, Teklif, Servis, Oluşturulma, Tamamlanma, Açıklama, yorumlar, hareketler; formda Görev adı, Öncelik, Atanan, Son tarih (metin), Hatırlatma, Durum, Açıklama
- **Aksiyonlar:** tasks.list ✅ · tasks.counts ✅ · tasks.assignees ✅ · tasks.create ✅ · tasks.update ✅ · tasks.comment ✅ · tasks.summary ❌ · tasks.remove ❌ · UI: Tamamla / Tekrar Aç ✅ · İptal Et ✅ · Düzenle ✅ · toplu seçim (checkbox) ❌
- **Durum:** Eksik
- **Eksikler:**
  - Liste araması yok; Durum/Öncelik/Atanan/Oluşturan filtreleri ve sıralama seçenekleri yok.
  - Ekip özeti (tasks.summary) yok.
  - Görev silme (tasks.delete) yok.
  - Görev tamamlanırken zorunlu tamamlama notu istenmiyor; hem listedeki tek dokunuşla hem detaydaki "Tamamla" not almadan kapatıyor.
  - Formda firma/kontak seçici yok; ilişki yalnız route parametresiyle kuruluyor.
  - Detayda yalnız Firmaya Git ve Fırsata Git var; teklif ve servis kaydına gitme yok.
  - (masaüstüne özgü, kapsam dışı: liste/detay bölünmüş paneli ve toplu seçim)

### customers — Firmalar
- **Web:** `apps/web/src/app/components/pages/Customers.tsx`, `pages/CustomerDetail.tsx`, `components/shared/CompanyFinancePanel.tsx`, `components/shared/CompanyNotesCard.tsx`, `components/dialogs/CreateDialogs.tsx` (CreateCustomerDialog, EditCustomerDialog, LogActivityDialog)
- **Mobil:** `apps/mobile-v2/app/(tabs)/companies.tsx` → `app/(tabs)/modules/companies/index.tsx`, `app/(tabs)/modules/companies/[id].tsx`, `app/modal/new-company.tsx`, `app/modal/edit-company.tsx`
- **İzin:** `companies.read` · departman: sales, finance (+ admin/super_admin)
- **Görünümler:** web: KPI'lar (Toplam/Müşteri/Tedarikçi); ilişki sekmeleri (all/customer/supplier_customer/supplier/competitor); tablo/kart görünümü; sayfalama; detayda sekmeler Geçmiş, Satış Kartları, Teklifler, Belgeler, Görevler, Aktivite, Cari, Makineler; mobil: StatStrip (Toplam/Müşteri/Tedarikçi/Ted+Müşteri/Rakip); ilişki çipleri; sonsuz kaydırmalı liste; detayda sekmeler Genel, Aktivite, Teklifler, Görevler, Cari, Belgeler (satış kartları ve makineler Genel sekmesinde)
- **Alanlar/filtreler:** web: arama; Şehir/Sektör/Tedarikçi Türü filtreleri; 5 sıralama modu; Bölüm çipleri; Müşteri Statüsü çipleri (Hepsi/Potansiyel/Cari Satış Yapılan); sütunlar Firma (il/ilçe, Kurumsal/Bireysel · VKN), Firma Tipi (+ tedarikçi türü, Cari/Potansiyel, birimler), İletişim, Konum, Oluşturma (tarih + oluşturan); oluşturma formunda logo, Firma Tipi, Tedarikçi Türü, Statü, Birim, Grup, İrtibat Şekli/Kaynak, Sektör, Telefon-1/2, Faks, Mail-1/2, Web, adresler (tür/ülke/il/ilçe/açık adres), Vergi Dairesi, VKN, Notlar; detayda borç/alacak, en yakın vade, Talep Edilen Ürün, makinelerde Kurulum ve Durum; mobil: arama; Durum (potential/active/passive/blacklist), Şehir ve Sektör filtreleri; sabit ada göre A-Z sıralama; satırda logo, unvan, il, ilişki ve sektör çipi, güncelleme tarihi; yeni firma formunda Ünvan, Kısa ad, Sektör, Telefon, E-posta, Web, Not; düzenleme formunda bunlara ek Vergi dairesi ve Vergi no; detayda künye, tüm telefon/e-postalar, adresler, kontaklar, finansal özet, makineler (Model/Seri No/Garanti Bitiş), başka birimdeki borç uyarısı
- **Aksiyonlar:** company.list ✅ · company.summary ✅ · company.get ✅ · company.create ✅ · company.update ✅ · company.remove ✅ · company.previewCompanyContactImport ❌ · company.commitCompanyContactImport ❌ · company.osmSearch ❌ · company.websiteLookup ❌ · lookup.taxOffices ❌ · opportunity.create ✅ · mail.send ✅ · activity.create ✅ · activity.list ✅ · tasks.list ✅ · tasks.events ❌ · salesOrder.list ✅ · finance.companySummary ✅ · file.signedUpload ✅ · file.signedDownload ✅ · crossDivisionDebt ✅ · UI: Excel dışa aktarım (`/exports/companies`) ❌ · cari ekstre Excel ❌ · cari ekstre PDF ❌ · dış teklif "İndir" ❌ · belge önizleme ❌ · ara/e-posta/haritada gör (yalnız mobil) ✅
- **Durum:** Eksik
- **Eksikler:**
  - Toplu içe aktarma (super_admin) ve Excel dışa aktarma yok.
  - Listede Tedarikçi Türü filtresi, Bölüm çipleri, Müşteri Statüsü çipleri ve sıralama seçenekleri yok; satırlarda VKN, iletişim kişisi, telefon ve oluşturan bilgisi gösterilmiyor.
  - Satır aksiyonu olarak "Fırsat oluştur" ve uygulama içi e-posta gönderimi yok; mobil e-posta için `mailto` açıyor.
  - Yeni firma ve düzenleme formlarında şu alanlar yok: logo, Firma Tipi, Tedarikçi Türü, Statü (yalnız ayrı bir sayfadan değişiyor), Birim, Grup, İrtibat Şekli/Kaynak, Telefon-2, Faks, Mail-2 ve adresler.
  - Vergi dairesi listeden seçilmiyor; web sitesinden bilgi doldurma ve OSM ile firma arama yok.
  - Detayda Geçmiş (zaman çizelgesi + görev hareketleri) sekmesi yok.
  - Satış kartları yalnız ilk 5 kayıt olarak gösteriliyor; "Yeni Kart" yok.
  - Teklif detayı penceresi ve bağlı sipariş listesi yok; liste satırları yalnız teklif ekranına gidiyor.
  - Belgeler açılamıyor, önizlenemiyor veya indirilemiyor; yükleme yalnız tek tip ("dış teklif") olarak yapılıyor.
  - Firma detayından Müşteri Ziyareti / Giden Arama kaydı yok (alanlar: amaç, sonuç, sonraki adım, kontak); aktivitenin ayrıntısını okuma ve aktiviteyi fırsata dönüştürme yok.
  - Firma detayından görev oluşturma yok.
  - Not yalnız okunuyor; yerinde not düzenleme yok.
  - Cari ekstre (Excel/PDF) yok; makinelerde Kurulum ve Durum alanları gösterilmiyor.
  - (masaüstüne özgü, kapsam dışı: tablo/kart görünüm tercihinin tarayıcıda saklanması)

### contacts — Kontaklar
- **Web:** `apps/web/src/app/components/pages/Contacts.tsx`, `components/dialogs/DetailDialogs.tsx` (ContactDetailDialog), `components/dialogs/CreateDialogs.tsx` (CreateContactDialog, EditContactDialog)
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/contacts/index.tsx`, `app/(tabs)/modules/contacts/[id].tsx`, `app/modal/contact.tsx` (→ `src/features/contacts/contact-form-screen.tsx`)
- **İzin:** `contacts.read` · departman: sales (+ admin/super_admin)
- **Görünümler:** web: KPI'lar (Toplam Kontak, Birincil, Firma Sayısı, Kara Liste); Tümü/Birincil sekmeleri; tablo/kart görünümü; sayfalama; detay penceresi (bağlı firma, aynı firmadaki diğer kontaklar); mobil: Birincil / Kara liste çipleri; sonsuz kaydırmalı liste; detayda sekmeler İletişim, Genel, Notlar, Aktivite
- **Alanlar/filtreler:** web: arama; İş alanı (birim) çipleri; Departman filtresi; Firma filtresi; sıralama (en yeni, ad A-Z/Z-A, en eski); sütunlar Kişi (+ not), Firma (+ şehir), Ünvan/Departman, İletişim, Oluşturma (tarih + oluşturan); form alanları Firma, Adı Soyadı, Ünvan, Departman, Karar Yetkisi, telefonlar, e-postalar, Bağlı Firmalar, Cinsiyet, Doğum Tarihi, Takım, Memleket, Renk, Okul, Not, Birincil, Kara liste + sebep; mobil: arama; satırda karar rolü çipi, Aktif/Kara liste durumu, firma, şehir, unvan, telefon, e-posta; formda Firma, Ad soyad, Harici kontak no, Unvan, Departman, Karar rolü, Cep/İş/Dahili/Diğer telefon, İş/Kişisel/Diğer e-posta, Cinsiyet, Doğum tarihi, Memleket, Okul, Takım, Renk, Birincil, Kara liste + gerekçe, Notlar; detayda bağlı firmalar listesi
- **Aksiyonlar:** contact.list ✅ · contact.summary ✅ (hook tanımlı ama hiçbir ekran kullanmıyor) · contact.create ✅ · contact.update ✅ · contact.remove ✅ · mail.send ✅ · UI: Excel dışa aktarım (`/exports/contacts`) ❌ · ara ✅ · e-posta ✅ (mobil `mailto` açıyor) · düzenle ✅ · sil ✅
- **Durum:** Eksik
- **Eksikler:**
  - Özet KPI'ları yok (Toplam, Birincil, Firma Sayısı, Kara Liste).
  - İş alanı (birim) çipleri, Departman ve Firma filtreleri ve sıralama seçenekleri yok; mobil sabit ad A-Z sıralıyor.
  - Excel dışa aktarma yok.
  - Listede satır içi ara/e-posta/düzenle/sil düğmeleri yok; bu aksiyonlar yalnız detay ekranında.
  - Uygulama içi e-posta gönderimi yok; mobil `mailto` açıyor.
  - Detayda "Aynı firmadaki diğer kontaklar" listesi ve "Oluşturan" bilgisi yok.
  - Formda birden çok bağlı firmayı yönetme yok; yalnız tek firma seçiliyor.
  - (masaüstüne özgü, kapsam dışı: tablo/kart görünüm tercihinin tarayıcıda saklanması)

### sales-map — Firma Haritası
- **Web:** `apps/web/src/app/components/pages/SalesMap.tsx` (+ `components/company/OsmCompanySearch.tsx`)
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/company-map/index.tsx` (+ `src/features/company-map/CompanyMapSurface.native.tsx`)
- **İzin:** `companies.read` · departman: sales, service (+ admin/super_admin)
- **Görünümler:** web: sol panel (kontroller, seçili firma kartı, "Yakında · uzun süredir uğranmadı" kartı, Ziyaret rotası, firma listesi, "Doğrulanmış tam pini olmayan firmalar") + Leaflet harita (rota çizgisi, firma tipi lejantı); mobil: harita / liste geçişi (Android'de Google Maps anahtarı yoksa yalnız liste); 2.000 firma sınırı uyarısı
- **Alanlar/filtreler:** web: firma adı/şehir araması + "Haritada bul"; firma tipi filtresi; mesafe yarıçapı (50/100/250/500 km); konum kaynakları (GPS, haritadan seçim, il seçimi); mesafeye göre sıralama; pin kalite rozeti (doğrulanmış tam / sokak / ilçe / merkez); popup'ta tip, il/ilçe, mesafe, telefon; mobil: firma/şehir araması; yalnız koordinatı olan firmalar; pin rengi duruma göre (aktif/diğer); callout'ta unvan + il/ilçe; "Konumuma git" düğmesi
- **Aksiyonlar:** company.list ✅ · company.setLocation ❌ · company.nearbyStaleVisits ❌ · company.osmSearch ❌ · activity.create ✅ · UI: Yol tarifi ❌ · rota planlama ve rotayı haritada açma ❌ · Pin düzelt ❌ · Pin sıfırla ❌ · OSM'de ara ❌ · "Ziyaret kaydet" ❌ · firma kartını açma (yalnız mobil) ✅
- **Durum:** Eksik
- **Eksikler:**
  - Koordinatı olmayan firmalar haritada hiç gösterilmiyor; web bunları il/ilçe merkezine yerleştiriyor.
  - Firma tipi filtresi, mesafe yarıçapı, mesafeye göre sıralama ve km gösterimi yok.
  - Firma tipine göre pin rengi ve lejant yok.
  - Konum yalnız GPS'ten alınıyor; haritadan konum seçme, il seçimi ve konumu temizleme yok.
  - Firma pinini düzeltme/sıfırlama yok (`setLocation`); OSM araması ve "tam pini olmayan firmalar" listesi yok.
  - "Yakında · uzun süredir uğranmadı" uyarısı yok; bu karttan ziyaret kaydı da yok.
  - Ziyaret rotası yok (durak ekleme, en yakın komşu sıralaması, toplam km, rotayı Google Maps'te açma).
  - Pin popup'ında yol tarifi, telefon ve konum kalitesi rozeti yok.
  - (masaüstüne özgü, kapsam dışı: filtre/konum/rota durumunun tarayıcıda saklanması)

## Sayfalar — Satış ve belgeler

### sales-cases — Fırsat
- **Web:** `apps/web/src/app/components/pages/SalesCases.tsx`, `QualificationKanban.tsx`, `SalesCaseDetail.tsx`, `OpportunityWorkspace.tsx`, `OpportunityProcessCenter.tsx`, `ProcessChecklistPanel.tsx`, `apps/web/src/app/components/dialogs/LeadCaptureDialog.tsx`, `dialogs/CreateDialogs.tsx` (CreateCaseDialog)
- **Mobil:** `apps/mobile-v2/app/(tabs)/opportunities.tsx` → `app/(tabs)/modules/opportunities/index.tsx`, `app/(tabs)/modules/opportunities/[id].tsx`, `app/modal/new-opportunity.tsx`
- **İzin:** `opportunities.read` (oluşturma: `opportunities.create`) · departman: sales
- **Görünümler:**
  - Web: Liste, Kanban (varsayılan) ve Geçmiş (arşiv) sekmeleri; tam ekran detay diyaloğu (önceki/sonraki geçiş, "Sıradaki iş" özeti, süreç merkezi, aktivite zaman çizelgesi).
  - Mobil: Kanban (yatay pano) ve Liste; tek ekranlık detay; Geçmiş/arşiv görünümü yok.
- **Alanlar/filtreler:**
  - Web liste sütunları: Firma/Kontak (ürün görseli, şehir, #id, "Firma bekliyor"), Tutar, Aşama (+Operasyon), Kaybedilme Detayı, Risk/Sıradaki, Atanan (satır içi seçim), Açılış.
  - Web arama: firma, kontak, ürün, lead ve kayıp alanları.
  - Web filtreler: Aşama, Para Birimi, Firma Kararı, Sonuç, Kapanış/kayıp nedeni; sonuç sayaç butonları ve neden çipleri; dashboard odak filtreleri (open/won/lost/sla_risk/unassigned/no_action/uncontacted, ay).
  - Web sıralama ve sayfalama: isme göre sıralama, 12'li sayfalama.
  - Mobil: arama, 7 aşama seçici (sayaçlı), qualificationStage çipleri.
  - Mobil liste satırı: firma, makine/başlık, Sorumlu, Beklenen kapanış, risk, aşama, tutar.
  - Mobil detay alanları: Firma, İletişim, Sorumlu, İlk temas, Oluşturulma, Kapanış, Şehir, Operasyon, Kaynak, İstenen makine, Ödeme vadesi, E-posta, İlçe, Telefon, Açıklama (salt okunur).
  - Mobil detay kartları: Sonraki Aksiyon, Dış Kaynak (Trello), Kayıp/Kazanım.
- **Aksiyonlar:**
  - `opportunity.list` ✅ · `opportunity.get` ✅ · `opportunity.assignees` ✅
  - `opportunity.create` ✅ (`modal/new-opportunity`)
  - `opportunity.update` ✅ (yalnız sorumlu, sonraki aksiyon, ilk temas, ödeme vadesi)
  - `opportunity.remove` ✅
  - `opportunity.changeQualificationStage` ✅ · `opportunity.close` ✅ · `opportunity.reopen` ✅ · `opportunity.defer` ✅
  - `opportunity.setProcessCheck` ✅ (yalnız durum, not girilmiyor) · `opportunity.decideApproval` ✅
  - `opportunity.convert` ❌ (endpoint tanımlı, UI'da kullanılmıyor)
  - `opportunity.linkCompany` ❌ · `opportunity.changeStage` ❌ (stok rezervi / Satışa Al)
  - `activity.create` ❌ (fırsat ekranından not ve görüşme ekleme yok) · `activity.update` ❌ · `activity.remove` ❌ (fırsattan)
  - `noteTemplate.list/create/update/remove` ❌
  - `quote.create` ❌ · `quote.send/approve/reject` ✅ (teklif detayından) · `quote.approvePrice/rejectPrice` ✅ (`/price-approval/:decision`)
  - `document.createProforma` ❌ · `document.createContract` ❌ · `document.createCommercialInvoice` ❌ · `document.updateContract` ❌
  - `finance.createReceivable` ❌ (fırsattan ödeme planı yok)
  - `service.createShipment` ❌ · `service.createInstallation` ❌
  - `file.signedUpload/link` ❌ (fırsat ekranında yok) · `file.uploadBinary` ❌ · `file.signedDownload` ❌ (fırsat ekranında yok) · `file.remove` ❌ (fırsattan)
  - UI-only: Excel export (`/exports/opportunities`) ❌ · tel: ✅ · mailto ❌ · WhatsApp ❌
- **Durum:** Eksik
- **Eksikler:**
  - Geçmiş/arşiv sekmesi, arşivden Geri Aç ve Sil.
  - Filtreler: Para Birimi, Firma Kararı, Sonuç, kayıp/kapanış nedeni; sonuç sayaçları; dashboard odak filtreleri; isim sıralaması.
  - Lead dönüştürme (convert, override nedeni) ve firma bağlama/oluşturma.
  - Başlık, tutar, olasılık, beklenen kapanış, açıklama ve makine düzenleme.
  - Ödeme şartları düzenleme (yalnız vade günü var); tahsilat planı listesi.
  - Kontrol listesinden teklif, proforma, sözleşme, ödeme planı, ticari fatura, stok rezervi, sevkiyat ve kurulum oluşturma.
  - Kontrol listesine not girişi; arama/ziyaret kaydı aksiyonları.
  - Not yazma alanı, görüşme ekleme, takip görevleri; aktivite düzenleme/silme; aktivite listesi 10 kayıtla sınırlı ve salt okunur.
  - Fırsata bağlı belgelerin listelenmesi, indirilmesi ve yüklenmesi; imzalı sözleşme yükleme; sözleşme şartlarını düzenleme.
  - Sevkiyat, teslim ve kurulum listeleri.
  - Modül kutucukları fırsata göre filtrelenmeden açılıyor.
  - Önceki/sonraki fırsat geçişi.
  - WhatsApp ve mailto iletişim; E-posta alanı salt okunur.
  - Excel export.
  - Liste satırında hızlı kapat/sil/sorumlu değiştirme.
  - (masaüstüne özgü, kapsam dışı: tablo yoğunluğu, localStorage görünüm tercihleri)

### kanban — Fırsat
- **Web:** `apps/web/src/app/components/pages/SalesCases.tsx` (initialView="kanban"), `apps/web/src/app/components/pages/QualificationKanban.tsx`, `dialogs/CreateDialogs.tsx` (CreateCaseDialog "Yeni Kart"); `pages/Kanban.tsx` hiçbir yerden import edilmiyor
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/opportunities/index.tsx` (mode=board), `app/(tabs)/modules/opportunities/[id].tsx`
- **İzin:** `opportunities.read` · departman: sales
- **Görünümler:**
  - Web: KANBAN_STAGES sütunları, sütun toplam tutarı, sürükle-bırak.
  - Mobil: yatay kaydırmalı pano (3 sütun görünür, "+N daha"); sürükleme yok.
- **Alanlar/filtreler:**
  - Web kart: Firma, Konu, İlgili, Adres, Makina, Aktivite (sonraki aktivite + tarih), kayıp detayı diyaloğu; sütun toplamı.
  - Mobil kart: firma, ürün/satılan, tutar, risk (Gecikiyor/Aksiyon Yok/%), atanan avatarı, kontrol listesi ilerlemesi; aşama sayaçları ve arama.
- **Aksiyonlar:**
  - `opportunity.changeQualificationStage` (sürükle-bırak, komşu aşamaya taşı) ✅ (yalnız detaydaki aşama sayfasından)
  - Geriye/kayıptan taşıma için neden zorunluluğu ✅ (detaydan)
  - `opportunity.close` (kayıp nedeni) ✅ · `opportunity.remove` ✅ (detaydan) · `opportunity.create` ✅
  - UI-only: kart üstü menü ❌
- **Durum:** Eksik
- **Eksikler:**
  - Panoda sürükle-bırak ve karttan aşama taşıma.
  - Kart menüsü (komşu aşamaya taşı, kapat/neden gir, sil).
  - Sütun toplam tutarları.
  - Kartta Konu, İlgili, Adres, sonraki aktivite ve tarih alanları.
  - Kayıp detayı diyaloğu.
  - (masaüstüne özgü, kapsam dışı: "sales-qualification" localStorage anahtarı)

### targets — Hedefler
- **Web:** `apps/web/src/app/components/pages/dashboard/TargetWorkspace.tsx` (`pages/Dashboard.tsx` içindeki "hedefler" sekmesi)
- **Mobil:** yok
- **İzin:** nav izni yok (dashboard); hedef atama: admin/super_admin · departman: hepsi
- **Görünümler:**
  - Web: Kişi/Departman/Bölüm kapsam sekmeleri; özet kartları, gerçekleşme–beklenen çizgi grafiği, dönem özeti, Ekip karnesi, Hedef detayları.
  - Mobil: yok
- **Alanlar/filtreler:**
  - Web: kapsam ve konu seçimi; ay aralığı (≤18 ay); hızlı aralıklar (Bu ay/Son 3 ay/Bu çeyrek/Bu yıl).
  - Web özet kartları: Seçili kapsam, Ortalama gerçekleşme, Ay sonu tahmini, Tamamlanan, Yakın takip, Manuel takip.
  - Web ekip karnesi: Tempo/Gerçekleşme/İsim sıralaması.
  - Mobil: yok
- **Aksiyonlar:**
  - `report.myTargetProgress` ❌ · `report.targetProgress` ❌
  - `admin.users` ❌ · `admin.departments` ❌ · `admin.divisions` ❌
  - `admin.userTargets` ❌ · `admin.saveUserTarget` ❌
  - `admin.departmentTargets` ❌ · `admin.saveDepartmentTarget` ❌
  - `admin.divisionTargets` ❌ · `admin.saveDivisionTarget` ❌
  - UI-only: CSV/Excel ❌ · Yazdır/PDF ❌
- **Durum:** Yok
- **Eksikler:**
  - Hedef ekranının tamamı (ilerleme raporu, grafik, ekip karnesi, hedef detayları).
  - Hedef atama ve düzenleme.
  - CSV/Excel ve yazdırma.
  - Mobil dashboard'da hedef verisi yok.

### offers — Teklifler
- **Web:** `apps/web/src/app/components/pages/offers/OffersPage.tsx` (OfferDetailDialog dahil), `apps/web/src/app/components/dialogs/QuoteDialog.tsx`, `dialogs/DocumentUploadDialog.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/quotes/index.tsx`, `app/(tabs)/modules/quotes/[id].tsx`
- **İzin:** `quotes.read` · departman: sales, finance
- **Görünümler:**
  - Web: KPI kartları; Teklif Trendi (6 ay) ve Durum Dağılımı grafikleri; durum sekmeleri; teklif tablosu; Dış Teklifler tablosu; Satış Siparişleri tablosu; detay diyaloğu (revizyon geçmişi, ticari belge rayı).
  - Mobil: liste; aylık özet kartı ve grafik; detay sekmeleri (Genel, Ürünler, Koşullar, Belgeler).
- **Alanlar/filtreler:**
  - Web KPI kartları: Toplam Teklif, Onaylanan, Gönderilen, Kazanma Oranı; en sık ret nedeni.
  - Web filtreler: İş alanı (bölüm) çipleri; Tümü/Taslak/Gönderilen/Takip/Onaylı/Red-İptal sekmeleri; arama (no, kaynak, ürün, müşteri).
  - Web sütunlar: Teklif No, Kaynak, Ürün Adı, Müşteri, Rev., Tarih, Tutar, Durum (+takip tarihi), Not.
  - Mobil filtreler: arama (no, firma); quote-statuses çipleri.
  - Mobil satır: no+R, firma, tutar, durum, tarih.
  - Mobil detay: tarihler, geçerlilik, iş kolu, sorumlu, takip, bağlı sipariş/fırsat, revizyonlar, kalemler, KDV, koşullar, fiyat onay notu, notlar, bağlı belgeler.
- **Aksiyonlar:**
  - `quote.list` ✅ · `quote.get` ✅
  - `quote.create` ❌ ("Yeni Teklif" FAB'ı `onPress={() => {}}`, işlevsiz) · `quote.update` ❌
  - `quote.addItem` ❌ · `quote.updateItem` ❌ · `quote.deleteItem` ❌ · `quote.terms` ❌
  - `quote.send` ✅ · `quote.approve` ✅ · `quote.reject` ✅
  - `quote.approvePrice` ✅ · `quote.rejectPrice` ✅ (`/price-approval/:decision`; JSON N gösteriyor)
  - `quote.changeStatus` ✅ · `quote.remove` ✅
  - `salesOrder.createFromQuote` ✅
  - `opportunity.changeStage` (Satışa Al) ❌
  - `document.createProforma` ❌ · `document.createContract` ❌
  - `finance.createAccountingInvoice` ❌
  - `file.signedUpload/link` (Dış Teklif Yükle) ❌ · `file.signedDownload` (dış teklif dosyası) ❌
  - `mail.send` ✅
  - UI-only: PDF İndir ✅ (`postPdfAndShare`) · Paylaş ✅ (metin) · Yazdır/PDF Kaydet ❌ · Önizle ❌ · HTML İndir ❌ · PDF logo seçimi ❌ · Excel export (`/exports/quotes`) ❌
- **Durum:** Eksik
- **Eksikler:**
  - Teklif oluşturma (FAB işlevsiz) ve düzenleme, kalem ve şart düzenleme.
  - KPI kartları ve kazanma oranı; 6 aylık trend; durum dağılımı; ret nedeni özeti.
  - İş alanı filtresi; Takip, Red-İptal gibi gruplanmış sekmeler.
  - Mobil özet grafiğindeki etiketler sabit kodlu ("Bu Ay (Mayıs)", "1 May/15 May/31 May").
  - Dış Teklif yükleme ve Dış Teklifler listesi.
  - Bu ekranda Satış Siparişleri tablosu yok; ayrı `sales-orders` modülünde.
  - Tekliften proforma, sözleşme ve muhasebe faturası oluşturma; kayıp fırsatı "Satışa Al".
  - Önizleme, yazdırma, HTML indirme, logo seçimi; Excel export.
  - Belgeler sekmesinde satır belgeyi değil firmayı açıyor.
  - Durum notu (statusNote) gösterimi.

### proformas — Proformalar
- **Web:** `apps/web/src/app/components/pages/documents/DocumentsPage.tsx` (App.tsx `proformas` → `documents` yönlendirmesi), `dialogs/CreateProformaDialog.tsx`, `dialogs/QuickProformaDialog.tsx`, `dialogs/EditDocumentDialog.tsx`, `dialogs/LinkCommercialDocumentDialog.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/documents/index.tsx` (kind=proforma), `app/(tabs)/modules/documents/[kind]/[id].tsx`
- **İzin:** `proformas.read` · departman: hepsi (NAV haritasında yok; `documents` üzerinden sales, finance)
- **Görünümler:**
  - Web: Belge Merkezi tablosu ve "Proforma" klasörü; satır içi düzenleme, yazdırma ve indirme menüleri.
  - Mobil: Proforma segmenti listesi ve salt okunur detay.
- **Alanlar/filtreler:**
  - Web: Dosya ve müşteri, Tip, Kaynak ve akış (teklif no·R, teklif durumu, geçerlilik, bağlantı etiketi, Fırsatı aç), Boyut, Yükleyen, Tarih; arama (belge, teklif, firma, ürün, fırsat id, yükleyen).
  - Mobil liste: no, firma, tarih, durum (Kesinleşti/Taslak); arama (belge no, firma).
  - Mobil detay: durum, belge tarihi, iş kolu, para birimi, ödeme vadesi, kesinleşme, kayıt tarihi, kontak, tutar özeti, kalemler, şartlar.
- **Aksiyonlar:**
  - `document.proformas` ✅
  - `document.createProforma` ❌ · `createStandaloneProforma` ❌ (JSON'da yok, mobilde yok)
  - `document.updateProforma` ❌ · `document.updateStandaloneProforma` ❌ · `document.deleteProforma` ❌
  - UI-only: şablonlu Yazdır/PDF (proforma şablonu, teslim şekli) ❌ · şablonlu indirme ❌ · yüklenen dosyayı indir ✅ (`downloadAndShareFile`) · Firmaya Git ✅ · Teklife Git ✅
- **Durum:** Eksik
- **Eksikler:**
  - Proforma oluşturma (teklife bağlı ve hızlı).
  - Fiyat, not ve kalem düzenleme; silme.
  - Bağlantıyı tamamlama (LinkCommercialDocumentDialog).
  - Şablonlu PDF üretimi, yazdırma ve indirme (mobilde yalnız yüklü dosya açılıyor).
  - Kaynak ve akış bilgisi (teklif durumu, geçerlilik, bağlantı etiketi, Fırsatı aç).
  - Boyut ve Yükleyen alanları.

### contracts — Sözleşmeler
- **Web:** `apps/web/src/app/components/pages/documents/DocumentsPage.tsx` (App.tsx `contracts` → `documents` yönlendirmesi), `dialogs/CreateContractDialog.tsx`, `dialogs/QuickContractDialog.tsx`, `dialogs/EditDocumentDialog.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/documents/index.tsx` (kind=contract), `app/(tabs)/modules/documents/[kind]/[id].tsx`
- **İzin:** `contracts.read` · departman: hepsi (NAV haritasında yok; `documents` üzerinden sales, finance)
- **Görünümler:**
  - Web: Belge Merkezi tablosu ve "Sözleşme" klasörü; fırsat detayında sözleşme listesi.
  - Mobil: Sözleşme segmenti listesi ve salt okunur detay.
- **Alanlar/filtreler:**
  - Web: proformadaki sütunlar + imza durumu ("İmzalandı · tarih" / "İmza durumu bekleniyor").
  - Mobil: no, firma, tarih, durum; detayda kalemler, şartlar, tutar özeti.
- **Aksiyonlar:**
  - `document.contracts` ✅
  - `document.createContract` ❌ · `createStandaloneContract` ❌ (JSON'da yok, mobilde yok)
  - `document.updateContract` ❌ (şart düzenleme / imzalı yükleme) · `document.updateStandaloneContract` ❌ · `document.deleteContract` ❌
  - `file.signedUpload/uploadBinary/link` (imzalı sözleşme yükleme) ❌
  - UI-only: Yazdır/PDF ❌ · indir (üretilmiş) ❌ · yüklü dosyayı aç/paylaş ✅
- **Durum:** Eksik
- **Eksikler:**
  - Sözleşme oluşturma (teklife bağlı ve hızlı).
  - Fiyat ve şart düzenleme; imzalı sözleşme yükleme; silme.
  - İmza durumu gösterimi.
  - PDF üretimi ve yazdırma.
  - Kaynak ve akış bağlantı bilgisi.

### documents — Ticari Belge Merkezi
- **Web:** `apps/web/src/app/components/pages/documents/DocumentsPage.tsx`, `dialogs/DocumentUploadDialog.tsx`, `dialogs/LinkCommercialDocumentDialog.tsx`, `dialogs/EditDocumentDialog.tsx`, `dialogs/QuickProformaDialog.tsx`, `dialogs/QuickContractDialog.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/documents/index.tsx`, `app/(tabs)/modules/documents/[kind]/[id].tsx`
- **İzin:** `files.read` (veya `proformas.read` / `contracts.read` / `commercial_invoices.read` biri yeterli) · departman: sales, finance
- **Görünümler:**
  - Web: hero ve rota sayaçları (Teklif → Proforma → Sözleşme → Ticari fatura).
  - Web klasörler: Ticari Belgeler (Proforma, Sözleşme, Ticari fatura, Muhasebe faturası, Dış teklif), Saha Formları (Teslim, Kurulum), Diğer Dosyalar.
  - Web ayrıca: envanter tablosu, önizleme diyaloğu, detay diyaloğu.
  - Mobil: yalnız 3 segment (Proforma, Sözleşme, Ticari Fatura) ve detay.
- **Alanlar/filtreler:**
  - Web sayaçlar: dosyalı, canlı, son 30 gün, müşteri sayısı, bağlantılı, doğrudan teklif bağlantılı, inceleme gerekli.
  - Web filtreler: Tip (8 tür + Tümü); arama.
  - Web sütunlar: Dosya ve müşteri (Dosya mevcut / Canlı saha formu / Snapshot korumalı), Tip, Kaynak ve akış (Kasa kaydını aç, Servis talebini aç, Muhasebe kaydını aç), Boyut, Yükleyen, Tarih.
  - Mobil: segment seçimi (Tümü yok), arama; no, firma, tarih, durum.
- **Aksiyonlar:**
  - `document.proformas` ✅ · `document.contracts` ✅ · `document.commercialInvoices` ✅
  - `document.createCommercialInvoice` ❌ · `document.updateCommercialInvoice` ❌
  - `document.deleteProforma/deleteContract/deleteCommercialInvoice` ❌
  - `file.signedUpload` ❌ (bu ekranda yok) · `file.uploadBinary` ❌ · `file.link` ❌ · `file.remove` ❌
  - `file.signedDownload` ✅ · `company.get` ✅ · `service.installations` (kurulum formu) ❌ (bu ekranda)
  - UI-only: Excel export (`/exports/documents`) ❌ · CSV (dosyasız kayıt) ❌ · Yazdır/PDF (teslim/kurulum formu dahil) ❌ · Önizle ❌ · yüklü dosyayı aç/paylaş ✅
- **Durum:** Eksik
- **Eksikler:**
  - Muhasebe faturası, Dış teklif, Teslim formu, Kurulum formu ve Diğer türleri.
  - "Tümü" görünümü ve klasör sayaçları; rota ve özet sayaçları.
  - Kaynağa bağlı dosya yükleme; bağlantı tamamlama; silme.
  - Teslim ve kurulum formu yazdırma; PDF üretimi; önizleme; Excel/CSV.
  - Kasa, servis ve muhasebe kaydına geçiş linkleri.
  - Boyut ve Yükleyen alanları.

### sales-price-list — Satış Fiyat Listesi
- **Web:** `apps/web/src/app/components/pages/PriceLists.tsx` (`SalesPriceListPage`)
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/price-lists/index.tsx`
- **İzin:** `price_lists.read` (kampanya: super_admin + `price_lists.update`/`create`; ürün düzenleme: `products.update`) · departman: sales
- **Görünümler:**
  - Web: özet kartları (Tezgah, Fiyatlı, Kampanya, Liste kodu/para birimi), filtre paneli, tablo, ürün detay ve ürün düzenleme diyaloğu.
  - Mobil: StatStrip (Aktif Fiyat Listesi, Toplam Ürün), liste seçimi, kart listesi, fiyat düzenleme alt sayfası.
- **Alanlar/filtreler:**
  - Web: fiyat listesi seçimi; arama (tezgah, marka, model); Grup, Kategori, Alt kategori, Ürün tipi, Marka; bölüme göre ana makine süzmesi; Filtreleri temizle.
  - Web sütunlar: Ürün Adı (görsel, marka·seri·model), Marka, Tip, Peşin Fiyat, Liste Fiyatı, Kampanyalı Fiyat (geçerlilik tarihleri ve aktiflik).
  - Mobil: liste çipleri; arama (ad, kod); liste geçerlilik tarihleri.
  - Mobil kart: ad, model kodu, Liste, Peşin, Kampanya.
- **Aksiyonlar:**
  - `product.listPriceLists` ✅ · `product.listPriceListItems` ✅
  - `product.updatePriceListItem` ✅ (mobil liste ve peşin fiyatı da düzenletiyor; web'de bunlar salt okunur, yalnız kampanya düzenlenir)
  - `product.createPriceListItem` ❌ (kalem yoksa kampanya oluşturma)
  - `product.get` (detay diyaloğu) ❌ (bu ekranda) · `product.update` (ürün düzenleme) ❌ (bu ekranda)
- **Durum:** Eksik
- **Eksikler:**
  - Grup, kategori, alt kategori, tip ve marka filtreleri; bölüme göre süzme.
  - Ürün görseli ve marka/tip sütunları; ürün detayı ve düzenleme.
  - Kampanya geçerlilik tarihleri (başlangıç/bitiş).
  - Fiyat kalemi olmayan ürüne kampanya oluşturma.
  - İzin uyumsuzluğu: mobilde düzenleme sayfası izin kontrolsüz açılıyor ve liste/peşin fiyatı değiştirilebiliyor; web'de yalnız super_admin kampanya düzenleyebiliyor.
  - Tezgah, fiyatlı ve kampanya sayaçları.

### references — Referanslar
- **Web:** `apps/web/src/app/components/pages/ReferencesPage.tsx`, `apps/web/src/app/components/dialogs/ReferenceImportDialog.tsx`
- **Mobil:** yok
- **İzin:** `brands.read` (oluştur/düzenle/sil: `companies.create/update/delete`) · departman: sales
- **Görünümler:**
  - Web: özet kartları (Teslim edilen, Firma, Şehir, Marka); Kart ve Tablo görünümleri (ViewToggle); kazanılan fırsat makinelerinden otomatik satırlar.
  - Mobil: yok
- **Alanlar/filtreler:**
  - Web tablo: No, Firma, İlgili, Konum, Marka, Model, Teslim.
  - Web form: Firma*, İlgili, İlçe, İl, Tezgah Markası, Tezgah Modeli, Teslim Tarihi, Notlar.
  - Web arama: firma, il, marka, model.
  - Mobil: yok
- **Aksiyonlar:**
  - `reference.list` ❌ · `reference.create` ❌ · `reference.update` ❌ · `reference.remove` ❌
  - `reference.importFile` ❌ (Excel ile Yükle)
- **Durum:** Yok
- **Eksikler:**
  - Referans ekranının tamamı (listeleme, arama, ekleme, düzenleme, silme, Excel içe aktarma).
  - (masaüstüne özgü, kapsam dışı: "references.view" localStorage görünüm tercihi)

### trade-fairs — Fuar
- **Web:** `apps/web/src/app/components/pages/TradeFairsPage.tsx`
- **Mobil:** yok
- **İzin:** `trade_fairs.read` (`trade_fairs.create/update/delete`) · departman: hepsi
- **Görünümler:**
  - Web: özet kartları (Fuar, Görüşme, Görüşülen kişi, Ekip); "Kim kaç kişiyle görüştü" kartı; görüşme tablosu (Daha fazla yükle); Görüşme Takibi diyaloğu; kayıt formu (fotoğraf ve dosya ekleri).
  - Mobil: yok
- **Alanlar/filtreler:**
  - Web filtre ve arama: fuar seçimi (sayaçlı); arama (firma, yetkili, telefon, il, ürün).
  - Web sütunlar: Firma/Yetkili, İletişim, Konum, Ürün, Görüşen, Takip (Görüşüldü / Teklif iletildi / Müşteriye dönüştü).
  - Web form: Fuar adı*, Firma*, Yetkili*, Görevi, Cep telefonu, E-posta, Ülke, İl, İlçe, Ürün kategorisi, Ürün tipi, Görüşen, Görüşülen kişi, Not, ekler.
  - Web takip formu: görüşme yolu, tarih, not.
  - Mobil: yok
- **Aksiyonlar:**
  - `tradeFair.list` ❌ · `tradeFair.summary` ❌ · `tradeFair.staff` ❌
  - `tradeFair.create` ❌ · `tradeFair.update` ❌ · `tradeFair.remove` ❌
  - `file.signedUpload` ❌ · `file.uploadBinary` ❌ · `file.link` ❌ · `file.links` ❌ · `file.remove` ❌
- **Durum:** Yok
- **Eksikler:**
  - Fuar ekranının tamamı (görüşme kaydı, takip işaretleme, ekip özeti, foto/dosya ekleri).
  - Sahada mobil kullanım için kritik bir boşluk.

### meta — Meta Merkezi
- **Web:** `apps/web/src/app/components/pages/meta/MetaPage.tsx` (+ `meta/` sekme bileşenleri), `apps/web/src/lib/meta-service.ts`
- **Mobil:** yok
- **İzin:** `meta.read` (veya `meta_campaigns.read` / `meta_messages.read`; yönetim: `meta.*`, `meta_campaigns.*`, `meta_messages.*`, `meta_audiences.*`, `meta_catalogs.*`) · departman: sales
- **Görünümler:**
  - Web sekmeleri: Genel bakış, Lead'ler, Kampanyalar, Mesajlar ve yorumlar, Otomasyonlar ve CAPI, Kitleler, Katalog, Bağlantılar ve sağlık.
  - Mobil: yok
- **Alanlar/filtreler:**
  - Web: bağlantı bazlı filtreleme (connectionId); genel bakış sayaçları (bağlantı, lead, bekleyen dönüşüm, toplam harcama).
  - Mobil: yok
- **Aksiyonlar** (meta-service kapsam JSON'unda yok; mobilde meta endpoint'i yok):
  - Genel/lead/içgörü: `overview` ❌ · `leads` ❌ · `insights` ❌
  - Kampanyalar: `campaigns` ❌ · `createCampaign` ❌ · `updateCampaign` ❌
  - Mesajlar ve yorumlar: `conversations` ❌ · `messages` ❌ · `sendMessage` ❌ · `comments` ❌ · `replyToComment` ❌ · `updateComment` ❌
  - Otomasyon ve CAPI: `formMappings` ❌ · `createFormMapping` ❌ · `updateFormMapping` ❌ · `conversions` ❌ · `createConversionEvent` ❌ · `processJobs` ❌
  - Kitleler: `audiences` ❌ · `createAudience` ❌ · `syncAudienceMembers` ❌ · `removeAudienceMembers` ❌ · `deleteAudience` ❌
  - Katalog: `catalogs` ❌ · `createCatalog` ❌ · `syncCatalog` ❌ · `syncCatalogProducts` ❌ · `deleteCatalogProducts` ❌ · `deleteCatalog` ❌
  - Bağlantılar: `connections` ❌ · `startOAuth` ❌ · `createConnection` ❌ · `updateConnection` ❌ · `verifyConnection` ❌ · `disconnectConnection` ❌ · `deleteConnection` ❌
- **Durum:** Yok
- **Eksikler:**
  - Meta Merkezi'nin tamamı (lead, kampanya, mesaj/yorum yanıtlama, otomasyon/CAPI, kitle, katalog, bağlantı yönetimi).

## Sayfalar — Finans ve operasyon

### payments — Ödemeler & Kasa
- **Web:** `apps/web/src/app/components/pages/payments/PaymentsPage.tsx` (KPI'lar, grafikler, tablo ve `PaymentDetailDialog`), `apps/web/src/app/components/dialogs/CreateDialogs.tsx` (`CreatePaymentDialog`), `apps/web/src/app/components/pages/finance/CreateAccountingInvoiceDialog.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/payments/index.tsx`, `payments/[id].tsx` (`FinanceRecordDetailScreen kind=payment`), `apps/mobile-v2/app/modal/payment.tsx` (`PaymentFormScreen`). Alacaklar mobilde ayrı modülde duruyor: `modules/receivables/*` ve `modal/new-receivable`.
- **İzin:** `payments.read` · departman: finance (mobilde departman filtresi yok; yalnızca izin ve tenant `hiddenNavigationKeys`)
- **Görünümler:**
  - Web: KPI şeridi (Alınan, Ödenen, Net Kasa, Bekleyen Tahsilat) ve para birimi bazında Kasa Bakiyesi kartları (FxRateBadge ile).
  - Web: Yaklaşan Vadeler kartı (60 gün, ilk 5), 6 aylık Tahsilat & Bekleyen trendi, Para Birimi Dağılımı pastası, Yaşlandırma, Günlük Nakit Akışı, En Yüksek Borçlular (mail/telefon butonlarıyla).
  - Web: "Kasa Hareketleri" tablosu (12'li sayfalama, USD toplam altbilgisi) ve detay diyaloğu.
  - Mobil: `/payments/summary` StatStrip'i (Gelen, Giden, Net), sonsuz kaydırmalı liste, detay ekranı ve oluşturma modalı.
- **Alanlar/filtreler:**
  - Web filtreleri: yön sekmeleri (Tümü/Alınan/Ödenen, sayılarla), durum sekmeleri (Tümü/Tahsil/Bekleyen/Gecikmiş), arama (firma, id, fatura no, not).
  - Web tablo kolonları: Firma, Yön, Fatura No, Tutar, Vade (gecikme günüyle), Ödeme Tarihi, Durum, Not.
  - Web veri: ödemeler ve alacaklar tek listede birleşiyor.
  - Mobil filtre: yalnızca yön çipleri (Tahsilat/Ödeme).
  - Mobil satır: firma, fatura/not, tarih, yöntem, durum çipi, tutar.
  - Mobil detay: firma, fatura no, ödeme aracı, yön, ödeme tarihi, oluşturulma, not. USD karşılığı ve kayıt tipi yok.
- **Aksiyonlar:**
  - finance.createPayment ✅
  - finance.createReceivable ✅ — web "giren" yönünde alacak+ödeme birlikte oluşturuyor; mobil ödeme formu doğrudan `companyId` ile ödeme açıyor.
  - finance.updatePaymentStatus ✅ — kısmi: web Pending/Paid/Overdue/Cancelled seçtiriyor, mobil yalnızca "Ödendi İşaretle" ve "Kaydı İptal Et".
  - finance.updateReceivableStatus ✅ (mobilde Tahsilatlar modülünde)
  - finance.updatePayment ❌ (tutar, tarih, yöntem, fatura no, not düzenleme)
  - finance.deletePayment ❌
  - finance.dueDates ✅ (mobilde ayrı modülde)
  - finance.createAccountingInvoice ❌ ("Muhasebe Faturası" butonu)
  - file.signedUpload / file.uploadBinary / file.link — yalnızca oluşturma formunda var ✅; mevcut kayda belge yükleme ❌
  - file.signedDownload — ilgili Fiş/Fatura listesi ve önizleme ❌
  - UI: Excel dışa aktarım `/exports/finance` ❌; mail/telefon kısayolu (En Yüksek Borçlular) ❌
- **Durum:** Eksik
- **Eksikler:**
  - Arama ve durum filtresi (Tahsil/Bekleyen/Gecikmiş) yok.
  - Kasa bakiyesi kartları, trend/pasta/nakit akışı grafikleri, yaşlandırma, en yüksek borçlular ve yaklaşan vadeler kartı yok.
  - Ödeme düzenleme ve silme yok.
  - Detayda Pending/Overdue durumuna çekme yok.
  - Mevcut kayda bağlı belge listesi, önizleme ve sonradan yükleme yok.
  - Muhasebe faturası oluşturma ve Excel dışa aktarımı yok.
  - Web listesi ödeme ile alacakları birleştiriyor; mobilde bunlar ayrı modüllerde.
  - (masaüstüne özgü, kapsam dışı: tablo sayfalaması ve hover aksiyonları)

### accounting-invoices — Muhasebe Faturaları
- **Web:** `apps/web/src/app/components/pages/finance/AccountingInvoicesPage.tsx`, `apps/web/src/app/components/pages/finance/CreateAccountingInvoiceDialog.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/invoices/index.tsx`, `invoices/[id].tsx`
- **İzin:** `accounting_invoices.read` · departman: finance, sales
- **Görünümler:**
  - Web: KPI (fatura sayısı, para birimi bazında toplam tutar, taksitli, firma sayısı), tablo, detay diyaloğu (vade durumu/plan kartları, taksit tablosu, kalem tablosu).
  - Mobil: liste ve detay (tutar/KDV/toplam, kalemler, taksitler, notlar).
- **Alanlar/filtreler:**
  - Web filtreleri: kategori sekmesi Ticari/İdari (`invoiceCategory`, sunucu tarafı), tür sekmesi Satış/Alış/Tümü, arama (fatura no/firma), Yenile, para birimi bazında toplamlar.
  - Web kolonları: Belge/Fatura No, Tür, Sınıf, Müşteri/Tedarikçi, Tarih, Tutar, Taksit, Vade/yaşlandırma rozeti.
  - Web detay: vergi dairesi/numarası, Matrah, Referans, Vade Notu ve diğerleri.
  - Mobil filtre: yalnızca Satış/Alış çipleri. Arama, kategori filtresi, "Tümü" seçeneği, KPI ve vade rozeti yok.
  - Mobil detay: kategori, ödeme tipi, vade, ilk/son vade, taksit, sipariş no, beklenen tarih, incoterm, sevkiyat referansı, KDV oranlı kalemler, durumlu taksitler, `termChangeReason`. Firma vergi bilgisi yok.
- **Aksiyonlar:**
  - finance.accountingInvoices ✅
  - finance.accountingInvoice ✅
  - finance.createAccountingInvoice ❌ ("Yeni Fatura")
  - finance.updateAccountingInvoice ❌ (Düzenle)
  - finance.deleteAccountingInvoice ❌ (Sil/Arşivle)
  - Yalnızca mobilde: `PATCH /accounting-invoices/:id/cancel` ("Faturayı İptal Et"), "Fatura Dosyasını Aç/Paylaş", Satış Siparişi/Teklif/Firma Kartı linkleri
  - UI: Yenile ✅ (mobilde pull-to-refresh)
- **Durum:** Eksik
- **Eksikler:**
  - Fatura oluşturma, düzenleme ve silme yok.
  - Ticari/İdari kategori filtresi, "Tümü" tür sekmesi ve arama yok.
  - KPI kartları ve para birimi bazında toplamlar yok.
  - Listede vade/yaşlandırma rozeti yok.
  - Detayda firma vergi dairesi/numarası ve Matrah/Referans/Vade Notu alanları yok.

### customer-balances — Cari Rapor
- **Web:** `apps/web/src/app/components/pages/finance/CustomerBalancesPage.tsx` (Cari Ekstre diyaloğu dahil)
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/balances/index.tsx`
- **İzin:** `receivables.read` · departman: finance
- **Görünümler:**
  - Web: KPI (Kayıtlı Firma, Açık Borç, Gecikmiş adet+tutar, 7 Gün İçinde), para birimi bazında net bakiye rozetleri, tablo, satıra tıklayınca Cari Ekstre diyaloğu (bakiyeler, yaşlandırma, hareket satırları).
  - Mobil: para birimi bazında alacak/borç/net StatStrip'i ve liste. Satıra dokunmak firma kartını açıyor.
- **Alanlar/filtreler:**
  - Web: arama. Kolonlar: Firma/PB, Satış, Tahsilat, Açık Borç, Net Bakiye, yaşlandırma ısı haritası, En Yakın Vade.
  - Web ekstre kolonları: Tarih, Açıklama, Fatura No, Borç, Alacak, PB, Bakiye.
  - Mobil: arama ve Alacaklı/Borçlu/Riskli çipleri. Satırda en yakın vade, yaşlandırma satırı, para birimi bazında satış/tahsilat ve bakiye var.
- **Aksiyonlar:**
  - finance.customerBalances ✅
  - finance.companyStatement ❌ (Cari Ekstre)
  - UI: Excel dışa aktarım `/exports/customer-balances` ❌; satır bazında Excel ekstre (exportService.customerStatement) ❌; PDF ekstre (exportService.customerStatementPdf) ❌; ekstre diyaloğundaki Excel/PDF ❌; Yenile ✅ (pull-to-refresh)
- **Durum:** Eksik
- **Eksikler:**
  - Cari ekstre görünümü yok.
  - Excel/PDF ekstre ve liste dışa aktarımı yok.
  - Gecikmiş ve 7 Gün İçinde KPI'ları yok.
  - Ayrı "Açık Borç" değeri ve yaşlandırma ısı haritası yok.

### due-dates — Vade Takvimi
- **Web:** `apps/web/src/app/components/pages/finance/DueDatesCalendarPage.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/due-dates/index.tsx`
- **İzin:** web `payments.read`, mobil `receivables.read` (uyumsuz) · departman: finance
- **Görünümler:**
  - Web: aylık takvim ızgarası (önceki/sonraki ay), gün hücresinde 2 kayıt + "+n" ve gecikme ikonu, seçili gün (yoksa önümüzdeki 7 gün) için yan ajanda, lejant.
  - Web KPI: Bu Ay Vade, Önümüzdeki 7 Gün, Tahsil, Ödeme (yalnız admin).
  - Mobil: güne göre gruplu SectionList, sabit −30/+90 gün penceresi. StatStrip: Geciken, Toplam vade, para birimi bazında tahsil/ödenecek.
- **Alanlar/filtreler:**
  - Web: aralık aktif ay. Admin olmayanlara "Ödeme" (alacak) kayıtları gizleniyor.
  - Mobil: Geciken/Tahsilat/Ödeme çipleri. Satırda firma, fatura no, tür, vade çipi, tutar. Ödeme kayıtları rol kısıtı olmadan herkese gösteriliyor.
- **Aksiyonlar:**
  - finance.dueDates ✅
  - Web'de başka aksiyon yok.
  - Yalnızca mobilde: satıra dokununca firma kartına gitme.
- **Durum:** Eksik
- **Eksikler:**
  - Aylık takvim görünümü ve ay gezintisi yok.
  - Seçili gün ajandası yok.
  - Admin olmayanlardan Ödeme kayıtlarını gizleme kuralı uygulanmıyor.
  - İzin anahtarı farklı: web `payments.read`, mobil `receivables.read`.

### products — Ürünler
- **Web:** `apps/web/src/app/components/pages/Operations.tsx` (`ProductsPage`), `apps/web/src/app/components/dialogs/ProductDetailDialog.tsx`, `ProductImportDialog.tsx`, `CreateDialogs.tsx` (`ProductDialog`), `apps/web/src/app/components/mail/CatalogMailButton.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/products/index.tsx`, `products/[id].tsx`, `apps/mobile-v2/app/modal/edit-product.tsx`
- **İzin:** `products.read` · departman: sales, service, stock
- **Görünümler:**
  - Web: KPI (Toplam Ürün, Kategori, Seri), kart ve liste görünümü (liste seriye göre gruplu).
  - Web detay diyaloğu: teknik bilgiler tablosu, opsiyon setleri, muadil ürünler, seçilebilir uyumlu opsiyonel donanım (toplamlarıyla), standart donanım, dokümanlar.
  - Mobil: liste ve sekmeli detay (Genel / Stoklar / Özellikler / Tedarikçiler).
- **Alanlar/filtreler:**
  - Web filtreleri: aile sekmeleri (sayılarla), arama (model, marka, seri, tip, kısa açıklama, stok kodu, kategori), taksonomi filtresi (Ürün Grubu/Kategori/Alt Kategori/Tipi), seri çipleri, A–Z sıralama.
  - Web kapsam: servis rolü yalnızca yedek parça/işçilik görüyor; aktif bölüme göre süzme var.
  - Web kart: görsel, liste ve peşin fiyat.
  - Mobil: sunucu araması ve kategori çipleri. Satırda fullName, model kodu, marka·kategori, stok kodu, liste fiyatı.
  - Mobil detay: görsel, barkod, liste/peşin, KDV, menşe, GTIP, broşür/doküman linkleri, stoklar, tedarikçiler.
- **Aksiyonlar:**
  - product.list ✅, product.get ✅
  - product.update ✅ — kısmi: mobil formunda para birimi, muadil, spec ve donanım düzenleme yok.
  - product.options ✅, product.media ✅, product.compatibleOptionalEquipment ✅
  - product.create ❌ ("Yeni Ürün")
  - product.listBrands ❌
  - product.replaceDetails ❌
  - product.remove ❌
  - product.previewImport ❌, product.commitImport ❌ (İçe Aktar)
  - product.specTemplates ❌
  - product.equipment ❌ — mobilde donanım veri olarak gösteriliyor
  - UI: içe aktarma şablonu indirme (exportService.productImportTemplate) ❌; Genel Kataloglar mail (CatalogMailButton) ❌; PDF Oluştur (teknik doküman yazdırma) ❌; Teknik Bilgileri Mail Gönder ❌; opsiyonel donanım seçimi/toplamı ❌
- **Durum:** Eksik
- **Eksikler:**
  - Ürün oluşturma, silme ve toplu içe aktarma yok.
  - Katalog maili, teknik bilgi maili ve PDF teknik doküman yok.
  - Taksonomi ve seri filtreleri yok; KPI yok; listede görsel ve peşin fiyat yok.
  - Düzenlemede para birimi, muadil ürün, teknik özellik ve donanım alanları yok.
  - Opsiyonel donanım seçip toplam hesaplama yok.
  - Servis rolü/bölüm kapsamı istemci tarafında uygulanmıyor.
  - (masaüstüne özgü, kapsam dışı: kart/liste görünüm tercihinin localStorage `products.view` ile saklanması)

### stock — Stok
- **Web:** `apps/web/src/app/components/pages/stock/StockPage.tsx`, `apps/web/src/app/components/dialogs/CreateDialogs.tsx` (`CreateStockDialog`, `EditStockDialog`)
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/inventory/index.tsx`, `inventory/[id].tsx`, `inventory/scan.tsx`
- **İzin:** `inventory.read` · departman: stock
- **Görünümler:**
  - Web: kategori sekmeleri (Tüm Stok, TEZGAH, OPSIYONEL_DONANIM, AKSESUAR, YEDEK_PARCA, EVRAK, IDARI_MALZEME).
  - Web KPI (tıklanabilir): Hazır, Rezerve, Satılan, Pasif. Ayrıca Kritik Makine Stoku kartı (≤ 2), Depo Bazında Stok, Marka Dağılımı pastası.
  - Web tablo: satır genişletilince bağlı opsiyonel donanım görünüyor.
  - Mobil: liste, sekmeli detay (Genel / Rezervasyon) ve QR/barkod tarama (yalnızca mobilde).
- **Alanlar/filtreler:**
  - Web filtreleri: durum sekmeleri (Tümü/Hazır/Rezerve/Yolda/Satılan/Pasif), arama (ad, seri, stok kodu, model, marka, rezerve firma).
  - Web kolonları: Marka, Kondisyon, Ürün Adı, Seri No, Kontrol Ünitesi, Fener Mili Devri, Takım Adeti, Motor Gücü, Konum, Rezerve Firma, Yükleme/Geliş tarihleri, Durum.
  - Mobil: arama ve durum çipleri (lookup). Detayda model/stok kodu, marka, kategori, depo, kondisyon, konum/stok durumu, kontrol ünitesi/SN, tarihler, not, Ürün Kartı linki.
- **Aksiyonlar:**
  - inventory.list ✅, inventory.get ✅
  - inventory.reserve ✅ — kısmi: mobil yalnızca müsait stokta rezerve ediyor; rezerve firmayı değiştirme yok.
  - Rezervasyonu kaldır ✅
  - inventory.update (durum değiştirme) ✅
  - inventory.update (alan düzenleme, `EditStockDialog`) ❌
  - inventory.create ❌ ("Yeni Stok")
  - inventory.listWarehouses ✅
  - UI: Excel dışa aktarım `/exports/inventory` ❌
- **Durum:** Eksik
- **Eksikler:**
  - Stok oluşturma ve alan düzenleme yok.
  - Rezerve firmayı değiştirme yok.
  - Kategori sekmeleri, KPI, kritik stok, depo ve marka dağılımı yok.
  - Teknik özellik kolonları (fener mili, takım adeti, motor gücü) ve bağlı opsiyonel donanım yok.
  - Excel dışa aktarımı yok.
  - Mobil durum listesinde satıldı/hasarlı da var; web "Satılan"ı yalnızca fatura üzerinden yapıyor (kural farkı).

### shipments — Sevkiyat & Lojistik
- **Web:** `apps/web/src/app/components/pages/logistics/ShipmentsPage.tsx`, `apps/web/src/app/components/dialogs/CreateDialogs.tsx` (`CreateShipmentDialog`), `apps/web/src/app/components/dialogs/CargoLabelDialog.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/shipments/index.tsx`, `shipments/[id].tsx`
- **İzin:** `shipments.read` · departman: stock
- **Görünümler:**
  - Web: KPI (Toplam/Yolda/Gümrükte/Teslim, tıklanınca filtreliyor), 4 adımlı rota ilerlemesi olan tablo, Lojistik Ağı (taşıyıcı payları) kartı.
  - Mobil: Hazırlanıyor/Yolda/Teslim bölümlü liste. Detayda takip adımları, kalemler, Firma Kartı.
- **Alanlar/filtreler:**
  - Web: yön seçimi (Tüm/Gelen/Giden). Kolonlar: takip no/taşıyıcı, Yön, Firma, Rota, ETA rozeti, durum seçimi.
  - Mobil: filtre/arama yok. Satırda sevkiyat no, firma, rota, taşıyıcı, durum, ETA/varış.
  - Mobil detay: taşıyıcı, gönderen, takip no, taşıma şekli, varış deposu, ETA, not.
- **Aksiyonlar:**
  - service.shipments ✅, service.shipment ✅
  - service.startShipment ✅
  - service.updateShipmentStatus ✅ — mobil yalnızca ileri yönde ilerletiyor ve "cleared" durumu ekliyor; gelen sevkiyatta deposuz teslimi engelliyor.
  - service.createShipment ❌ ("Yeni Sevkiyat")
  - service.shipmentCompanyOptions ❌
  - service.deleteShipment ❌
  - UI: kargo etiketi yazdırma (PrintCargoLabelDialog / printCargoLabelForCustomer) ❌; Sevk İrsaliyesi yazdırma ❌; Excel dışa aktarım `/exports/shipments` ❌
- **Durum:** Eksik
- **Eksikler:**
  - Sevkiyat oluşturma ve silme yok.
  - Kargo etiketi ve irsaliye yazdırma yok.
  - Excel dışa aktarımı yok.
  - Yön filtresi ve KPI filtreleri yok; Gümrükte ayrı bölüm olarak gösterilmiyor.
  - Lojistik Ağı kartı ve ETA gecikme rozeti yok.

### installations + deliveries — Kurulumlar
- **Web:** `apps/web/src/app/components/pages/logistics/InstallationsPage.tsx` (`InstallationsPage`, `InstallationFormDialog`), `apps/web/src/app/components/pages/logistics/DeliveriesPage.tsx` (eski kayıtlar için yalnızca `DeliveryDetailDialog` kullanılıyor), `apps/web/src/app/components/dialogs/CreateDialogs.tsx` (`CreateInstallationDialog`). `deliveries` NavKey'i de `InstallationsPage`'i render ediyor.
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/installations/index.tsx`, `installations/[id].tsx`, `apps/mobile-v2/app/modal/installation-completion.tsx`. Deliveries için mobil `yok`.
- **İzin:** installations `installations.read`; deliveries için `RESOURCE_BY_NAV` kaydı yok (herkese açık, veri için `shipments.read` gerekiyor) · departman: installations service, deliveries hepsi (`NAV_ROLES` kaydı yok)
- **Görünümler:**
  - Web: KPI (Toplam, Planlı, Tamamlandı, Kurulum Tutanağı), Açık / Teslim Edildi / Kurulum Tutanakları sekmeleri, 5 adımlı yolculuk tablosu, Yaklaşan Ziyaretler kartı, eski "Aktarılan Kurulum Tutanakları" tablosu, tam tutanak formu diyaloğu.
  - Mobil: liste (4 adımlı ilerleme), detay (cihaz, teknik özellik, notlar), tamamlama modalı.
- **Alanlar/filtreler:**
  - Web kolonları: Makine/Müşteri (görsel, seri), Teknisyen/Tarih, yolculuk, Konum tipi/Süre, Durum.
  - Web form: form no, tarihler, tezgah marka/tip/model/seri, CNC marka/model/seri/ana yazılım, kullanıcı firma/ilgili/telefon/adres/faks/GSM/e-posta, kontroller (durum + not), problem, açıklama, yapılan işlem, kurulumu yapan, teslim alan.
  - Mobil: arama ve Planlandı/Devam Ediyor/Tamamlandı çipleri.
  - Mobil tamamlama formu: tarih, kurulumu yapan, teslim alan, kontroller (yapıldı/yapılmadı; kontrol başına not yok), problem, not. Tezgah/CNC/kullanıcı alanları cihaz verisinden otomatik dolduruluyor ve düzenlenemiyor.
- **Aksiyonlar:**
  - service.installations ✅
  - service.updateInstallationStatus ✅ (Kaydet ve Tamamla)
  - service.createInstallation ❌ ("Yeni Kurulum")
  - service.updateInstallation ❌ (tamamlamadan form kaydetme; tamamlanmış formu düzenleme)
  - service.deleteInstallation ❌
  - service.deliveries ❌ (eski tutanak listesi)
  - service.updateDelivery ❌ (`DeliveryDetailDialog` Kaydet)
  - Yalnızca mobilde: Kurulumu Başlat (in_progress), Kurulumu İptal Et, Makine/Teklif/Fırsat/Firma linkleri
  - UI: kurulum tutanağı Yazdır/PDF ❌; eski teslim formu Formu Yazdır ❌
- **Durum:** Eksik
- **Eksikler:**
  - Kurulum oluşturma ve silme yok.
  - Tutanağı tamamlamadan kaydetme ve tamamlandıktan sonra düzenleme yok.
  - Formda tezgah/CNC/kullanıcı alanları düzenlenemiyor; kontrol başına not yok.
  - Tutanak yazdırma/PDF yok.
  - Kurulum Tutanakları sekmesi, KPI ve Yaklaşan Ziyaretler yok.
  - Eski teslimat (deliveries) kayıtlarını listeleme, görüntüleme, kaydetme ve yazdırma tamamen yok.

### purchase-orders — (TITLES'ta yok; sayfa App.tsx'te render edilmiyor)
- **Web:** `apps/web/src/app/components/pages/purchase/PurchaseOrdersPage.tsx` (`PurchaseOrderDetailDialog` ve `CreatePurchaseOrderDialog` dahil). Bileşen yalnızca `SimplePages.tsx` içinden yeniden export ediliyor; `purchase-orders` NavKey'i için switch case yok.
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/purchase-orders/index.tsx`, `purchase-orders/[id].tsx` (`apps/mobile-v2/src/features/order-detail-screen.tsx`, `kind="purchase"`)
- **İzin:** `purchase_orders.read` · departman: hepsi (`NAV_ROLES` kaydı yok)
- **Görünümler:**
  - Web: KPI (Toplam Sipariş + USD toplam, Ticari, İdari, Bekleyen), Tedarikçi İçgörüsü kartları (ilk 4; sipariş sayısı ve açık teslim), tablo.
  - Web detay diyaloğu: Tutar, Kalem, ETA, Ödeme; Tedarikçi ve Onay Akışı kartları; kalem tablosu.
  - Mobil: liste ve detay (ara toplam/indirim/KDV/genel toplam, tür, ödeme, vade, fatura no, beklenen tarih, incoterm, referans, gönderim/onay/teslim zamanları, kalemler, onay gerekçesi, not).
- **Alanlar/filtreler:**
  - Web: durum sekmeleri (Tümü/Taslak/Gönderilen/Onay/Onaylı/Teslim), arama (PO no, fatura no, tedarikçi; istemci tarafı).
  - Web kolonları: Tedarikçi, Tip, Ödeme, Sipariş, Fatura No, Tarih, ETA (gecikme/kalan gün rozetiyle), KDV, Tutar, 5 adımlı durum yolculuğu, onay gerekçesi.
  - Mobil: sunucu araması ve yüklenen kayıtlardan türetilen durum çipleri. Satırda sipariş no, tedarikçi, tarih, beklenen tarih veya fatura no, durum, tutar.
- **Aksiyonlar:**
  - purchaseOrder.list ✅, purchaseOrder.get ✅
  - purchaseOrder.send ✅ ("Tedarikçiye Gönder")
  - purchaseOrder.approve ✅ (yalnız super_admin; mobilde ek olarak `purchase_orders.approve` izni gerekiyor)
  - purchaseOrder.setStatus received ✅, cancelled ✅
  - Yalnızca mobilde: setStatus in_transit ("Yola Çıktı")
  - purchaseOrder.create ❌ ("Yeni Sipariş": tip, firma, ödeme tipi, fatura no, sipariş no, para birimi, tarihler, yeni/önceki vade, incoterm/idari kategori, referans, vade notu, not)
  - purchaseOrder.addItem ❌ (kalem ekleme: ürün, açıklama, adet, liste/olur fiyatı, indirim, KDV, ETA)
  - purchaseOrder.remove ❌ (oluşturma hatasında geri alma)
  - product.list ❌ (kalemde ürün seçimi)
  - finance.createAccountingInvoice ❌ ("Alış Faturası" ön dolumlu)
  - UI: Excel dışa aktarım `/exports/purchase-orders` ❌
- **Durum:** Eksik
- **Eksikler:**
  - Satın alma siparişi oluşturma ve kalem ekleme yok.
  - Siparişten alış faturası oluşturma yok.
  - Excel dışa aktarımı yok.
  - KPI ve Tedarikçi İçgörüsü yok.
  - Listede ETA gecikme rozeti ve durum yolculuğu yok.
  - Web sayfası şu an menüden erişilemiyor (render edilmiyor); parite bu bileşene göre değerlendirildi.

### sales-orders — (web'de NavKey/sayfa yok; `OffersPage` içinde "Satış Siparişleri" kartı)
- **Web:** `apps/web/src/app/components/pages/offers/OffersPage.tsx` (Satış Siparişleri kartı ve teklif detayında `createFromQuote`), `apps/web/src/app/components/pages/CustomerDetail.tsx` (firma bazında `salesOrderService.list`)
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/sales-orders/index.tsx`, `sales-orders/[id].tsx` (`apps/mobile-v2/src/features/order-detail-screen.tsx`, `kind="sales"`); teklif detayından siparişe çevirme `apps/mobile-v2/app/(tabs)/modules/quotes/[id].tsx` içinde
- **İzin:** web `offers` sayfası izni (ayrı sales-orders NavKey'i yok); mobil `sales_orders.read` · departman: web'de teklif sayfasının departmanları, mobilde filtre yok
- **Görünümler:**
  - Web: son 20 siparişin tablosu (detay görünümü yok).
  - Mobil: ayrı liste ve detay (tutar dökümü, onay/rezervasyon/tamamlanma/iptal zamanları, KDV oranlı kalemler, not, Firma Kartı).
- **Alanlar/filtreler:**
  - Web kolonları: Sipariş (teklif bağlantılı/manuel), Müşteri, Ürün Adı, Tarih, Tutar, Durum. Filtre/arama yok.
  - Mobil: arama (sipariş no/firma) ve durum çipleri. Satırda firma, rezervasyonlu/stoktan, tarih, durum, tutar.
- **Aksiyonlar:**
  - salesOrder.list ✅
  - salesOrder.createFromQuote ✅
  - finance.createAccountingInvoice ❌ (satırdaki "Muhasebe Faturası", ön dolumlu)
  - Web'de kullanılmayan, mobilde fazladan olanlar: salesOrder.get, approve, reserve, setStatus (fulfilled/cancelled)
  - UI: web'de dışa aktarım/yazdırma yok
- **Durum:** Eksik
- **Eksikler:**
  - Siparişten muhasebe faturası oluşturma yok.
  - Web'de ürün adı kolonu var; mobil listede yok.

## Sayfalar — Servis, raporlar ve yönetim

### machines — Makineler / Varlıklar
- **Web:** `apps/web/src/app/components/pages/machines/MachinesPage.tsx`, `apps/web/src/app/components/pages/machines/MaintenancePlanPanel.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/customer-devices/index.tsx`, `apps/mobile-v2/app/(tabs)/modules/customer-devices/[id].tsx`, `apps/mobile-v2/app/(tabs)/modules/maintenance-plans/index.tsx`, `apps/mobile-v2/app/(tabs)/modules/maintenance-plans/[id].tsx`
- **İzin:** `customer_devices.read` · departman: service, stock
- **Görünümler:**
  - web:
    - garanti istatistik şeridi (aktif / 60 gün içinde bitecek / bitmiş / bilinmiyor)
    - kart ve tablo görünümü (geçişli)
    - detay diyaloğu: bakım planı paneli ve servis geçmişi
    - QR etiket diyaloğu
  - mobil:
    - "Makine Parkı" listesi
    - makine detay ekranı (bakım planları listesi dahil)
    - ayrı bakım planı listesi ("Yaklaşanlar" filtresi) ve bakım planı detayı
- **Alanlar/filtreler:**
  - web:
    - arama: model, seri no, kontrol ünitesi, kontrol ünitesi seri no, kullanıcı firma
    - tablo kolonları: Makine, Kullanıcı Firma, İlk Müşteri, Kontrol Paneli, Peşin Fiyat, Kurulum, Garanti, Servis Sayısı, Durum
    - detay: durum, garanti, servis sayısı, kurulum tarihi, makine tipi, peşin fiyat, kontrol paneli ve seri no
    - servis geçmişi: tür, tarih, aşama
  - mobil:
    - sunucu araması (seri no, model, firma)
    - hazır filtre çipleri: Garantide / Garanti Bitti
    - liste satırı: model, SN, firma, marka·tip, kurulum ve garanti tarihleri, garanti çipi
    - detay: model, marka, ürün tipi, kontrol ünitesi ve seri no, liste ve peşin fiyat, satış/teslim/kurulum tarihleri, garanti başlangıç/bitiş, teknik özellikler, notlar
    - detaydan stok kaydı, teklif, fırsat ve firma bağlantıları
- **Aksiyonlar:**
  - `inventory.customerDevices` ✅
  - `inventory.createCustomerDevice` (Yeni Makine: Firma, Kontak, Stok/Seri No, Teknik Bilgiler) ❌
  - `inventory.updateCustomerDevice` ✅ — Kullanıcı firma değiştirme. Mobil sadece firma değiştiriyor; kontak seçimi ❌
  - `inventory.deleteCustomerDevice` ✅
  - `service.createTicket` (detaydan, makine ön seçili "Servis talebi aç") ❌ — mobilde makineden talep açma yok
  - `service.maintenancePlans` ✅
  - `service.createMaintenancePlan` ✅
  - `service.completeMaintenancePlan` ✅
  - `service.deleteMaintenancePlan` ❌
  - QR etiket oluştur ve yazdır (UI) ❌
- **Durum:** Eksik
- **Eksikler:**
  - Garanti istatistik şeridi yok.
  - Makine oluşturma yok.
  - Detayda servis geçmişi listesi ve servis sayısı yok.
  - Listede ilk müşteri, kontrol paneli, peşin fiyat ve durum yok.
  - Firma değişikliğinde kontak seçimi yok.
  - Makineden servis talebi açılamıyor.
  - Bakım planı silinemiyor.
  - QR etiketi oluşturulamıyor ve yazdırılamıyor.
  - (masaüstüne özgü, kapsam dışı: kart/tablo görünüm tercihinin localStorage'da saklanması)

### service-requests — Servis Talepleri
- **Web:** `apps/web/src/app/components/pages/service/ServicePages.tsx`, `apps/web/src/app/components/KanbanCardAttachments.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/service-tickets/index.tsx`, `apps/mobile-v2/app/(tabs)/modules/service-tickets/[id].tsx`, `apps/mobile-v2/app/(tabs)/modules/service-complaints/index.tsx`, `apps/mobile-v2/app/(tabs)/modules/service-complaints/[id].tsx`, `apps/mobile-v2/app/modal/new-ticket.tsx`
- **İzin:** `service_tickets.read` · departman: service
- **Görünümler:**
  - web:
    - KPI kartları: Açık, Kritik/Yüksek, SLA Aşımı, Atanmış
    - sekmeler: Liste / Şikayet Kutusu (Gelen Şikayetler + Public Linkler) / Servis Geçmişi (kapalı talepler)
    - detay diyaloğu, aşama yolculuğu çubuğu ile
    - detay sekmeleri: Özet, Servis Teklifi, Makine Dosyası, Garanti/RMA, Müşteri İletişim, Not Geçmişi, Aktivite Geçmişi, Ücret, Tamamlanma Formu
  - mobil:
    - talep listesi ve kanban görünümü
    - talep detayı, sekmeler: Genel, İşlemler, Parçalar, Notlar, Garanti
    - "Gelen Şikayetler" listesi ve şikayet detayı
    - yeni talep modalı
- **Alanlar/filtreler:**
  - web:
    - liste filtreleri: Kayıt Tipi, Kaynak, Garanti durumu
    - liste kolonları: Talep/Firma, Makine, Öncelik/SLA, Sorumlu, Sonraki Adım, Aşama, Açılış
    - şikayet filtreleri: Durum, Kaynak, Öncelik
    - şikayet kolonları: Kayıt, Firma, Makine, Kaynak, Durum, Öncelik, Konu, İletişim
    - geçmiş araması: firma, makine, form no, not
    - yeni talep: Firma*, Makine, İlgili Kişi, Atanan Servis Personeli, Kayıt Tipi*, Arıza/Talep Açıklaması, Servis Notu
  - mobil:
    - hazır filtreler: Açık / Devam Eden / Tamamlanan
    - ciddiyet filtresi, yeni/eski sıralama, sunucu araması
    - liste satırı: ticketNo, ciddiyet, faz, firma, konu, tarih. Konum metni sabit "İstanbul, Türkiye" yazıyor.
    - şikayetler: arama ve durum çipleri (new / reviewing / converted / rejected)
    - yeni talep: Firma*, Tür, Ciddiyet, Konu*, Açıklama
- **Aksiyonlar:**
  - `service.tickets` ✅
  - `service.createTicket` ✅ — mobilde makine, ilgili kişi, atanan personel ve servis notu yok
  - `service.update` ✅ — web'de kayıt tipi ve ücret değişikliği; mobilde çözüm notu ve teknisyen ataması
  - `service.updateTicketStatus` ✅
  - `service.deleteTicket` ✅
  - Not ekle / düzenle / sil (Not Geçmişi) ❌ — mobilde not geçmişi salt okunur
  - Şikayet notu ekleme ❌
  - Saha zamanlayıcısı (başlat / duraklat / durdur) ❌
  - Manuel işlem ve ücret girişi (saat ücreti, döviz) ❌
  - Tamamlanma formu (doldur, kaydet, kapat) ❌ — mobilde yalnızca "Talebi Tamamla" (durum değişikliği) var
  - Servis teklifi editörü ❌
  - `noteTemplate.*` ❌
  - `inventory.consumeServiceParts` ❌
  - `service.warranty` ✅
  - `service.updateWarranty` ✅ — mobilde yalnız değerlendirme alanları, RMA ve tedarikçi. Maliyet ve durum alanları ❌
  - `service.updateWarrantyParts` ✅ — uç tanımlı ama hiçbir ekran kullanmıyor; mobilde parçalar salt okunur
  - `service.submitWarranty` ✅
  - `service.approveWarranty` / `service.rejectWarranty` ❌ — mobil `/warranty/approved|rejected` yolunu çağırıyor; API'de yalnızca `/warranty/approve` ve `/warranty/reject` var
  - `service.complaints` ✅
  - `service.updateComplaint` ✅ — mobilde yalnız "İncelemeye Al". Konu, firma, makine, öncelik, kayıt tipi ve açıklama düzenleme ❌
  - `service.convertComplaint` ✅
  - `service.rejectComplaint` ✅
  - `service.createComplaint` (dahili şikayet) ❌
  - `service.complaintLinks` ❌
  - `service.createComplaintLink` ❌
  - `service.rotateComplaintLink` ❌
  - `service.revokeComplaintLink` ❌
  - Kanıt yükleme: `file.signedUpload` ✅ / `file.uploadBinary` ❌ / `file.link` ✅ — şikayet ve talep ekranlarında yükleme UI'ı ❌. Mobil şikayet eklerini yalnızca açıyor/paylaşıyor ✅
  - Servis Formu PDF (`service.openServiceFormPdf`) ✅ — mobilde paylaşım ile
  - Servis Teklifi yazdır ❌
  - Excel dışa aktarma (`/exports/service-tickets`, `exportService.serviceComplaints`) ❌
  - Haritada konum aç ❌
  - Müşteriyi ara / Planla (sadece mobil) ✅
- **Durum:** Eksik
- **Eksikler:**
  - Mobil garanti onay/ret istekleri API'de karşılığı olmayan yola gidiyor; bu akış mobilde çalışmıyor.
  - KPI kartları yok.
  - Servis Geçmişi sekmesi ve geçmiş araması yok.
  - Web filtreleri (kayıt tipi, kaynak, garanti) yok.
  - Detayda Servis Teklifi, Makine Dosyası, Müşteri İletişim, Aktivite Geçmişi, Ücret ve Tamamlanma Formu sekmeleri yok.
  - Talep ekleri yok.
  - Not CRUD, zamanlayıcı, parça tüketimi, garanti maliyet/durum/parça düzenleme yok.
  - Şikayet alanları düzenlenemiyor; kanıt yüklenemiyor.
  - Dahili şikayet oluşturma ve public link yönetimi yok.
  - Excel dışa aktarma, teklif yazdırma ve harita yok.
  - Yeni talep formunda makine, ilgili kişi, personel ve servis notu alanları yok.
  - Liste konumu sabit metin.
  - (masaüstüne özgü, kapsam dışı: tablo yoğunluğu ve klavye kısayolları)

### service-kanban — Servis Kanban
- **Web:** `apps/web/src/app/components/pages/service/ServicePages.tsx` (`ServiceKanbanPage` → `ServiceRequestsPage` kanbanOnly), `apps/web/src/app/components/KanbanCardAttachments.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/service-tickets/index.tsx` (board modu)
- **İzin:** `service_tickets.read` · departman: service
- **Görünümler:**
  - web:
    - 6 kolon: Servis Talep, Müşteri İletişim, Servis Teklifi, Bakım/Onarım & Yedek Parça, Servis Devam Ediyor, Servis Tamamlandı Formu
    - kolon altında ortalama yaş ve SLA aşımı
    - kart ekleri ve ek önizleme
    - başlıkta "Yeni Talep"
  - mobil:
    - `TICKET_PHASES` kaynaklı 4 fazlı salt okunur board
    - kolon sayaçları ve "daha fazla yükle"
- **Alanlar/filtreler:**
  - web: kayıt tipi, kaynak ve garanti filtreleri; kartlarda firma, makine, öncelik/SLA, sorumlu, ekler
  - mobil: board modunda yalnızca arama. Liste/kanban geçişi yalnızca liste modundaki filtre panelinde olduğu için board'dan listeye dönüş kontrolü yok.
- **Aksiyonlar:**
  - `service.updateTicketStatus` (sürükle-bırak / "Aşamaya gönder") ✅ uç var, board'dan taşıma ❌
  - `service.createTicket` (Yeni Talep) ✅
  - `service.deleteTicket` (kart menüsü) ✅ — yalnız detaydan
  - Kart eki yükleme: `file.signedUpload` ✅ / `file.uploadBinary` ❌ / `file.link` ✅ — UI ❌
  - Ek önizleme ❌
- **Durum:** Eksik
- **Eksikler:**
  - Kolon seti farklı (6 aşamaya karşı 4 faz).
  - Kartlar kolonlar arasında taşınamıyor.
  - Kolon yaş/SLA istatistikleri yok.
  - Kart ekleri yok.
  - Filtreler yok.
  - Board'dan liste moduna dönüş kontrolü yok.
  - (masaüstüne özgü, kapsam dışı: sürükle-bırak)

### service-price-list — Servis Fiyat Listesi
- **Web:** `apps/web/src/app/components/pages/PriceLists.tsx` (`ServicePriceListPage`)
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/price-lists/index.tsx` (genel "Fiyat Listeleri"; katalog navKey'i `sales-price-list`)
- **İzin:** `price_lists.read` · departman: service
- **Görünümler:**
  - web:
    - kategori sekmeleri ve sayaçlar: Yedek Parça / Aksesuar / Opsiyonel Donanım / İşçilik
    - KPI'lar: toplam kalem, kategori, görünen, liste kodu/döviz
    - tablo ve ürün detay diyaloğu
  - mobil: liste çipleri, istatistikler, kalem listesi, düzenleme bottom sheet'i
- **Alanlar/filtreler:**
  - web:
    - fiyat listesi seçimi ve arama
    - kolonlar: stok kodu, açıklama, marka, menşei, Uyumluluk, Peşin, Liste Fiyatı
    - işçilik görünümünde: Birim Ücret, KDV
  - mobil: liste seçimi, arama; satırda liste, peşin ve kampanya fiyatı
- **Aksiyonlar:**
  - `product.listPriceLists` ✅
  - `product.listPriceListItems` ✅
  - `product.updatePriceListItem` (satır içi fiyat düzenleme) ✅
  - `product.createPriceListItem` (listede olmayan kalem için) ❌
  - Ürün detay diyaloğu ❌
  - Ürün düzenleme (`product.update`, ProductDialog) ❌
- **Durum:** Eksik
- **Eksikler:**
  - Servise özel kategori sekmeleri ve İşçilik görünümü yok.
  - Uyumluluk, marka, stok kodu, menşei ve KDV bilgisi yok.
  - Yeni fiyat kalemi oluşturulamıyor.
  - Ürün detay ve düzenleme yok.
  - Mobil modül servis yerine satış fiyat listesi navKey'ine bağlı.

### reports — Raporlar
- **Web:** `apps/web/src/app/components/pages/reports/ReportsPage.tsx`, `apps/web/src/app/components/pages/reports/OperationalReport.tsx`, `apps/web/src/app/components/pages/reports/TargetPerformanceReport.tsx`, `apps/web/src/app/components/pages/reports/ActivityLogReportCard.tsx`, `apps/web/src/app/components/reports/ReportAnalyticsHub.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/modules/reports/index.tsx`
- **İzin:** `reports.read` · departman: hepsi
- **Görünümler:**
  - web:
    - modlar: Operasyonel, Karlılık (Yıl Sonu), Hedef Takibi, Analitik & Excel
    - yönetici özeti: riskler, fırsatlar, aksiyonlar, trendler, KPI kaynakları, drill-down
    - haftalık aktivite/teklif raporu kartı
  - mobil: tek ekran
    - metrikler: açık fırsat, stok kalemi, döviz bazında alacak/borç
    - grafikler: pipeline bar, 6 aylık tahsilat trendi, servis özeti donut, stok pasta
- **Alanlar/filtreler:**
  - web:
    - Operasyonel: aylık/yıllık dönem, yıl, Temsilci, departman. Detay tablosu: Ay/Yıl, Teklif, Onaylanan, Reddedilen, Kazanılan, Kaybedilen, Servis, Ciro USD
    - Yıl Sonu: yıl seçimi, kayıp/kazanç nedenleri, rakipler, temsilci bazında
    - Hedef Takibi: departman filtresi, departman ve kişi bazında
    - Aktivite raporu: tarih aralığı
    - Analitik: departman filtresi
  - mobil: filtre yok
- **Aksiyonlar:**
  - `report.operational` ❌
  - `report.yearEnd` ❌
  - `report.targetProgress` ❌ (mobilde çağrı yok)
  - `report.activityLog` ❌ (mobilde çağrı yok)
  - `report.departmentPerformance` ❌
  - `report.monthlyActivities` ❌
  - `report.warrantyExpiring` ❌
  - `report.monthlyQuotes` ❌
  - `report.pipelineSummary` ✅
  - `report.stockSummary` ✅
  - `report.serviceComplaintsSummary` ✅
  - Excel dışa aktarma (operational, year-end, target-progress, department-performance, pipeline-summary, stock-summary, deliveries, shipments, service-tickets, service-complaints) ❌
  - Yazdır/PDF ❌
- **Durum:** Eksik
- **Eksikler:**
  - Operasyonel, Yıl Sonu, Hedef Takibi ve Analitik modları yok.
  - Yönetici özeti ve drill-down yok.
  - Aktivite raporu yok.
  - Dönem, yıl, temsilci ve departman filtreleri yok.
  - Excel ve yazdırma yok.

### users — Kullanıcılar
- **Web:** `apps/web/src/app/components/pages/admin/UsersPage.tsx`, `apps/web/src/app/components/admin/UserAdminDialogs.tsx`
- **Mobil:** yok (yalnız kendi profilini salt okunur gösteren `apps/mobile-v2/app/(tabs)/more/profile.tsx`)
- **İzin:** `users.read` · departman: hepsi (yönetim menüsü; yalnız admin/super_admin)
- **Görünümler:**
  - web: KPI'lar (toplam, aktif, kilitli), kullanıcı tablosu, kilitli hesaplar paneli, oluşturma/düzenleme/hedef diyalogları
  - mobil: yok
- **Alanlar/filtreler:**
  - web:
    - arama: ad, e-posta, rol, ekip
    - durum filtresi: tümü / aktif / pasif / kilitli
    - hedef dönemi (ay)
    - kolonlar: Kullanıcı Kimliği, Rol, Departman, Bölüm, Hedef, Limitler (USD), Yönetici, Durum
  - mobil: yok
- **Aksiyonlar:**
  - `admin.users` ❌
  - `admin.roles` ❌
  - `admin.departments` ❌
  - `admin.divisions` ❌
  - `admin.createUser` ❌
  - `admin.updateUser` (departman, bölümler, erişim kapsamı, ünvan, roller, limit, yönetici, aktif anahtarı) ❌
  - `admin.userTargets` ❌
  - `admin.saveUserTarget` ❌
  - `admin.unlockUser` ❌
  - `admin.deleteUser` ❌
- **Durum:** Yok
- **Eksikler:**
  - Kullanıcı yönetimi mobilde hiç yok: liste, oluşturma, düzenleme, rol ve limit atama, hedef, kilit açma, silme.

### roles — Roller & Yetkiler
- **Web:** `apps/web/src/app/components/pages/admin/RolesPage.tsx`
- **Mobil:** yok
- **İzin:** `roles.read` · departman: hepsi (yönetim menüsü; yalnız admin/super_admin)
- **Görünümler:**
  - web: aranabilir rol listesi (sistem rolü rozeti); seçili rol için açıklama, yetki matrisi ve kaydetme; yeni rol diyaloğu; rol hedefi diyaloğu
  - mobil: yok
- **Alanlar/filtreler:**
  - web:
    - arama: rol adı veya kodu
    - yeni rol: ad, kod, açıklama, şablon (Salt Okuma / Operasyon / Onaylayıcı)
  - mobil: yok
- **Aksiyonlar:**
  - `admin.roles` ❌
  - `admin.permissions` ❌
  - `admin.createRole` ❌
  - `admin.updateRole` ❌
  - `admin.roleTargetMembers` ❌
  - `admin.saveRoleTarget` ❌
- **Durum:** Yok
- **Eksikler:**
  - Rol listesi, yetki matrisi düzenleme, rol oluşturma ve rol hedefleri mobilde yok.

### departments — Departmanlar
- **Web:** `apps/web/src/app/components/pages/admin/DepartmentsPage.tsx`
- **Mobil:** yok
- **İzin:** `departments.read` · departman: hepsi (yönetim menüsü; yalnız admin/super_admin)
- **Görünümler:**
  - web: Organizasyon (kart) ve Tablo görünümleri; yeni departman formu; hedef diyaloğu
  - mobil: yok
- **Alanlar/filtreler:**
  - web:
    - arama
    - kolonlar: Departman, Kod, Açıklama, Hedef
    - yeni departman: Ad*, Kod*, Açıklama
  - mobil: yok
- **Aksiyonlar:**
  - `admin.departments` ❌
  - `admin.createDept` ❌
  - `admin.departmentTargets` ❌
  - `admin.saveDepartmentTarget` ❌
- **Durum:** Yok
- **Eksikler:**
  - Departman listesi, oluşturma ve hedef yönetimi mobilde yok.

### settings — Ayarlar
- **Web:** `apps/web/src/app/components/pages/settings/SettingsPage.tsx`
- **Mobil:** `apps/mobile-v2/app/(tabs)/more/settings.tsx`, `apps/mobile-v2/app/(tabs)/more/index.tsx`
- **İzin:** `tenants` kaynağı, ancak menü herkese açık · departman: hepsi
- **Görünümler:**
  - web, sekmeler:
    - Genel
    - Şirket
    - Bildirimler
    - Menü & Akış
    - Webmail
    - CRM Alan Ayarları
    - Fırsat Atama
    - Teknik Bilgi
    - bekleyen değişiklikler için kaydet çubuğu
  - mobil: tek ayarlar ekranı; "Daha Fazla" menüsünde profil, çalışma kapsamı, hakkında, çıkış
- **Alanlar/filtreler:**
  - web, ayar alanları:
    - Genel: para birimi ve saat dilimi
    - Şirket: şirket bilgileri, haftalık rapor alıcıları, imza kartı
    - Bildirimler: 4 bildirim anahtarı
    - Menü & Akış: gizli menü öğeleri
    - Webmail: hesap bağlantısı ve mail imzası; super_admin için kullanıcı imzaları
    - CRM Alan Ayarları: lookup değerleri (sıralama, içe aktarma, değişiklik geçmişi) ve departman ayarları
    - Fırsat Atama: atama kuralları
    - Teknik Bilgi: ürün teknik özellik şablonları ve lazer profilleri
  - mobil: tema, OS bildirim izinleri, senkron kuyruğu, biyometrik kilit, önbellek temizleme, geliştirici API URL, destek e-postası, hakkında, hesap silme talebi (mailto)
- **Aksiyonlar:**
  - `admin.updateTenant` (şirket bilgisi, rapor alıcıları, gizli menü) ❌
  - `signature.list` / `signature.create` / `signature.update` / `signature.remove`, imza görseli yükleme ❌
  - `mail.account` ✅ — mobilde yalnız durum okuma
  - `mail.connect` ❌
  - `mail.disconnect` ❌
  - `mail.signature` / `mail.saveSignature` ❌
  - `mail.signatureUsers` / `mail.userSignature` / `mail.saveUserSignature` ❌
  - `admin.lookupRows` / `admin.createLookup` / `admin.updateLookup` / `admin.reorderLookup` / `admin.deleteLookup` ❌
  - `admin.auditLogs` ❌
  - Lookup içe aktarma ❌
  - `admin.departments` / `admin.createDept` / `admin.updateDept` / `admin.deleteDept` ❌
  - `leadAssignmentRule.list` / `create` / `update` / `remove` ❌
  - `admin.productSpecTemplates` / `bulkCreate` / `batchSave` ❌
  - `product.listBrands` ❌
  - `laserProfilesService` (kaydet, çöz, içe aktarma önizleme/onay) ❌ (mobilde çağrı yok)
- **Durum:** Eksik
- **Eksikler:**
  - Kiracı (şirket) ayarları, haftalık rapor alıcıları ve menü gizleme yok.
  - İmza yönetimi yok.
  - Webmail bağlama/kesme ve mail imzası yok.
  - CRM lookup ve departman yönetimi yok.
  - Fırsat atama kuralları yok.
  - Teknik özellik şablonları ve lazer profilleri yok.
  - Para birimi ve saat dilimi tercihleri yok.
  - Bildirim tercihleri uygulama içinde yok; yalnızca OS ayarlarına yönlendirme var.
  - (masaüstüne özgü, kapsam dışı: localStorage'da tutulan yerel tercihler)

### public-service-complaint — Herkese açık şikayet formu
- **Web:** `apps/web/src/app/components/pages/PublicServiceComplaint.tsx` (App.tsx'te `/public/service-complaints/:slug/:token` yoluyla, oturumsuz)
- **Mobil:** yok
- **İzin:** yok (public token ile erişim) · departman: hepsi
- **Görünümler:**
  - web: firma/makine bağlamlı tek sayfa şikayet formu ve gönderim sonrası onay
  - mobil: yok
- **Alanlar/filtreler:**
  - web: Konu, Ad Soyad, Telefon, E-posta, Öncelik, Açıklama, kanıt ekleri (25 MB sınırı, izinli türler)
  - mobil: yok
- **Aksiyonlar:**
  - `publicComplaint.form` ❌
  - `publicComplaint.signedUpload` ❌
  - `publicComplaint.uploadBinary` ❌
  - `publicComplaint.submit` ❌
- **Durum:** Yok
- **Eksikler:**
  - Bu form, müşterinin QR veya link ile oturum açmadan kullandığı web formu; oturum gerektiren mobil uygulamanın kapsamı dışında.
  - Mobilde yalnızca bu formdan gelen şikayetleri görüntüleme ve işleme var (`service-complaints`).
  - Public link oluşturma ve yönetimi de mobilde yok (bkz. service-requests).
