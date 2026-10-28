# Haksan Mobil Tasarım Brief'i - Web Tam Parite

Bu doküman mobil tasarım yaptırmak için tek kaynak brief'tir. Hedef: web uygulamasında görünen tüm ekran, sekme, form, dialog, aksiyon, rol görünürlüğü ve API entegrasyonunun mobilde eksiksiz karşılığını tasarlamak.

## 1. Kaynaklar ve Kapsam

| Kaynak | Kullanım |
|---|---|
| `apps/web/src/app/App.tsx` | Web ana navigasyon, sayfa başlıkları, route karşılıkları |
| `apps/web/src/app/components/Layout.tsx` | Sidebar, global arama, hızlı oluştur, bildirim, onay, çağrı asistanı, kullanıcı menüsü |
| `apps/web/src/app/components/pages/**` | Tüm web sayfa davranışları |
| `apps/web/src/app/components/dialogs/**` | Tüm create/edit/upload/preview dialogları |
| `docs/web-action-registry.json` | 262 API endpoint, 218 web action, permission eşleşmeleri |
| `docs/mobile-parity-gaps.md` | Web'de olup mobil servisinde eksik kalan action'lar |
| `screenshots/haksan-web-full/` | 135 web referans ekran görüntüsü |
| `docs/stitch-screens.md` | Mevcut Stitch mobil ekran ID'leri |
| `docs/mobile-premium-figma-spec.md` | Premium Figma tasarım sistemi, popup/sheet, motion ve component-state detayları |
| `apps/mobile/src/navigation/modules.ts` | Mobil modül listesi ve rol bazlı görünürlük |
| `apps/mobile/src/modules/registry.ts` | Mobil liste/detay veri bağlama haritası |
| `apps/mobile/src/api/services.ts` + `services.web.ts` | Mobil API servisleri |

Kapsama dahil olan web yüzeyi:

- Auth: login, şifremi unuttum, oturum yenileme/süre doldu davranışı.
- Global shell: sidebar, topbar, bölüm seçici, hızlı oluştur, komut paleti, yardım, bildirimler, onaylar, manuel PBX/çağrı asistanı, kullanıcı menüsü.
- Genel: dashboard, sohbet, takvim.
- Satış: firmalar, kontaklar, firma detay, satış kartları liste/kanban/detay, firma haritası, teklifler, proformalar, sözleşmeler, dokümanlar, satış fiyat listesi.
- Operasyon/finans: ürünler, stok, satın alma, sevkiyat, teslimat, kurulum, ödemeler/kasa, muhasebe faturaları, cari rapor, vade takvimi.
- Servis: makineler/varlıklar, servis talepleri, servis kanban, şikayet kutusu, public şikayet linkleri, garanti/RMA, servis fiyat listesi.
- Yönetim/raporlar: raporlar, kullanıcılar, roller, departmanlar, bölümler, ayarlar, audit/tenant hedefleri.
- Public dış form: servis şikayet formu ve public dosya yükleme.

## 2. Değişmez Parite Kuralları

1. Mobilde web'de olan her modül görünür olmalı; görünürlük web ile aynı rol/permission mantığına bağlı olmalı.
2. Web'deki her buton veya satır aksiyonu mobilde bir karşılığa sahip olmalı: topbar icon, sticky CTA, FAB, bottom sheet action, swipe action veya detay ekranı menüsü.
3. Her liste ekranı şu durumları tasarlamalı: loading skeleton, empty state, error state, populated state, filtered state, offline/cache state.
4. Her form için validasyon, zorunlu alan, disabled/loading/success/error durumları tasarlanmalı.
5. Her destructive action onay istemeli: sil, iptal, reddet, revoke, arşivle.
6. PDF/Excel/indir/önizle/yazdır web aksiyonları mobilde paylaşım sheet'i, in-app preview veya sistem dosya paylaşımı ile çözülmeli.
7. API key/secret mobil veya frontend tasarımına girmeyecek; tüm çağrılar backend REST API üzerinden yapılacak.
8. `X-Active-Division` ve rol bazlı görünürlük korunacak; kullanıcı aktif bölümünü değiştirebiliyorsa mobilde de bölüm seçici olacak.
9. Servis saha akışları offline-first tasarlanmalı: servis tamamlama, kurulum checklist, teslimat imza, fotoğraf/dosya ekleri, parça tüketimi.
10. Web action registry sıfır eksik olana kadar mobil tamam sayılmayacak.

## 3. Platform ve Tasarım Sistemi

Mevcut mobil stack `apps/mobile`: Expo SDK 56, React Native 0.85, expo-router, TypeScript. Tasarım Figma/Stitch'te üretilebilir ama geliştirici handoff Expo/RN bileşenleriyle konuşmalı.

| Token | Değer | Mobil kullanım |
|---|---|---|
| Primary | `#000c69` | CTA, aktif tab, link, aktif navigation |
| Accent red | `#cf060c` | destructive, red, kritik uyarı |
| Canvas | `#f7f7f8` / mobile `#f9f9fa` | ekran arka planı |
| Card | `#ffffff` | kart, sheet, list row |
| Primary soft | `#eef2ff` | seçili chip, icon bg, secondary CTA |
| Red soft | `#fef2f2` | hata/tehlike arka planı |
| Text primary | `#1a1c1d` | ana metin |
| Muted | `#717182` | meta, placeholder |
| Border | `rgba(0,0,0,0.1)` | ayırıcı, input border |
| Radius | 10 / 12 / 16 | input-button / kart / sheet |
| Touch target | 44 px minimum | tüm icon button ve satır aksiyonları |

Tipografi mobil ölçüsü:

| Rol | Boyut | Ağırlık |
|---|---:|---:|
| Screen title | 22 | 600 |
| Section title | 17-18 | 600 |
| Body | 15-16 | 400 |
| Meta/caption | 11-13 | 500-600 |
| KPI | 28-32 | 600 |

Logo kuralı: orijinal Haksan logosu kullanılacak. AI ile yeniden çizilmiş logo kullanılmayacak. Referans: `.stitch/haksan-makina-logo.png`, `apps/mobile/assets/images/haksan-logo.png`.

## 4. Global Mobil Shell

Tab bar 5 ana sekme:

| Tab | İçerik | Web kaynakları |
|---|---|---|
| Ana | Dashboard, bildirimler, takvim, sohbet kısa yolları | `dashboard`, `notifications`, `calendar`, `chat` |
| Satış | Firmalar, kontaklar, satış kartları, harita, teklifler, dokümanlar, fiyat listesi | sales nav grubu |
| Operasyon | Ürün, stok, satın alma, sevkiyat, teslimat, kurulum, finans | operasyon nav grubu |
| Servis | Makineler, servis talepleri, servis kanban, servis fiyat listesi | servis nav grubu |
| Daha Fazla | Raporlar, yönetim, ayarlar, profil | reports/admin/settings |

Topbar:

- Root ekranlarda: logo/başlık, global search, bildirim zili, profil avatar.
- Detail ekranlarda: geri, kayıt başlığı, durum badge, kebab action menüsü.
- Form ekranlarında: kapat/geri, başlık, sticky footer CTA.
- Aktif bölüm: `Tümü` veya bölüm adı chip'i; super/admin veya canViewAllDivisions olan kullanıcı değiştirebilir.

Global overlay karşılıkları:

| Web pattern | Mobil pattern |
|---|---|
| Sidebar nav | 5 tab + More modül grid + rol bazlı görünürlük |
| Quick create dialog | Full-height bottom sheet, 2 kolon action grid |
| Command palette | Full-screen search overlay |
| Help center | Search + FAQ accordion |
| Notifications popover | Bildirim listesi ekranı/sheet, okundu işareti, deep link |
| Approvals dialog | Onay inbox ekranı/sheet, swipe approve/reject |
| User dropdown | Profil sheet: bölüm, rol, raporlar, yönetim, ayarlar, çıkış |
| Manual PBX | Telefon input + eşleşme sonucu + önerilen CRM action |
| Center dialog kısa form | Bottom sheet |
| Center dialog uzun form | Full-screen form |
| Table row menu | Swipe action + trailing kebab |
| PDF preview | Full-screen preview + paylaş/indir |

## 5. Web Modül Envanteri ve Mobil Karşılığı

| Web NavKey | Web başlık | Mobil route | Mobil/Stitch referans | Rol görünürlüğü |
|---|---|---|---|---|
| `dashboard` | Dashboard | `/(tabs)` | `91f83c94ae8044cb867284b3a21aaeb3` | herkes |
| `chat` | Sohbet | `/modules/chat` | `20e9867b31b94036b5d18145cbcb340d` | herkes |
| `calendar` | Takvim | `/modules/calendar` | `4774acd7377d466ba1375c82d3b902c3` | herkes |
| `notifications` | Bildirimler | `/modules/notifications` | `176b14a5f4494a1c9fda2a2e9cbbb09e` | herkes |
| `customers` | Firmalar | `/modules/customers` | `97f60630c8ea490884fbd3e5d4a8b98d` | sales, finance, admin |
| `contacts` | Kontaklar | `/modules/contacts` | `cc4d0dd86ff44d15a4d91ee39a6edcb2` | sales, admin |
| `sales-cases` | Satış Kartları | `/modules/sales-cases` | `e0417d17b4494b689a8a7ce4f90c3ce9` | sales, admin |
| `sales-map` | Firma Haritası | `/modules/sales-map` | `233c28eb0f214df2a92e45e37c1331be` | sales, service, admin |
| `offers` | Teklifler | `/modules/offers` | `967defac0e8a4b9c81ad0fae8ec76f0c` | sales, finance, admin |
| `proformas` | Proformalar | `/modules/proformas` | `1639d10a6abe4318b740ea99e490bb9f` | sales, finance, admin |
| `contracts` | Sözleşmeler | `/modules/contracts` | `2c5f087b46154a3aadf41d171bc8741e` | sales, finance, admin |
| `documents` | Dokümanlar | `/modules/documents` | `1639d10a6abe4318b740ea99e490bb9f` | sales, finance, admin |
| `sales-price-list` | Satış Fiyat Listesi | `/modules/sales-price-list` | `0de944310e76433eac2f1cd35e13b547` | sales, admin |
| `products` | Ürünler | `/modules/products` | `0c1948c4002f4940a277c4856ef19e11` | sales, service, stock, admin |
| `stock` | Stok | `/modules/stock` | `56f23455b6f6494bb117eed2b12acb27` | stock, admin |
| `purchase-orders` | Satın Alma | `/modules/purchase-orders` | `8f55046fd9104417b318c27f3f337340` | stock, finance, admin |
| `payments` | Ödemeler & Kasa | `/modules/payments` | `2d0bb69b8f37493bb75d039e4d186589` | finance, admin |
| `accounting-invoices` | Muhasebe Faturaları | `/modules/accounting-invoices` | `08d2ed1465794d809fd2e61492172b27` | finance, sales, admin |
| `customer-balances` | Cari Rapor | `/modules/customer-balances` | `0880532884174e46ab348e080f6a5072` | finance, admin |
| `due-dates` | Vade Takvimi | `/modules/due-dates` | `5f5fcbec93be47bfa1df623e5f694788` | finance, admin |
| `shipments` | Sevkiyat & Lojistik | `/modules/shipments` | `c6314a6177fb4bf89f53bf83384513e9` | stock, admin |
| `deliveries` | Teslimatlar | `/modules/deliveries` | `dbb9fd3a3dd644aa8259e1e6f09aa03c` | stock, service, admin |
| `installations` | Kurulumlar | `/modules/installations` | `be97fe6edd78452caef41f9d8191139f` | service, admin |
| `machines` | Makineler / Varlıklar | `/modules/machines` | `5a449b07b93f495e96b75fcbe82808ea` | service, stock, admin |
| `service-requests` | Servis Talepleri | `/modules/service-requests` | `8d84b0d695cc4130acafcd7ab6bd5362` | service, admin |
| `service-kanban` | Servis Kanban | `/modules/service-kanban` | `8fb2a69578fd49dc9ec86205fdbd4a13` | service, admin |
| `service-price-list` | Servis Fiyat Listesi | `/modules/service-price-list` | `022fa7ebd7374833a1154b7801b11a4c` | service, admin |
| `reports` | Raporlar | `/modules/reports` | `de01a6c9464143c5a01a4353bc151ff9` | admin, super_admin; web'de readonly/sales/finance rapor görebilir |
| `users` | Kullanıcılar | `/modules/users` | `bfa5fc637de945dabea006a5ed7ae18a` | admin, super_admin |
| `roles` | Roller & Yetkiler | `/modules/roles` | yeni/admin list | admin, super_admin |
| `departments` | Departmanlar | `/modules/departments` | yeni/admin list | admin, super_admin |
| `divisions` | Bölümler | `/modules/divisions` | yeni/admin list | admin, super_admin |
| `settings` | Ayarlar | `/modules/settings` | `be0e94bc236f4625b741588e944c975f` | herkes, tenant update admin |

## 6. Ekran Gereksinimleri

### 6.1 Auth ve onboarding

- Login: logo, e-posta, şifre, şifre göster/gizle, giriş CTA, loading/disabled, API hatası, klavye safe area.
- Şifremi unuttum: e-posta input, gönder CTA, başarı/error, rate-limit mesajı.
- Oturum yenileme: access token SecureStore, refresh cookie, 401 sonrası otomatik refresh; refresh başarısızsa login'e yönlendirme.
- API URL setup/onboarding: fiziksel cihaz için LAN host, test bağlantısı, QR/manuel URL.
- İzinler: bildirim, konum, kamera/dosya, Android çağrı asistanı izinleri. İzinler mümkünse just-in-time.

### 6.2 Dashboard

Web referans: `screenshots/haksan-web-full/dashboard/`.

- Sekmeler: Özet, Operasyon, Grafikler, Hedefler.
- KPI kartları: pipeline, teklif, satış, servis, stok, ödeme/vade.
- Hedefler: `admin.myTargets`; kullanıcı hedefleri ve gerçekleşme.
- Alerts/operasyon: ödeme gecikmeleri, açık servis, stok/garanti uyarıları; tap deep link.
- Mobilde KPI grid 2 kolon, grafikler yatay scroll olmayan okunabilir kartlar olarak tasarlanmalı.

### 6.3 Global quick create

Web referans: `layout/01-quick-create.png` ve `quick-create-*`.

Zorunlu tile'lar:

- Yeni Firma -> `/forms/company`
- Yeni Kontak -> `/forms/contact`
- Yeni Satış Kartı -> `/forms/opportunity`
- Yeni Teklif -> `/forms/offer`
- Yeni Servis Talebi -> `/forms/service-ticket`
- Yeni Kasa Hareketi -> `/forms/payment`
- Yeni Takvim Etkinliği -> `/forms/calendar-event`
- Yeni Makine -> `/forms/machine`
- Yeni Satın Alma -> `/forms/purchase-order`
- Yeni Sevkiyat/Teslimat/Kurulum -> ilgili operasyon formları

Rolü olmayan tile hiç görünmeyecek.

### 6.4 Sohbet

Web referans: `screenshots/haksan-web-full/chat/`.

- Conversation list: DM/grup ayrımı, unread badge, son mesaj, tarih.
- Thread: mesaj listesi, gönder, edit, delete, reaction toggle, mark read.
- Yeni DM: directory arama.
- Yeni grup: grup adı, üye seçimi, üye ekle/çıkar, rol değiştir, grup güncelle.
- Dosya ekleme: signed upload ile güvenli yükleme.
- Record share: firma, satış kartı, teklif, servis talebi paylaşma; paylaşılan kayda deep link.

### 6.5 Takvim

Web referans: `screenshots/haksan-web-full/calendar/`.

- Görünümler: gün, hafta, ay, liste.
- Event create/update/delete/restore.
- Owner filtreleri.
- Firma bağlantısı.
- ICS import preview ve commit mobilde eksik; tasarlanmalı.
- Event detail: başlık, saat, konum, açıklama, firma, owner, source, deleted/restore durumu.

### 6.6 Firmalar

Web referans: `screenshots/haksan-web-full/customers/`.

- Liste tabları: Tümü, Müşteri, Tedarikçi+Müşteri, Tedarikçi.
- Arama: firma, şehir, e-posta.
- Excel export.
- Satır: unvan, kısa ad, sektör, telefon/e-posta, şehir, durum, ilişki tipi.
- Actions: detay, düzenle, sil.
- Yeni/düzenle firma formu: firma tipi, grup, irtibat şekli, sektör, unvan/ad soyad, telefon-1/2, faks, mail-1/2, web sitesi, açık adres, ülke, il, ilçe, vergi bilgileri/notlar.
- Duplicate/cross-division debt uyarısı: başka bölümde borç veya erişim talebi varsa mobilde banner/sheet.

### 6.7 Firma detay

Web referans: `screenshots/haksan-web-full/customer-detail/`.

- Header: firma adı, durum, ana iletişim, hızlı call/mail/map/WhatsApp.
- Sekmeler: Geçmiş, Satış Kartları, Aktivite, Cari, Makineler.
- Geçmiş: timeline birleşik görünüm.
- Satış Kartları: yeni kart, satır detay, stage badge.
- Aktivite: ziyaret ekle, arama ekle.
- Cari: ödeme/receivable satırları, status badge.
- Makineler: müşteri cihazları, model, seri no, garanti, durum.

### 6.8 Kontaklar

Web referans: `screenshots/haksan-web-full/contacts/`.

- Tablar: Tümü, Birincil.
- Liste: ad soyad, görev, firma, telefon, e-posta.
- Yeni/düzenle kontak: firma, ad soyad, görev/unvan, telefon, e-posta, birincil işareti.
- Çoklu firma bağlantısı mobilde korunmalı: bağlı firmalar, birincil firma yap, firmadan ayır.

### 6.9 Satış kartları

Web referans: `screenshots/haksan-web-full/sales-cases/`.

- Görünümler: Liste, Kanban, Geçmiş/arşiv.
- Arama: müşteri/ürün.
- Excel export.
- Liste satırı: firma, ürün/model, stage, tahmini tutar, sorumlu, tarih.
- Actions: detay, tamamla/arşivle, geri aç, sil.
- Kanban: stage kolonları, kart sayıları, yatay scroll, kart detail tap; drag/drop v2 olabilir ama stage change action mutlaka olmalı.

Satış kartı detay:

- Header: ürün/firma, stage, sorumlu kullanıcı select, hızlı actions.
- Actions: teklif oluştur, aktivite ekle, doküman yükle, ödeme planı oluştur, ticari fatura yükle/yeniden yükle, teklif gönder/onayla/reddet, sil.
- Sekmeler: Zaman Çizelgesi, Teklifler, Dokümanlar, Ödemeler.
- Ödeme planı formu: teklif seçimi, taksit sayısı, toplam tutar, para birimi, taksit satırları, eşitle, kaydet.

### 6.10 Teklifler

Web referans: `screenshots/haksan-web-full/offers/`.

- KPI: toplam, onaylanan, gönderilen, reddedilen; son 6 ay grafik.
- Tablar: Tümü, Taslak, Gönderilen, Onaylı, Reddedilen.
- Arama: teklif no/müşteri.
- Excel export.
- Liste actions: gönder, onayla, reddet, satış siparişi oluştur, detay, sil.
- Detay: kalemler, revision listesi, şartlar/notlar, toplamlar, durum.
- Detay actions: düzenle, PDF aç, PDF indir, proforma oluştur, sözleşme oluştur, gönder, muhasebe faturası oluştur, satış siparişi oluştur, onayla, reddet, sil.

Yeni/düzenle teklif formu:

- Firma, kontak, teklif tarihi, teklif no, geçerlilik süresi, gönderen kullanıcı, bölüm.
- Kalemler: kategori, ürün seçimi, stok kodu, açıklama, miktar, birim fiyat, iskonto, KDV, teknik özellikler.
- Opsiyonel donanım: ürün/serbest açıklama, teknik bilgi, fiyat/iskonto.
- Uyumluluk: makineler, markalar, kontrol üniteleri, tedarikçiler.
- Teslim şekli, ödeme şartları, teslimat şartları, garanti/servis maddeleri, hazır not şablonu, özel not.

### 6.11 Proformalar, sözleşmeler, dokümanlar

Web referans: `proformas/`, `contracts/`, `documents/`.

- Liste: doküman no, firma, teklif, tarih, yükleyen, tip/status.
- Actions: proforma oluştur, sözleşme oluştur, yükle, önizle, indir, yazdır/PDF, sil.
- Proforma formu: bağlı teklif, proforma no, tarih; dosya yüklemek gerekmez.
- Sözleşme formu: bağlı teklif, sözleşme no, tarih; dosya yüklemek gerekmez.
- Doküman upload: tip (Proforma, Sözleşme, Kurulum formu), firma/satış kartı scope, dosya, not; signed upload + file.link.

### 6.12 Satış fiyat listesi ve servis fiyat listesi

Web referans: `sales-price-list/`, `service-price-list/`.

- Satış fiyat listesi: fiyat listesi select, kategori tabları, ürün/marka/model arama, liste fiyatı, peşin fiyat, para birimi, KDV, stok kodu, açıklama.
- Super admin inline edit: liste/peşin fiyatına tıklayınca düzenleme.
- Servis fiyat listesi: yedek parça ve işçilik tabları; parça/işçilik arama; fiyat, birim, para birimi.
- Mobilde teklif kalemi seçme sheet'i bu listeyle aynı tasarım dilini kullanmalı.

### 6.13 Ürünler

Web referans: `screenshots/haksan-web-full/products/`.

