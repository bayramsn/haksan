# Haksan Mobil Premium Figma Spesifikasyonu

Bu doküman `mobile-web-full-parity-handoff.md` üzerine ek premium tasarım katmanıdır. Amaç Figma'da sadece ekranları çizmek değil; renk paleti, component library, popup/bottom sheet davranışları, motion/efektler, form alanları, dolu/boş içerik örnekleri ve prototype akışlarıyla uygulamayı eksiksiz tarif etmektir.

## 1. Figma Dosya Yapısı

Figma dosyası şu sayfalarla kurulmalı:

| Figma page | İçerik |
|---|---|
| `00 - Cover & Flow Map` | Ürün özeti, rol haritası, ana kullanıcı akışları |
| `01 - Foundations` | renkler, typography, spacing, radius, elevation, motion, icon, grid |
| `02 - Components` | button, input, list row, card, sheet, dialog, toast, badge, tabs, picker, file upload, signature |
| `03 - Patterns` | liste ekranı, detay ekranı, form ekranı, kanban, dashboard, PDF preview, offline queue |
| `04 - Screens - Core` | login, onboarding, shell, dashboard, search, notifications, quick create |
| `05 - Screens - Sales` | firmalar, kontaklar, satış kartları, teklifler, dokümanlar, harita |
| `06 - Screens - Operations` | ürün, stok, satın alma, sevkiyat, teslimat, kurulum |
| `07 - Screens - Finance` | ödemeler, faturalar, cari, vade |
| `08 - Screens - Service` | servis talepleri, servis detay, garanti/RMA, tamamlama, makineler |
| `09 - Screens - Admin` | kullanıcı, rol, departman, bölüm, ayarlar, raporlar |
| `10 - Prototype` | clickable flow bağlantıları ve transition notları |
| `11 - Dev Handoff` | ölçüler, token adları, component props, export notları |

Her ekran frame adı formatı:

`<module>/<screen>/<state>` örnekleri:

- `sales/offers/list-populated`
- `sales/offers/detail-approved`
- `service/ticket-detail/warranty-pending`
- `operations/delivery/signature-offline`
- `global/bottom-sheet/filter-expanded`

## 2. Premium Görsel Yön

Haksan için önerilen yön: "industrial premium, saha odaklı, yoğun veride net". Lüks hissi dekoratif gradient ile değil, malzeme kalitesi, net hiyerarşi, tutarlı boşluklar, keskin tipografi ve küçük ama kontrollü motion ile verilmeli.

Tasarım karakteri:

- CNC/teknik sektöre uygun: net grid, mühendislik hissi, güçlü kontrast.
- Operasyon uygulaması olduğu için gereksiz hero, süs, pazarlama dili yok.
- Bilgi yoğunluğu yüksek ama nefes alan kartlar.
- Kritik aksiyonlar tek elle erişilebilir: sticky footer, FAB, bottom sheet.
- Durumlar renk + ikon + metin ile verilir; sadece renge güvenilmez.
- Her liste satırı skimmable: sol ikon/avatar, orta başlık/meta, sağ durum/tutar/chevron.

## 3. Renk Paleti

### 3.1 Ana Marka Paleti

| Token | Hex | Kullanım |
|---|---|---|
| `brand.navy.950` | `#000c69` | primary CTA, aktif tab, link, selected state |
| `brand.navy.900` | `#0a176f` | pressed primary |
| `brand.navy.800` | `#18288a` | hover/active vurgu |
| `brand.navy.100` | `#eef2ff` | selected chip, subtle background |
| `brand.red.700` | `#cf060c` | destructive, reject, overdue |
| `brand.red.100` | `#fef2f2` | destructive soft bg |
| `industrial.ink` | `#1a1c1d` | ana metin |
| `industrial.muted` | `#717182` | meta text |
| `industrial.canvas` | `#f7f7f8` | app background |
| `industrial.card` | `#ffffff` | cards/sheets |
| `industrial.line` | `rgba(0,0,0,0.10)` | borders |

### 3.2 Semantic Palet

| Durum | Text | Background | Border | Kullanım |
|---|---|---|---|---|
| Success | `#137333` | `#e6f4ea` | `#b7e1c1` | onaylı, tamamlandı, paid |
| Warning | `#b06000` | `#fef7e0` | `#f7d98c` | bekliyor, ETA, vade yakın |
| Danger | `#b91c1c` | `#fef2f2` | `#fecaca` | reddedildi, overdue, sil |
| Info | `#1d4ed8` | `#eff6ff` | `#bfdbfe` | bilgi, import preview |
| Neutral | `#4b5563` | `#f3f4f6` | `#d1d5db` | taslak, pasif |
| Purple | `#6d28d9` | `#f5f3ff` | `#ddd6fe` | revizyon, özel not |

### 3.3 Domain Renkleri

| Domain | Primary | Soft | Kullanım |
|---|---|---|---|
| Sales | `#000c69` | `#eef2ff` | satış kartı, teklif, firma |
| Service | `#0f766e` | `#ecfdf5` | servis talebi, bakım, kurulum |
| Finance | `#854d0e` | `#fffbeb` | ödeme, fatura, vade |
| Stock | `#374151` | `#f3f4f6` | stok, depo, ürün |
| Admin | `#4338ca` | `#eef2ff` | kullanıcı/rol/yetki |

### 3.4 Grafik Paleti

Chart renkleri 5 seriyi geçmemeli:

1. `#000c69` primary navy
2. `#cf060c` brand red
3. `#2563eb` blue
4. `#10b981` emerald
5. `#f59e0b` amber

Grafiklerde arka plan beyaz, grid line `#e5e7eb`, label `#717182`, aktif tooltip card `#ffffff` + shadow.

### 3.5 Dark Mode

Dark mode premium ama ikincil teslim olabilir. Figma'da en az şu frame'ler dark çizilmeli:

- Dashboard
- Liste ekranı
- Detay ekranı
- Bottom sheet
- Form error state

Dark token:

| Token | Hex |
|---|---|
| `dark.canvas` | `#121318` |
| `dark.surface` | `#1e1f25` |
| `dark.surfaceHigh` | `#292930` |
| `dark.text` | `#e3e2e6` |
| `dark.muted` | `#9a9aa5` |
| `dark.line` | `rgba(255,255,255,0.10)` |
| `dark.primary` | `#8b93ff` |

## 4. Spacing, Grid, Radius, Elevation

### 4.1 Grid

- Mobile frame: iPhone `390x844`, Android `360x800`, large phone `430x932`.
- Horizontal page padding: 16 px default, 20 px premium dashboard/detail hero.
- Card padding: 16 px.
- Row gap: 8 px compact, 12 px normal.
- Section gap: 24 px.
- Bottom safe area: sticky footer içinde minimum 16 px.

### 4.2 Radius

| Token | Value | Kullanım |
|---|---:|---|
| `radius.xs` | 6 | tiny status dot, mini chips |
| `radius.sm` | 10 | input, button, segmented control |
| `radius.md` | 12 | list row, compact cards |
| `radius.lg` | 16 | dashboard card, bottom sheet top corners |
| `radius.xl` | 20 | full-height modal sheet |
| `radius.pill` | 999 | badge, avatar, chip |

### 4.3 Elevation

| Token | iOS shadow | Android elevation | Kullanım |
|---|---|---:|---|
| `elevation.none` | none | 0 | flat list row |
| `elevation.1` | `0 4 16 rgba(0,0,0,.05)` | 1 | cards |
| `elevation.2` | `0 10 30 rgba(0,12,105,.08)` | 3 | sticky bars, sheets |
| `elevation.3` | `0 18 50 rgba(0,0,0,.16)` | 6 | modal, PDF preview toolbar |

Figma'da tüm shadows token olarak tanımlanmalı. Rastgele shadow kullanılmamalı.

## 5. Motion ve Efektler

Motion sade ve operasyonel olmalı. Amaç kullanıcıyı yönlendirmek; gösteriş değil.

| Token | Süre | Easing | Kullanım |
|---|---:|---|---|
| `motion.instant` | 80 ms | ease-out | pressed, checkbox |
| `motion.fast` | 140 ms | ease-out | chip select, badge update |
| `motion.base` | 220 ms | cubic-bezier(.2,.8,.2,1) | sheet open, tab transition |
| `motion.slow` | 320 ms | cubic-bezier(.2,.8,.2,1) | screen push, overlay fade |
| `motion.spring` | platform spring | damping 18, stiffness 220 | FAB morph, swipe settle |

Zorunlu mikro-etkileşimler:

- Button press: 0.98 scale + opacity 0.92, 80 ms.
- Row press: background `brand.navy.100`, chevron 2 px sağa kayar.
- Swipe action: satır 72 px'e kadar kayar; action bg kırmızı/yeşil; bırakınca spring.
- Pull-to-refresh: navy spinner + "Yenileniyor" microcopy.
- Skeleton: 1.2 sn shimmer, düşük kontrast; koyu shimmer yok.
- Status değişimi: badge crossfade + hafif scale 0.96 -> 1.
- Form save success: sticky footer button 600 ms "Kaydedildi" state, sonra önceki ekrana dön.
- Error shake: sadece invalid field 3 px yatay, 180 ms; tüm form sallanmaz.
- Bottom sheet açılışı: overlay fade 160 ms, sheet slide 260 ms.
- PDF toolbar: scroll down'da collapse, scroll up'da show.
- Kanban kolon geçişi: yatay paging snap, kart press elevation artar.

Haptics:

- Success: light success haptic.
- Destructive confirm: warning haptic.
- Long press/action sheet: selection haptic.
- Drag/drop start: medium haptic.

## 6. Bottom Sheet ve Açılır Pencere Sistemi

### 6.1 Sheet Tipleri

| Sheet tipi | Snap points | Kullanım |
|---|---|---|
| `ActionSheet` | content height, max 60% | satır aksiyonları: düzenle, sil, indir |
| `PickerSheet` | 50%, 90% | firma, kontak, ürün, teklif seçimi |
| `FilterSheet` | 45%, 90% | liste filtreleri |
| `FormSheet` | 90% | kısa formlar, durum güncelleme |
| `FullForm` | full screen | teklif, satın alma, servis, teslimat gibi uzun formlar |
| `PreviewSheet` | 70%, 95% | PDF/dosya hızlı önizleme |
| `ConfirmSheet` | content height | sil/onay/reddet kararı |
| `ConflictSheet` | 70% | offline sync conflict |

### 6.2 Sheet Anatomy

Her sheet şu katmanlardan oluşmalı:

- Scrim: `rgba(10, 25, 47, 0.32)`, dark mode `rgba(0,0,0,.56)`.
- Handle: 36 x 4 px, radius pill, top 8 px.
- Header: başlık, alt açıklama, close icon.
- Body: scrollable içerik.
- Footer: sticky CTA; safe area dahil.
- Error area: footer üstünde compact alert.

Keyboard davranışı:

- Input focus olduğunda sheet yukarı taşar, footer klavyenin üstünde kalır.
- Picker search input sticky header içinde kalır.
- Uzun formlarda "Kaydet" butonu klavye açıkken de görünmeli.

Scroll davranışı:

- Header sabit, body scroll.
- Scroll başlarsa header altına 1 px divider gelir.
- Footer her zaman sabit.
- Çok uzun picker listelerinde selected item üste pinlenebilir.

### 6.3 Popup/Modal Envanteri

| Popup | İçerik | Primary action | Secondary |
|---|---|---|---|
| Sil onayı | kayıt adı, geri alınamaz uyarısı | Sil | Vazgeç |
| Reddet onayı | karar notu textarea | Reddet | İptal |
| Onayla | işlem özeti | Onayla | İptal |
| Status update | mevcut durum, yeni durum select, not | Güncelle | Vazgeç |
| Dosya yükle | type, entity picker, file picker, not | Yükle | İptal |
| PDF preview | toolbar, belge gövdesi, share/download | Paylaş/İndir | Kapat |
| Duplicate firma | eşleşen firma, bölüm, borç uyarısı | Erişim iste | Yeni kayıt devam |
| Offline conflict | yerel değer/sunucu değeri diff | Sunucuyu kullan / Yereli gönder | İptal |
| Import preview | summary, hata satırları, commit CTA | İçe aktar | Vazgeç |
| Public link created | link, kopyala/paylaş | Paylaş | Kapat |
| Session expired | açıklama | Giriş yap | - |

## 7. Component Library Eksikleri

Figma component setleri variantlı çizilmeli.

### 7.1 Buttons

Variantlar:

- `primary`, `secondary`, `outline`, `ghost`, `destructive`, `success`, `link`
- size: `sm 36`, `md 44`, `lg 52`, `icon 44`
- state: default, pressed, disabled, loading, success
- icon position: none, left, right, icon-only

### 7.2 Inputs