- Liste: kategori/family tabları, marka/model/ürün arama, ürün kartı/satırı, fiyat, marka, seri, aile.
- Actions: yeni ürün, ürün düzenle, import preview, import commit.
- Product import: dosya seç, preview summary (satır, yeni, güncelleme, atlanan, hata), satır hata/uyarı listesi, commit.
- Ürün detay: medya, teknik specs, equipment, opsiyonlar, fiyat listesi kalemleri.
- Yeni/düzenle ürün: marka, model kodu, model adı, tam ad, ürün grubu/kategori, para birimi, fiyatlar, KDV, ülke, HS code, stok kodu, açıklama, teknik bilgiler, standart/opsiyonel donanımlar, notlar.

### 6.14 Stok

Web referans: `screenshots/haksan-web-full/stock/`.

- İki ana görünüm: makine stok adetleri ve seri numarası bazlı stok.
- Status tabları: Tümü, Hazır, Rezerve, Satılan, Pasif.
- Arama: seri/kod/model.
- Excel export.
- Actions: yeni stok, durum değiştir, reserve, sell, adet düzenle.
- Rezervasyon dialog: firma seç, stok item reserve.
- Makine stok adedi dialog: makine seç, adet gir, kaydet.
- Yeni stok: ürün, depo, seri no, giriş tarihi, maliyet, durum, lokasyon/not.

### 6.15 Satın alma

Web referans: `screenshots/haksan-web-full/purchase-orders/`.

- Liste: PO no, tedarikçi/firma, tip, durum, toplam, vade, tarih.
- Arama: PO/tedarikçi.
- Excel export.
- Actions: yeni sipariş, onayla, kalem ekle, gönder, status, sil.
- Yeni sipariş formu: satın alma tipi (ticari/idari), firma/müşteri, ödeme tipi (peşin/leasing/vadeli), fatura no, sipariş no, para birimi, yeni/eski vade, teslim şekli, sevkiyat referansı, vade değişim gerekçesi.
- Kalemler: ürün seçimi veya serbest açıklama, liste fiyatı, birim fiyat, indirim, KDV, satır sil, satır ekle, ara toplam/indirim/KDV/genel toplam.

### 6.16 Sevkiyat

Web referans: `screenshots/haksan-web-full/shipments/`.

- Liste: KPI/özet, status, takip no, taşıyıcı, origin/destination, ETA, satış kartı/firma.
- Excel export.
- Actions: yeni sevkiyat, status güncelle, sevk irsaliyesi yazdır/preview.
- Yeni sevkiyat: satış kartı, takip no, taşıyıcı, status, çıkış, varış, ETA.
- Detay mobil sekmeleri: Özet, Kalemler, Geçmiş, Durum Güncelle, İrsaliye Preview.

### 6.17 Teslimat

Web referans: `screenshots/haksan-web-full/deliveries/`.

- Liste: teslimat no/form no, müşteri, makine, teslim/kurulum tarihi, status.
- Excel export.
- Actions: yeni teslimat, teslim formu/düzenle, status, yazdır.
- Yeni teslimat/kurulum tutanağı: müşteri, makine/tezgah, teslim tarihi, kurulum tarihi, form no, tezgah marka/tip/model/seri no, CNC marka/model/seri/main software, ilgili kişi, kurulumu yapan, teslim alan, imza.
- Detay: DR.MAK Kurulum Tutanağı düzeni, formu yazdır, kaydet.
- Mobilde imza pad ve offline queue zorunlu.

### 6.18 Kurulum

Web referans: `screenshots/haksan-web-full/installations/`.

- Liste: kurulum no, firma, makine, planlanan tarih, lokasyon, durum.
- Actions: yeni kurulum, kurulum tutanağı aç, kurulumu sil, status update.
- Yeni kurulum: firma, kontak, makine, planlanan tarih, lokasyon, atanan servis personeli, not.
- Tutanağı: checklist satırları, durum (seçilmedi/tamamlandı/tamamlanmadı), satır notları, müşteri kabul, servis notu, imza/fotoğraf alanları.
- Actions: yazdır/PDF, kaydet, kurulumu tamamla.

### 6.19 Ödemeler & Kasa

Web referans: `screenshots/haksan-web-full/payments/`.

- KPI ve FX rate badge.
- Direction tabları: Tümü, Alınan, Ödenen.
- Status tabları: Tümü, Paid, Pending, Overdue.
- Arama: firma.
- Excel export.
- Actions: yeni kasa hareketi, muhasebe faturası, detay, status update, belge önizle/yükle, sil.
- Yeni kasa hareketi: firma, hareket tipi, tutar, para birimi, yöntem, tarih, fatura no, açıklama, belge/fiş/fatura dosyası zorunluluğu.
- Detay: durum select, ödeme yöntemi, belge listesi, belge link tipi (fiş/fatura), dosya yükle, önizle, sil.

### 6.20 Muhasebe faturaları

Web referans: `screenshots/haksan-web-full/accounting-invoices/`.

- Tablar: satış, alış, tümü.
- Arama: fatura no/firma.
- Actions: yeni fatura, yenile, detay, düzenle, sil.
- Detay: fatura no, firma, tip, tarih, vade, tutar, KDV, para birimi, ilişkili teklif/sipariş.
- Yeni/düzenle fatura: type, company, invoiceNo, dates, amounts, currency, payment plan.

### 6.21 Cari rapor ve vade takvimi

Web referans: `customer-balances/`, `due-dates/`.

- Cari rapor: firma arama, yenile, Excel export, satırdaki Excel ekstre/PDF ekstre, firma statement dialog.
- Admin kolonları: diğer bölümlere ait bakiye detayları.
- Statement dialog: firma detay, hareket listesi, Excel/PDF buttons.
- Vade takvimi: aylık grid, önceki/sonraki ay, gün hücresinde tahsil/ödeme badge'leri, overdue vurgusu.

### 6.22 Makineler / varlıklar

Web referans: `screenshots/haksan-web-full/machines/`.

- Liste: müşteri cihazları, model, seri no, firma, kurulum tarihi, garanti bitiş, durum.
- Actions: yeni makine, makine detay.
- Detay: müşteri, ürün/model, seri no, garanti aralığı, servis geçmişi, ilişkili servis talepleri.
- Yeni makine: firma, stok/seri no bağlantısı, model, seri no, kurulum tarihi, garanti başlangıç/bitiş.

### 6.23 Servis talepleri ve servis kanban

Web referans: `screenshots/haksan-web-full/service-requests/`.

- Görünümler: liste, servis akışı/kanban, şikayet kutusu, public linkler.
- Liste satırı: ticket no, firma, makine, stage/status, garanti badge, intake badge, atanan, tarih.
- Actions: yeni talep, status change, detay, sil.
- Yeni servis talebi: firma, makine opsiyonel, ilgili kişi, telefon/e-posta read-only, atanan servis personeli, kayıt tipi, müşteri problemi, iç servis notu, servis teklifi gerekli toggle.
- Şikayet kutusu: gelen şikayetler, yeni şikayet, convert complaint, reject complaint, update complaint.
- Public link: create link, revoke link, public complaint submit, public signed upload.

Servis detay:

- Sekmeler: Özet, Servis Teklifi, Makine Dosyası, Garanti/RMA, Müşteri İletişim, Not Geçmişi, Aktiviteler, Operasyonlar, Tamamlama.
- Özet: status, intake, garanti badge, timer start/pause/stop, atanan/stage update.
- Servis teklifi: kalemler, ürün/parça/işçilik, fiyat, iskonto, KDV, not şablonu, kaydet, kaydet ve yazdır.
- Makine dosyası: cihaz bilgisi, garanti, geçmiş servisler.
- Garanti/RMA: garanti bilgisi, arıza kategorisi, RMA no, tedarikçi, değerlendirme, maliyet/müşteri yansıtma, para birimi, onaya gönder, kaydet, onayla, reddet, parça listesi.
- Müşteri iletişim: şikayet/not ekle.
- Not geçmişi: servis notu ekle.
- Operasyonlar: yapılan işlem, tutar, para birimi, operasyon listesi.
- Parça tüketimi: parça seç, miktar, not, consume service parts.
- Tamamlama: kontrol satırları, durum done/not_done/na, satır ekle/sil, yapılan işler, notlar, yazdır, kaydet, servisi kapat.
- Mobilde tüm servis detay akışı offline-first ve tekrar denemeli olmalı.

### 6.24 Raporlar

Web referans: `screenshots/haksan-web-full/reports/`.

- Sekmeler/alanlar: operasyonel, karlılık/yıl sonu, analitik/Excel.
- Grafikler: pipeline summary, monthly/weekly quotes by product, monthly/weekly/yearly visits, stock summary, warranty expiring, expected receivables, completed payments, service complaints summary, department performance, year-end.
- Actions: rapor filtresi, Excel/PDF/yıl sonu download.
- Mobilde dashboard yoğunluğu azaltılmalı: KPI kartları + chart carousel + drilldown listeleri.

### 6.25 Yönetim

Web referans: `users/`, `roles/`, `departments/`, `settings/`.

- Kullanıcılar: liste, departman/bölüm/rol filtreleri, kullanıcı düzenle, hedef kaydet, user targets.
- Roller: liste, yeni rol, izin matrisi, rol güncelle.
- Departmanlar: liste, yeni departman, departman hedefleri, hedef kaydet.
- Bölümler: `admin.divisions` mobilde eksik; admin menüsünde ayrı liste gerekir.
- Ayarlar: tenant bilgisi, tenant update.
- Audit logs: web service action var; admin rapor/ayar alanında görüntülenebilir olmalı.

### 6.26 Public servis şikayeti

Web referans: `PublicServiceComplaint.tsx`.

- Public form linki auth gerektirmez.
- Form: müşteri/tenant link doğrulama, şikayet metni, iletişim, dosya ekleri.
- Dosya upload public signed URL ile yapılır.
- Başarı/teşekkür ve hata durumları ayrı tasarlanmalı.

## 7. Form ve Sheet Envanteri

| Web dialog/form | Mobil karşılık | Zorunlu davranış |
|---|---|---|
| `CreateCustomerDialog` | `/forms/company` full-screen | firma tipi, iletişim, adres, vergi, lookup select, create/update |
| `EditCustomerDialog` | `/forms/company?id=` | mevcut değerlerle edit |
| `CreateContactDialog` | `/forms/contact` | firma bağlantısı, birincil kişi |
| `CreateCaseDialog` | `/forms/opportunity` | firma, ürün/model, tutar, stage, sorumlu |
| `LogActivityDialog` / `AddActivityDialog` | `/forms/visit` veya call sheet | ziyaret/arame, tarih, kontak, konum, amaç/not |
| `QuoteDialog` | `/forms/offer` | uzun teklif formu, kalemler, opsiyonel donanım, şartlar |
| `CreateProformaDialog` | `/forms/proforma` | bağlı teklif, proforma no |
| `CreateContractDialog` | `/forms/contract` | bağlı teklif, sözleşme no |
| `DocumentUploadDialog` | upload sheet | signed upload + file.link |
| `CreatePaymentDialog` | `/forms/payment` | kasa hareketi + belge zorunluluğu |
| `CreateAccountingInvoiceDialog` | invoice form/sheet | alış/satış fatura |
| `CreatePurchaseOrderDialog` | `/forms/purchase-order` | satın alma tipi, kalemler, toplamlar |
| `ProductDialog` | product form | ürün teknik detayları |
| `ProductImportDialog` | import preview flow | preview/commit |
| `CreateStockDialog` | stock form | seri/depo/ürün |
| `CreateShipmentDialog` | shipment form | tracking/carrier/origin/destination/ETA |
| `CreateDeliveryDialog` | `/forms/delivery` | kurulum tutanağı alanları, imza |
| `CreateInstallationDialog` | `/forms/installation` | firma/kontak/makine/plan |
| `CreateServiceRequestDialog` | `/forms/service-ticket` | firma, makine opsiyonel, problem, servis personeli |
| `CreateComplaintDialog` | complaint sheet | şikayet kutusu kaydı |
| `CreateComplaintLinkDialog` | public link sheet | link üret/revoke |
| Service quote editor | service quote full-screen | kalem, şablon, PDF |
| Warranty/RMA editor | warranty detail form | submit/approve/reject |
| Service completion form | `/forms/service-complete` | checklist, yapılan işler, imza, close |
| Installation checklist | `/forms/installation-checklist` | checklist, fotoğraf, imza |
| Delivery signature | `/forms/delivery-signature` | müşteri imzası, offline |

## 8. Entegrasyon ve Güvenlik

- Token: access token ve refresh cookie `expo-secure-store` içinde tutulur.
- Her request `Authorization: Bearer`, refresh cookie ve aktif bölüm header'ı taşır.
- `X-Active-Division` ve web uyumluluğu için `X-Active-Department` korunur.
- API timeout default 30 saniye; timeout/network error UI'da retry ile gösterilir.
- Tüm mutation'lar optimistic değilse loading/disabled state göstermeli.
- Dosya upload: sadece signed upload URL, MIME/size doğrulama backend'de; mobilde kullanıcıya tip/boyut hatası gösterilir.
- Public complaint dışındaki tüm route'lar auth gerektirir.
- Web permission key'leri mobil buton görünürlüğünü belirler; sunucu yine nihai otoritedir.
- XSS riski: LLM/HTML output render edilmeyecek; doküman preview WebView kullanırsa trusted URL ve sandbox davranışı belirlenmeli.

## 9. Bilinen Mobil Parite Borçları

`docs/mobile-parity-gaps.md` çıktısına göre web'de olup mobil servisinde eksik 7 action:

| Action key | HTTP | Path | Permission | Mobil tasarım karşılığı |
|---|---|---|---|---|
| `admin.divisions` | GET | `/divisions` | `users.read` | Yönetim > Bölümler listesi |
| `calendar.importPreview` | POST | `/calendar/import/preview` | `calendar.create` | Takvim > ICS içe aktar preview |
| `calendar.importCommit` | POST | `/calendar/import/commit` | `calendar.create` | Takvim > içe aktarma onayla |
| `product.previewImport` | POST | `/products/import/preview` | `products.create` | Ürünler > Excel import preview |
| `product.commitImport` | POST | `/products/import/commit` | `products.create` | Ürünler > import commit |
| `publicComplaint.signedUpload` | POST | `/public/service-complaints/:param/:param/files/signed-upload-url` | - | Public şikayet dosya yükleme |
| `report.downloadYearEnd` | ? | `?` | - | Raporlar > yıl sonu raporu indir |

Sadece mobilde tanımlı ve web'e göre mobile-specific olanlar:

- `calendar.syncSettings`, `calendar.saveSyncSettings`
- `callAssistant.mobileEvent`
- `contact.companies`

## 10. Full Web Action Registry

Bu tablo mobil tasarım ve geliştirme için eksiksiz action sözleşmesidir. Her action ya görünür bir kullanıcı aksiyonu, ya da ilgili ekranın veri yükleme/önizleme/export bağımlılığıdır.

### accessRequest (3)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `accessRequest.approve` | POST | `/access-requests/:param/approve` | `companies.update` |
| `accessRequest.list` | GET | `/access-requests` | `companies.read` |
| `accessRequest.reject` | POST | `/access-requests/:param/reject` | `companies.update` |

### activity (4)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `activity.create` | POST | `/activities` | `activities.create` |
| `activity.createCall` | POST | `/calls` | `activities.create` |
| `activity.createVisit` | POST | `/visits` | `activities.create` |
| `activity.list` | GET | `/activities` | `activities.read` |

### admin (19)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `admin.auditLogs` | GET | `/audit-logs` | `audit.read` |
| `admin.createDept` | POST | `/departments` | `departments.create` |
| `admin.createRole` | POST | `/roles` | `roles.create` |
| `admin.createUser` | POST | `/users` | `users.create` |
| `admin.departments` | GET | `/departments` | `departments.read` |
| `admin.departmentTargets` | GET | `/department-targets` | `users.read` |
| `admin.divisions` | GET | `/divisions` | `users.read` |
| `admin.myTargets` | GET | `/me/targets` | - |
| `admin.permissions` | GET | `/permissions` | `roles.read` |
| `admin.roles` | GET | `/roles` | `roles.read` |
| `admin.saveDepartmentTarget` | POST | `/departments/:param/targets` | `departments.update` |
| `admin.saveUserTarget` | POST | `/users/:param/targets` | `users.update` |
| `admin.tenant` | GET | `/tenant` | `tenants.read` |
| `admin.updateDept` | PATCH | `/departments/:param` | `departments.update` |
| `admin.updateRole` | PATCH | `/roles/:param` | `roles.update` |
| `admin.updateTenant` | PATCH | `/tenant` | `tenants.update` |
| `admin.updateUser` | PATCH | `/users/:param` | `users.update` |
| `admin.users` | GET | `/users` | `users.read` |
| `admin.userTargets` | GET | `/user-targets` | `users.read` |

### auth (1)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `auth.forgotPassword` | POST | `/auth/forgot-password` | - |

### calendar (8)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `calendar.create` | POST | `/calendar/events` | `calendar.create` |
| `calendar.events` | GET | `/calendar/events` | `calendar.read` |
| `calendar.importCommit` | POST | `/calendar/import/commit` | `calendar.create` |
| `calendar.importPreview` | POST | `/calendar/import/preview` | `calendar.create` |
| `calendar.owners` | GET | `/calendar/owners` | `calendar.read` |
| `calendar.remove` | DELETE | `/calendar/events/:param` | `calendar.delete` |
| `calendar.restore` | POST | `/calendar/events/:param/restore` | `calendar.update` |
| `calendar.update` | PATCH | `/calendar/events/:param` | `calendar.update` |

### callAssistant (3)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `callAssistant.action` | POST | `/call-assistant/suggestions/:param/actions` | `companies.read` |
| `callAssistant.manualEvent` | POST | `/call-assistant/manual-events` | `companies.read` |
| `callAssistant.suggestions` | GET | `/call-assistant/suggestions` | `companies.read` |

### chat (15)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `chat.addMembers` | POST | `/chat/conversations/:param/members` | - |
| `chat.conversation` | GET | `/chat/conversations/:param` | - |
| `chat.conversations` | GET | `/chat/conversations` | - |
| `chat.createDm` | POST | `/chat/conversations/dm` | - |
| `chat.createGroup` | POST | `/chat/conversations/group` | - |
| `chat.deleteMessage` | DELETE | `/chat/messages/:param` | - |
| `chat.directory` | GET | `/chat/directory` | - |
| `chat.editMessage` | PATCH | `/chat/messages/:param` | - |
| `chat.markRead` | POST | `/chat/conversations/:param/read` | - |
| `chat.messages` | GET | `/chat/conversations/:param/messages` | - |
| `chat.removeMember` | DELETE | `/chat/conversations/:param/members/:param` | - |
| `chat.sendMessage` | POST | `/chat/conversations/:param/messages` | - |
| `chat.setMemberRole` | PATCH | `/chat/conversations/:param/members/:param/role` | - |
| `chat.toggleReaction` | POST | `/chat/messages/:param/reactions` | - |
| `chat.updateGroup` | PATCH | `/chat/conversations/:param` | - |

### company (5)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `company.create` | POST | `/companies` | `companies.create` |
| `company.get` | GET | `/companies/:param` | `companies.read` |
| `company.list` | GET | `/companies` | `companies.read` |
| `company.remove` | DELETE | `/companies/:param` | `companies.delete` |
| `company.update` | PATCH | `/companies/:param` | `companies.update` |

### competitor (5)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `competitor.create` | POST | `/competitors` | `competitors.create` |
| `competitor.createProduct` | POST | `/competitors/:param/products` | `competitors.create` |
| `competitor.list` | GET | `/competitors` | `competitors.read` |
| `competitor.products` | GET | `/competitors/:param/products` | `competitors.read` |
| `competitor.update` | PATCH | `/competitors/:param` | `competitors.update` |

### contact (5)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `contact.create` | POST | `/contacts` | `contacts.create` |
| `contact.get` | GET | `/contacts/:param` | `contacts.read` |
| `contact.list` | GET | `/contacts` | `contacts.read` |
| `contact.remove` | DELETE | `/contacts/:param` | `contacts.delete` |
| `contact.update` | PATCH | `/contacts/:param` | `contacts.update` |

### document (9)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `document.commercialInvoices` | GET | `/commercial-invoices` | `commercial_invoices.read` |
| `document.contracts` | GET | `/contracts` | `contracts.read` |
| `document.createCommercialInvoice` | POST | `/commercial-invoices` | `commercial_invoices.create` |
| `document.createContract` | POST | `/contracts` | `contracts.create` |
| `document.createProforma` | POST | `/proformas` | `proformas.create` |
| `document.proformas` | GET | `/proformas` | `proformas.read` |
| `document.updateCommercialInvoice` | PATCH | `/commercial-invoices/:param` | `commercial_invoices.update` |
| `document.updateContract` | PATCH | `/contracts/:param` | `contracts.update` |
| `document.updateProforma` | PATCH | `/proformas/:param` | `proformas.update` |

### file (5)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `file.link` | POST | `/files/link` | `files.create` |
| `file.links` | GET | `/files/links` | `files.read` |
| `file.remove` | DELETE | `/files/:param` | `files.delete` |
| `file.signedDownload` | POST | `/files/signed-download-url` | `files.read` |
| `file.signedUpload` | POST | `/files/signed-upload-url` | `files.create` |