Variantlar:

- text, email, phone mask, password, number, currency, percent, date, time, textarea.
- state: empty, filled, focused, disabled, readonly, error, success, loading.
- helper text, error text, character counter.
- prefix/suffix: currency, percent, search icon, clear icon.

### 7.3 Pickers

Zorunlu picker componentleri:

- CompanyPicker: search, relation badge, city, tax no.
- ContactPicker: company grouped, phone/email meta.
- ProductPicker: brand, model, price, stock badge.
- OpportunityPicker: stage, company, amount.
- QuotePicker: quote no, revision, status, total.
- UserPicker: avatar, role, department.
- DateRangePicker: quick ranges + custom.
- CurrencyPicker: USD/EUR/TRY.
- StatusPicker: current/next status with permission note.

### 7.4 ListRow

Props:

- `title`, `subtitle`, `meta`, `amount`, `currency`, `status`, `leadingIcon/avatar`, `trailingAction`.
- States: default, pressed, selected, disabled, unread, overdue, offlinePending.
- Swipe actions: edit, delete, approve, reject, download.

### 7.5 Cards

Kart tipleri:

- KPI card
- Finance amount card
- Timeline event card
- Service ticket card
- Kanban card
- Product/stock card
- File/document card
- Approval card
- Offline queue card

### 7.6 Status Badge

Badge her zaman renk + kısa metin + opsiyonel ikon kullanır.

Örnek status setleri:

- Quote: Taslak, Gönderilen, Onaylı, Reddedilen.
- Payment: Ödendi, Bekliyor, Gecikti.
- Stock: Hazır, Rezerve, Satılan, Pasif.
- Service: Yeni, Planlandı, Servis Devam Ediyor, Servis Tamamlandı, Kapandı.
- Complaint: Yeni, Onay bekliyor, Onaylandı, Reddedildi.
- Warranty: Kapsamda, Kapsam dışı, Onay bekliyor, RMA.

## 8. Form Alan Tipleri ve Doldurulacak İçerikler

Tasarımda boş placeholder yerine gerçekçi dolu örnekler de çizilmeli.

### 8.1 Ortak Form Alanları

| Field tipi | Örnek değer | Not |
|---|---|---|
| Firma | `ABC Makina San. Tic. Ltd. Şti.` | picker |
| Kontak | `Mehmet Yılmaz - Satın Alma Müdürü` | firma seçimine bağlı |
| Telefon | `+90 532 123 45 67` | mask |
| E-posta | `mehmet@abcmakina.com` | validation |
| Para | `125.000,00 USD` | locale aware |
| Yüzde | `%20` | KDV/indirim |
| Tarih | `30.06.2026` | TR format |
| Seri no | `HSM650-2026-011` | uppercase |
| Stok kodu | `CNC-HSM650-STD` | monospace olabilir |
| Not | `Müşteri 15 gün içinde dönüş bekliyor.` | textarea |
| Dosya | `fatura_2026_131.pdf - 2.4 MB` | type/size |

### 8.2 Uzun Form Bölümlendirme

Uzun formlar stepper veya accordion section ile çizilmeli:

1. Genel Bilgiler
2. Firma/Kontak
3. Ürün/Kalemler
4. Finans/Şartlar
5. Doküman/Fotoğraf/İmza
6. Özet ve Kaydet

Her section:

- tamamlandı check state,
- eksik alan sayısı,
- error count,
- collapse/expand variant.

### 8.3 Line Item Editor

Teklif, satın alma ve servis teklifi için ortak kalem editor:

- Kalem kartı: ürün, açıklama, miktar, birim fiyat, indirim, KDV, toplam.
- Add line CTA sticky.
- Swipe delete.
- Inline expand: teknik özellik, opsiyonel donanım, uyumluluk.
- Totals sticky summary: ara toplam, indirim, KDV, genel toplam.

### 8.4 Dosya ve Fotoğraf Alanları

Variantlar:

- empty upload zone
- uploading progress
- uploaded file card
- upload failed retry
- unsupported file type
- large file error
- camera/photo picker
- multi-file grid

Dosya kartında:

- icon/thumbnail,
- filename,
- type,
- size,
- upload date,
- preview/download/delete actions.

### 8.5 İmza Alanı

SignaturePad state'leri:

- empty: "İmza bekleniyor"
- drawing
- signed with timestamp
- offline pending
- clear/redo confirm