### finance (13)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `finance.accountingInvoice` | GET | `/accounting-invoices/:param` | `accounting_invoices.read` |
| `finance.accountingInvoices` | GET | `/accounting-invoices` | `accounting_invoices.read` |
| `finance.companyStatement` | GET | `/companies/:param/statement` | `receivables.read` |
| `finance.companySummary` | GET | `/companies/:param/finance-summary` | `receivables.read` |
| `finance.createAccountingInvoice` | POST | `/accounting-invoices` | `accounting_invoices.create` |
| `finance.createPayment` | POST | `/payments` | `payments.create` |
| `finance.createReceivable` | POST | `/receivables` | `receivables.create` |
| `finance.customerBalances` | GET | `/reports/customer-balances` | `receivables.read` |
| `finance.dueDates` | GET | `/reports/due-dates` | `receivables.read` |
| `finance.payments` | GET | `/payments` | `payments.read` |
| `finance.receivables` | GET | `/receivables` | `receivables.read` |
| `finance.updatePaymentStatus` | PATCH | `/payments/:param/status` | `payments.create` |
| `finance.updateReceivableStatus` | PATCH | `/receivables/:param/status` | `receivables.create` |

### inventory (12)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `inventory.bySerial` | GET | `/inventory/serial/:param` | `inventory.read` |
| `inventory.consumeServiceParts` | POST | `/inventory/consume-service-parts` | `inventory.update` |
| `inventory.create` | POST | `/inventory` | `inventory.create` |
| `inventory.createCustomerDevice` | POST | `/customer-devices` | `customer_devices.update` |
| `inventory.createWarehouse` | POST | `/warehouses` | `warehouses.create` |
| `inventory.customerDevices` | GET | `/customer-devices` | `customer_devices.read` |
| `inventory.get` | GET | `/inventory/:param` | `inventory.read` |
| `inventory.list` | GET | `/inventory` | `inventory.read` |
| `inventory.listWarehouses` | GET | `/warehouses` | `warehouses.read` |
| `inventory.reserve` | PATCH | `/inventory/:param/reserve` | `inventory.update` |
| `inventory.sell` | PATCH | `/inventory/:param/sell` | `inventory.update` |
| `inventory.update` | PATCH | `/inventory/:param` | `inventory.update` |

### lookup (1)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `lookup.byName` | GET | `/lookups/:param` | - |

### noteTemplate (3)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `noteTemplate.create` | POST | `/note-templates` | `quotes.create` |
| `noteTemplate.list` | GET | `/note-templates` | `quotes.read` |
| `noteTemplate.remove` | DELETE | `/note-templates/:param` | `quotes.create` |

### notification (2)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `notification.list` | GET | `/notifications` | - |
| `notification.markRead` | PATCH | `/notifications/:param/read` | - |

### opportunity (6)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `opportunity.changeStage` | PATCH | `/opportunities/:param/stage` | `opportunities.update` |
| `opportunity.create` | POST | `/opportunities` | `opportunities.create` |
| `opportunity.get` | GET | `/opportunities/:param` | `opportunities.read` |
| `opportunity.list` | GET | `/opportunities` | `opportunities.read` |
| `opportunity.remove` | DELETE | `/opportunities/:param` | `opportunities.delete` |
| `opportunity.update` | PATCH | `/opportunities/:param` | `opportunities.update` |

### product (22)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `product.addEquipment` | POST | `/products/:param/equipment` | `products.update` |
| `product.addSpec` | POST | `/products/:param/specs` | `product_specs.create` |
| `product.commitImport` | POST | `/products/import/commit` | `products.create` |
| `product.create` | POST | `/products` | `products.create` |
| `product.createBrand` | POST | `/brands` | `brands.create` |
| `product.createPriceList` | POST | `/price-lists` | `price_lists.create` |
| `product.createPriceListItem` | POST | `/price-lists/:param/items` | `price_lists.create` |
| `product.equipment` | GET | `/products/:param/equipment` | `products.read` |
| `product.get` | GET | `/products/:param` | `products.read` |
| `product.list` | GET | `/products` | `products.read` |
| `product.listBrands` | GET | `/brands` | `brands.read` |
| `product.listPriceListItems` | GET | `/price-lists/:param/items` | `price_lists.read` |
| `product.listPriceLists` | GET | `/price-lists` | `price_lists.read` |
| `product.media` | GET | `/products/:param/media` | `products.read` |
| `product.options` | GET | `/products/:param/options` | `products.read` |
| `product.previewImport` | POST | `/products/import/preview` | `products.create` |
| `product.remove` | DELETE | `/products/:param` | `products.delete` |
| `product.replaceDetails` | PUT | `/products/:param/details` | `products.update` |
| `product.specs` | GET | `/products/:param/specs` | `product_specs.read` |
| `product.update` | PATCH | `/products/:param` | `products.update` |
| `product.updatePriceList` | PATCH | `/price-lists/:param` | `price_lists.update` |
| `product.updatePriceListItem` | PATCH | `/price-lists/:param/items/:param` | `price_lists.update` |

### publicComplaint (3)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `publicComplaint.form` | GET | `/public/service-complaints/:param/:param` | - |
| `publicComplaint.signedUpload` | POST | `/public/service-complaints/:param/:param/files/signed-upload-url` | - |
| `publicComplaint.submit` | POST | `/public/service-complaints/:param/:param` | - |

### purchaseOrder (9)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `purchaseOrder.addItem` | POST | `/purchase-orders/:param/items` | `purchase_orders.update` |
| `purchaseOrder.approve` | POST | `/purchase-orders/:param/approve` | `purchase_orders.approve` |
| `purchaseOrder.create` | POST | `/purchase-orders` | `purchase_orders.create` |
| `purchaseOrder.get` | GET | `/purchase-orders/:param` | `purchase_orders.read` |
| `purchaseOrder.list` | GET | `/purchase-orders` | `purchase_orders.read` |
| `purchaseOrder.remove` | DELETE | `/purchase-orders/:param` | `purchase_orders.delete` |
| `purchaseOrder.send` | POST | `/purchase-orders/:param/send` | `purchase_orders.update` |
| `purchaseOrder.setStatus` | PATCH | `/purchase-orders/:param/status` | `purchase_orders.update` |
| `purchaseOrder.update` | PATCH | `/purchase-orders/:param` | `purchase_orders.update` |

### quote (12)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `quote.addItem` | POST | `/quotes/:param/items` | `quotes.update` |
| `quote.approve` | POST | `/quotes/:param/approve` | `quotes.approve` |
| `quote.create` | POST | `/quotes` | `quotes.create` |
| `quote.deleteItem` | DELETE | `/quotes/:param/items/:param` | `quotes.update` |
| `quote.get` | GET | `/quotes/:param` | `quotes.read` |
| `quote.list` | GET | `/quotes` | `quotes.read` |
| `quote.reject` | POST | `/quotes/:param/reject` | `quotes.reject` |
| `quote.remove` | DELETE | `/quotes/:param` | `quotes.delete` |
| `quote.send` | POST | `/quotes/:param/send` | `quotes.update` |
| `quote.terms` | PUT | `/quotes/:param/terms` | `quotes.update` |
| `quote.update` | PATCH | `/quotes/:param` | `quotes.update` |
| `quote.updateItem` | PATCH | `/quotes/:param/items/:param` | `quotes.update` |

### report (14)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `report.completedPayments` | GET | `/reports/completed-payments` | `reports.read` |
| `report.departmentPerformance` | GET | `/reports/department-performance` | `reports.read` |
| `report.downloadYearEnd` | ? | `?` | - |
| `report.expectedReceivables` | GET | `/reports/expected-receivables` | `reports.read` |
| `report.monthlyQuotes` | GET | `/reports/monthly-quotes-by-product` | `reports.read` |
| `report.monthlyVisits` | GET | `/reports/monthly-visits` | `reports.read` |
| `report.pipelineSummary` | GET | `/reports/pipeline-summary` | `reports.read` |
| `report.serviceComplaintsSummary` | GET | `/reports/service-complaints-summary` | `reports.read` |
| `report.stockSummary` | GET | `/reports/stock-summary` | `reports.read` |
| `report.warrantyExpiring` | GET | `/reports/warranty-expiring` | `reports.read` |
| `report.weeklyQuotes` | GET | `/reports/weekly-quotes-by-product` | `reports.read` |
| `report.weeklyVisits` | GET | `/reports/weekly-visits` | `reports.read` |
| `report.yearEnd` | GET | `/reports/year-end` | `reports.read` |
| `report.yearlyVisits` | GET | `/reports/yearly-visits` | `reports.read` |

### salesOrder (10)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `salesOrder.addItem` | POST | `/sales-orders/:param/items` | `sales_orders.update` |
| `salesOrder.approve` | POST | `/sales-orders/:param/approve` | `sales_orders.approve` |
| `salesOrder.create` | POST | `/sales-orders` | `sales_orders.create` |
| `salesOrder.createFromQuote` | POST | `/sales-orders/from-quote/:param` | `sales_orders.create` |
| `salesOrder.get` | GET | `/sales-orders/:param` | `sales_orders.read` |
| `salesOrder.list` | GET | `/sales-orders` | `sales_orders.read` |
| `salesOrder.remove` | DELETE | `/sales-orders/:param` | `sales_orders.delete` |
| `salesOrder.reserve` | POST | `/sales-orders/:param/reserve` | `sales_orders.update` |
| `salesOrder.setStatus` | PATCH | `/sales-orders/:param/status` | `sales_orders.update` |
| `salesOrder.update` | PATCH | `/sales-orders/:param` | `sales_orders.update` |

### service (29)
| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `service.approveWarranty` | POST | `/service-tickets/:param/warranty/approve` | `service_tickets.approve` |
| `service.complaintLinks` | GET | `/service-complaint-links` | `service_tickets.read` |
| `service.complaints` | GET | `/service-complaints` | `service_tickets.read` |
| `service.convertComplaint` | POST | `/service-complaints/:param/convert` | `service_tickets.create` |
| `service.createComplaint` | POST | `/service-complaints` | `service_tickets.create` |
| `service.createComplaintLink` | POST | `/service-complaint-links` | `service_tickets.create` |
| `service.createDelivery` | POST | `/deliveries` | `shipments.create` |
| `service.createInstallation` | POST | `/installations` | `installations.create` |
| `service.createShipment` | POST | `/shipments` | `shipments.create` |
| `service.createTicket` | POST | `/service-tickets` | `service_tickets.create` |
| `service.deliveries` | GET | `/deliveries` | `shipments.read` |
| `service.installations` | GET | `/installations` | `installations.read` |
| `service.rejectComplaint` | POST | `/service-complaints/:param/reject` | `service_tickets.update` |
| `service.rejectWarranty` | POST | `/service-tickets/:param/warranty/reject` | `service_tickets.reject` |
| `service.revokeComplaintLink` | PATCH | `/service-complaint-links/:param/revoke` | `service_tickets.update` |
| `service.shipment` | GET | `/shipments/:param` | `shipments.read` |
| `service.shipments` | GET | `/shipments` | `shipments.read` |
| `service.submitWarranty` | POST | `/service-tickets/:param/warranty/submit` | `service_tickets.update` |
| `service.tickets` | GET | `/service-tickets` | `service_tickets.read` |
| `service.update` | PATCH | `/service-tickets/:param` | `service_tickets.update` |
| `service.updateComplaint` | PATCH | `/service-complaints/:param` | `service_tickets.update` |
| `service.updateDelivery` | PATCH | `/deliveries/:param` | `shipments.update` |
| `service.updateDeliveryStatus` | PATCH | `/deliveries/:param/status` | `shipments.update` |
| `service.updateInstallationStatus` | PATCH | `/installations/:param/status` | `installations.update` |
| `service.updateShipmentStatus` | PATCH | `/shipments/:param/status` | `shipments.update` |
| `service.updateTicketStatus` | PATCH | `/service-tickets/:param/status` | `service_tickets.update` |
| `service.updateWarranty` | PUT | `/service-tickets/:param/warranty` | `service_tickets.update` |
| `service.updateWarrantyParts` | PUT | `/service-tickets/:param/warranty/parts` | `service_tickets.update` |
| `service.warranty` | GET | `/service-tickets/:param/warranty` | `service_tickets.read` |

## 11. Ekran Görsel Referansları

Web referans ekranları `screenshots/haksan-web-full/` altında 135 PNG olarak hazır. Tasarım tesliminde bu klasörler kapsanmalı:

| Klasör | İçerik |
|---|---|
| `login` | login, forgot password |
| `layout` | quick create, help, command palette, notifications, user menu, PBX, approvals |
| `dashboard` | main, özet, operasyon, grafikler, hedefler |
| `chat` | main, new chat, new group |
| `calendar` | main, new event, gün/hafta/ay/liste |
| `customers`, `customer-detail`, `contacts` | CRM firma/kontak ve detay sekmeleri |
| `sales-cases`, `sales-cases/detail`, `sales-map` | satış list/kanban/detail/map |
| `offers`, `proformas`, `contracts`, `documents` | ticari dokümanlar |
| `payments`, `accounting-invoices`, `customer-balances`, `due-dates` | finans |
| `products`, `stock`, `purchase-orders` | ürün/stok/satın alma |
| `shipments`, `deliveries`, `installations` | lojistik/teslim/kurulum |
| `machines`, `service-requests`, `service-kanban`, `service-price-list` | servis |
| `reports`, `users`, `roles`, `departments`, `settings` | yönetim |

## 12. Tasarım Teslim Checklist'i

- Tüm 5 tab ve More modül grid'i rol bazlı çizildi.
- Her modül için liste, detay, create/edit formu, empty/loading/error/offline durumları var.
- Web'deki tablar mobil segment control veya page tab olarak karşılandı.
- Web dialoglarının tamamı mobile sheet/full-screen form karşılığına sahip.
- 218 web action için görünür/çalışır mobil entry point var.
- 7 mobil parity gap için tasarım ve implementation ticket'ı açıldı.
- PDF/Excel/export/download/share davranışları mobil platform kurallarına göre belirtildi.
- Dosya yükleme, imza, fotoğraf, offline queue ve retry durumları çizildi.
- RBAC: sales/service/finance/stock/readonly/admin/super_admin görünürlük matrisi test edildi.
- Türkçe UI metinleri uzun kelimelerde taşmıyor; minimum touch target 44 px.
- Login/API URL/izinler/fiziksel cihaz senaryosu dahil.
- Tasarım notları Expo/React Native component karşılıklarıyla teslim edildi.
- Premium Figma teslimi için `docs/mobile-premium-figma-spec.md` içindeki renk, motion, bottom sheet, form field, popup ve prototype kabul kriterleri ayrıca uygulandı.