İmza ekranı:

- landscape önerisi gösterilebilir ama portrait de çalışmalı.
- müşteri adı ve kimlik/ünvan alanı imza üstünde olmalı.
- "İmzayı kaydet" butonu disabled -> çizim başlayınca enabled.

## 9. Premium Ekran State'leri

Her ana ekran için Figma'da minimum şu state'ler çizilmeli:

| State | Açıklama |
|---|---|
| `loading` | skeleton, shimmer, disabled top actions |
| `empty` | ikon, kısa açıklama, primary CTA |
| `populated` | gerçekçi veri ile dolu |
| `filtered-empty` | filtre sonucu yok, filtreleri temizle CTA |
| `error` | retry, teknik olmayan hata metni |
| `offline-cached` | cached timestamp, mutation disabled/queued |
| `permission-denied` | yetki yok açıklaması |
| `rate-limited` | Retry-After mesajı |
| `partial-data` | bazı widgetlar yüklenemedi |

Örnek microcopy:

- Empty firmalar: "Henüz firma kaydı yok. İlk firma kaydını oluşturup satış akışını başlatın."
- Filtered empty: "Bu filtrelerle sonuç bulunamadı."
- Error: "Veriler alınamadı. Bağlantınızı kontrol edip tekrar deneyin."
- Offline: "Çevrimdışı çalışıyorsunuz. Değişiklikler bağlantı gelince gönderilecek."
- Permission: "Bu modülü görüntülemek için yetkiniz yok."

## 10. Modül Bazlı Premium Ekler

### 10.1 Dashboard

Eklenmeli:

- "Bugün" paneli: ziyaretler, servis randevuları, vade uyarıları.
- "Aksiyon bekleyenler" carousel: onay, servis, teklif, ödeme.
- KPI drilldown sheet: KPI kartına basınca ilgili liste filtreli açılır.
- Target progress ring: kullanıcı hedefi ve gerçekleşme.
- Offline/cache timestamp: "Son güncelleme 09:42".

### 10.2 Firmalar

Eklenmeli:

- Firma health score: cari durum, açık fırsat, servis riski, son temas.
- Quick actions row: ara, mail, harita, WhatsApp, ziyaret planla.
- Duplicate warning sheet: aynı vergi no/telefon/e-posta eşleşmesi.
- Cross-division debt banner.
- Firma detay hero: unvan, relation type, şehir, primary contact.

### 10.3 Satış Kartları

Eklenmeli:

- Stage timeline compact.
- Kanban kartlarında age indicator: "12 gündür bu aşamada".
- Lost/won reason sheet.
- Archive/reopen confirm.
- Opportunity value confidence indicator.

### 10.4 Teklifler

Eklenmeli:

- Revision timeline.
- PDF preview thumbnail.
- Approval block: kim onayladı/reddetti, tarih, not.
- Quote health: geçerlilik süresi, marj, ödeme şartı, eksik alan.
- "Teklif gönderildi" sonrası share/email state.

### 10.5 Operasyon

Eklenmeli:

- Sevkiyat progress timeline: oluşturuldu, yolda, gümrük, teslim.
- Teslimat imza status: imza bekliyor, imzalandı, sync bekliyor.
- Kurulum checklist progress.
- Stok serial scan placeholder: barkod/QR tarama v2.
- Product import validation summary.

### 10.6 Finans

Eklenmeli:

- Cash flow mini chart.
- Vade risk color band.
- Payment proof attachment preview.
- Statement sheet with running balance.
- Invoice status timeline.

### 10.7 Servis

Eklenmeli:

- Service SLA timer.
- Warranty coverage panel.
- RMA decision timeline.
- Parts consumed summary.
- Completion checklist progress.
- Offline queue banner.
- Before/after photo grid.
- Customer signature and technician signature split.

### 10.8 Admin

Eklenmeli:

- Permission matrix mobile pattern: role accordion + permission groups.
- User target editor.
- Department target progress.
- Audit log row: actor, action, entity, timestamp, changed fields.
- Tenant settings danger zone ayrı sheet.

## 11. Prototype Akışları

Figma prototype içinde minimum şu akışlar bağlanmalı:

1. Login -> Dashboard -> Quick Create -> Yeni Firma -> Firma Detay.
2. Dashboard uyarısı -> Vade Takvimi -> Cari Ekstre -> PDF paylaş.
3. Satış -> Satış Kartları -> Detay -> Yeni Teklif -> PDF Preview -> Gönder.
4. Teklif -> Onayla -> Satış Siparişi oluştur -> Stok rezervasyon.
5. Operasyon -> Sevkiyat -> Detay -> Durum Güncelle -> İrsaliye Preview.
6. Operasyon -> Teslimat -> İmza Al -> Offline queue -> Sync success.
7. Servis -> Talep Detay -> Garanti/RMA -> Onaya gönder -> Onayla/Reddet.
8. Servis -> Tamamlama -> Checklist -> Parça tüket -> İmza -> Servisi kapat.
9. Chat -> Record share -> Satış kartı deep link.
10. Takvim -> ICS import preview -> commit.
11. Ürünler -> Import preview -> hata satırları -> commit.
12. Admin -> Kullanıcı düzenle -> hedef kaydet.

Prototype transition önerisi:

- Tab switch: instant/no slide.
- Stack push: slide from right 220 ms.
- Modal sheet: slide up 260 ms.
- Full-screen modal: fade + slide 220 ms.
- Confirmation: scale/fade 180 ms.

## 12. Figma Component Handoff Detayı

Her component için Figma'da şu bilgiler yazılmalı:

- Component name.
- Variant props.
- Auto layout değerleri.
- Min/max width.
- Padding/gap.
- Text style token.
- Color token.
- Interaction state.
- Accessibility label.
- RN component karşılığı.

Örnek:

| Figma component | RN karşılığı | Props |
|---|---|---|
| `Button/Primary` | `src/ui/Button.tsx` | `variant`, `size`, `loading`, `disabled`, `icon` |
| `Input/Text` | `src/ui/Input.tsx` | `value`, `error`, `helperText`, `keyboardType` |
| `Sheet/Form` | new `BottomSheet` | `snapPoints`, `title`, `footer`, `scroll` |
| `ListRow/Entity` | `src/ui/ListRow.tsx` | `title`, `subtitle`, `status`, `amount`, `onPress` |
| `SegmentedControl` | `src/ui/SegmentedControl.tsx` | `items`, `value`, `onChange` |
| `SignaturePad` | `src/ui/SignaturePad.tsx` | `value`, `onChange`, `disabled` |
| `PdfPreview` | `src/ui/PdfPreview.tsx` | `url`, `title`, `actions` |

## 13. Tasarımcının Kaçırmaması Gereken Eksikler

Bu başlıklar önceki handoff'ta işlevsel olarak vardı ama premium Figma tesliminde özellikle çizilmezse eksik kalır:

- Tüm bottom sheet variantları ve snap point davranışları.
- Keyboard açıkken form footer davranışı.
- Entity picker search/loading/empty/error state'leri.
- Offline queue ve sync conflict ekranları.
- Dosya upload progress/error/retry state'leri.
- SignaturePad empty/signed/offline state'leri.
- Permission denied ve readonly role state'leri.
- Rate limit ve session expired mesajları.
- Import preview ekranları: calendar ICS ve product Excel.
- Admin divisions ekranı.
- Report year-end download flow.
- Public complaint file upload flow.
- Status update sheet'leri: quote, purchase, stock, shipment, delivery, installation, service.
- Approval inbox: approve/reject with note.
- Long text ve taşma durumları: çok uzun firma adı, 5+ kalemli teklif, 20+ checklist satırı.
- Dark mode minimum component set.
- Haptic/motion token sayfası.
- Dev handoff ölçüleri ve RN component mapping.

## 14. Figma Teslim Kabul Kriterleri

Tasarım tamam sayılması için:

- En az 3 cihaz boyutu çizilmiş: 360x800, 390x844, 430x932.
- Her component variantı component set içinde.
- Tüm renkler variable/token olarak tanımlı.
- Her ana ekranın `loading`, `empty`, `populated`, `error`, `offline` state'i var.
- Formlar dolu örnek verilerle ve validation error state'iyle çizilmiş.
- Bottom sheet ve modal davranışları prototype ile gösterilmiş.
- 12 prototype akışı bağlanmış.
- Her destructive action için confirm state var.
- Her dosya/PDF/Excel aksiyonu mobil karşılığıyla çizilmiş.
- Dev handoff sayfasında ölçüler, tokenlar ve RN component karşılıkları var.
