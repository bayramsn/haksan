# Mobil ekran şartnamesi (apps/mobile-v2)

Kullanıcının verdiği tasarım görsellerinden çıkarıldı. Ajanlar görselleri göremez;
**bu dosya tek referanstır**. Bir ekranı "bitti" saymak için buradaki her madde
karşılanmalı.

## Ortak kurallar

**Tema:** marka kırmızısı `#e31e24` (`primary`). Renk asla ham hex yazılmaz;
`theme.config.js` token'ları kullanılır (`bg-primary`, `text-foreground`,
`text-muted-foreground`, `bg-card`, `border-border`, `bg-canvas`). Ham renk
gerekiyorsa `useTheme().colors`.

**Hazır bileşenler — yenisini yazmadan önce buraya bak:**

| Bileşen | Dosya | Ne için |
|---|---|---|
| `ScreenHeader` | `src/ui` | Liste ekranı büyük başlığı + sağ eylem düğmeleri |
| `DetailHeader` | `src/ui` | Detay üst çubuğu (geri + ortada başlık) |
| `SearchBar` | `src/ui` | Arama kutusu (+ isteğe bağlı filtre düğmesi) |
| `FilterChips` | `src/ui` | Yatay segment pilleri, "Tümü" dahil (nullable) |
| `StatStrip` | `src/ui` | Liste üstü ince sayı şeridi |
| `ListRow` | `src/ui` | Tek tip liste kartı (ikon + başlık + satırlar + rozet + sağ değer) |
| `SectionHeader` | `src/ui` | "Vadesi Geçen (3)" + "Tümünü Gör" |
| `Chip` / `Card` / `Button` / `Field` | `src/ui` | Rozet / kart / buton / form alanı |
| `EmptyState` / `ErrorState` / `Loading` | `src/ui` | Durum ekranları |
| `Fab` | `src/ui` | Sağ alt yüzen eylem (extended = metinli) |
| `StatCard` / `StatGrid` | `src/ui/data` | KPI kutusu (ikon + değer + ↑/↓ trend) |
| `Tabs` | `src/ui/data` | Detay içi yatay sekmeler |
| `ProgressBar` | `src/ui/data` | "3 / 6 Tamamlandı" çubuğu |
| `StepTrack` | `src/ui/data` | Yatay adım rayı |
| `InfoRows` | `src/ui/data` | Alan/değer listesi (boş alan gizlenir) |
| `Avatar` | `src/ui/Avatar` | Baş harfli yuvarlak avatar |
| `SettingsGroup` / `SettingsRow` | `src/ui/settings` | Ayarlar satırları |

**ÖNEMLİ:** Birçok detay ekranında yerel bir `Row({label,value})` kopyası var.
Bunları sil, `InfoRows` kullan.

**Biçimleme:** `src/lib/format.ts` — `formatAmount(value, currency)`,
`formatDate`, `formatDateTime`, `formatTime`, `dayLabel`, `relativeTime`,
`dueLabel`, `formatCompact`. Para asla `Number()` ile ekrana basılmaz.

**Veri:** Uydurma alan gösterme. Sunucuda karşılığı yoksa o satırı ekleme ve
şartnameye `[VERİ YOK]` notu düş. Uçlar `src/api/endpoints.ts` içinde.

**Yasak:** yeni `expo start` AÇMA (tek dev sunucusu zaten çalışıyor, süreç
limiti doluyor). Doğrulama yalnızca `npx tsc --noEmit` ve `npm test`.

**Dokunma:** `src/ui/*` (paylaşımlı, çakışır), `theme.config.js`, `global.css`,
`app.config.ts`, `package.json`. Ortak bileşende eksik varsa ekranında yerel
çözme — raporunda belirt.

---

## A · Ana Sayfa, Modüller, Bildirimler

### Ana Sayfa (`app/(tabs)/index.tsx`)
Tasarım: "Gösterge Paneli".
1. Üstte selamlama + kullanıcı adı (var).
2. **4'lü KPI ızgarası** `StatCard` ile, her kartta ikon + değer + etiket +
   trend oku: Açık Fırsatlar, Bu Ay Teklifler, Tahsilat, Sevkiyat.
   Şu an 6 kart var ve trend yok — `StatCard`+`StatGrid`'e geçir.
   Trend verisi sunucuda yoksa `trend` verme (uydurma).
3. **Satış Trendi** çizgi/alan grafiği (son 6 ay) — `react-native-gifted-charts`.
4. **Fırsat Aşama Özeti**: huni + "Dönüşüm Oranı %12". Veri:
   `reports.pipelineSummary()`.
5. **Üretim & Stok Durumu** kartı: Üretimdeki Sipariş / Kritik Stok Uyarısı /
   Stok Değeri — satırlar tıklanınca ilgili modüle gider.
6. **Bugünkü Görevler**: saatli liste (`calendar.events` bugün aralığı).
7. **Yaklaşan Etkinlikler** tek satır + ok.

### Modüller (`app/(tabs)/modules/index.tsx`)
Tasarımdaki 3'lü ızgara + grup başlıkları — yapıldı. Eksik: grup başlığının
sağında modül sayısı.

### Bildirimler (`app/(tabs)/notifications.tsx`)
Yapıldı. Eksik: üstte "Tümü ▾" açılır filtresi ve sağda "Tümünü Okundu İşaretle"
düğmesinin tasarımdaki kutulu hâli (şu an düz metin).

---

## B · CRM

### Firmalar (`modules/companies/index.tsx`)
1. `ScreenHeader` "Firmalar" + alt metin (var).
2. **`StatStrip`: Toplam / Müşteri / Tedarikçi / Tedarikçi+Müşteri / Rakip** —
   `companies.summary()` içindeki `byRelation` sayıları. ŞU AN YOK, ekle.
3. Filtre pilleri: Tümü / Müşteri / Tedarikçi / Tedarikçi+Müşteri / Rakip
   (`relationTypeCode`). Şu an durum filtresi var — tasarım ilişki tipine göre.
   İkisi de olsun: ilişki tipi üstte, durum ikinci satırda.
4. `SearchBar` + sağında filtre düğmesi.
5. Satır: logo/baş harf + ünvan + şehir + **iki rozet** (ilişki tipi, sektör) +
   sağda "Açık Fırsat 5" ya da "Cari Bakiye ₺125.430" ya da "Son Aktivite tarih".
   Şu an tek rozet var, sağ değer yok.

### Firma Detayı (`modules/companies/[id].tsx`)
1. Üstte kart: logo, ünvan, "Aktif" rozeti, Firma Türü / Şehir / Satış Temsilcisi.
2. **Dört eylem düğmesi**: Ara · E-posta · Haritada Gör · Diğer.
3. **`Tabs`: Genel · Aktivite · Teklifler · Cari · Belgeler.**
4. Genel sekmesi: İletişim Kişileri (`contacts.list({companyId})`), Son Teklifler
   (`quotes.list({companyId})`), **Finansal Özet 4 kutu** (Toplam Ciro / Toplam
   Alacak / Vade Geçmiş Alacak / Açık Teklif Tutarı →
   `GET /companies/:id/finance-summary`), İlgi Alanı/Ürünler.
Şu an sadece düz alan listesi var — sekmeler ve bu bloklar eksik.

### Kontaklar / Kontak Detayı
Liste yapıldı. Detayda `Tabs` (İletişim · Genel · Notlar · Aktiviteler) eksik.

### Fırsatlar (`modules/opportunities/index.tsx`)
1. **`StatStrip`: Toplam / Lead / Teklif / Görüşme / Kazanıldı / Kaybedildi.**
2. Liste satırı: kod (FIR-2025-0087) + firma + ürün + sağda tutar + iki rozet
   (risk/öncelik ve aşama) + altta "Sorumlu · Beklenen Kapanış: tarih".
3. Kanban: kolon başlıklarının üstünde yatay sayaç şeridi (Lead 12 · C 7 · B 9…).
   Kart: firma, ürün, tutar, risk rozeti, atanan kişi avatarı, altta ilerleme çubuğu.

### Fırsat Detayı (`modules/opportunities/[id].tsx`)
1. Üstte: aşama rozeti (açılır), başlık, fırsat kodu, sağda Tahmini Tutar + para birimi.
2. `InfoRows`: Firma / İletişim / Sorumlu / Oluşturulma.
3. **8'li modül ızgarası**: Aktiviteler · Teklifler · Proforma · Stok · Finans ·
   Sevkiyat · Kurulum · Notlar (rozetli sayılar). Karşılığı olmayan kutu koyma.
4. **Fırsat Kontrol Listesi** + `ProgressBar` ("3/6 Tamamlandı") —
   `qualificationReadiness` / `processChecks` alanları.
5. **Sonraki Aksiyon** kartı.

---

## C · Satış ve belgeler

### Teklifler (`modules/quotes/index.tsx`)
1. Filtre pilleri: Tümü / Taslak / Gönderilen / Takip / Onaylı / Red-İptal.
2. **Özet kartı**: "Bu Ay · Toplam Teklif Tutarı ₺2.450.000 ↑%18,6" + mini alan grafiği.
   Yüklenen kayıtlardan hesapla, yoksa gösterme.
3. Satır: TEK-2025-0054 + firma + sağda tutar + durum rozeti + tarih. (Yakın, sağ üst rozet + altta tarih düzenini tasarıma göre ayarla.)

### Teklif Detayı
Yapıldı; eksik: `Tabs` (Genel · Ürünler · Koşullar · Belgeler), altta
**Paylaş / PDF İndir** düğme çifti (`GET /quotes/:id` + `generate-pdf`).

### Satış Siparişleri / Satın Alma
Yapıldı. Eksik: satırda "Rezervasyonlu / Stoktan" ikinci rozeti (satış),
"Onay Bekliyor" vurgusu (satın alma).

### Ticari Belgeler (`modules/documents/index.tsx`)
Yapıldı (segment: Proforma/Sözleşme/Fatura). Eksik: satırda belge tipi rozeti +
dosya boyutu/PDF ikonu, ve "Yeni Belge Yükle" FAB'ı — **yükleme ucu
`files.signed-upload-url`; kapsam dışıysa FAB koyma.**

### Fiyat Listeleri
Yapıldı (Liste/Peşin/Kampanya kolonları). Eksik: üstte "Aktif Fiyat Listesi" +
"Toplam Ürün" iki kutulu şerit (`StatStrip`).

---

## D · Operasyon

### Servis Talepleri (`modules/service-tickets/index.tsx`)
1. Filtre: Tümü / Açık / Devam Eden / Tamamlanan + ikinci satırda SLA ve sıralama.
2. Satır: SRV-2025-0156 + firma + şehir + makine + sağda öncelik rozeti ve durum +
   tarih/saat. Makine adı `customerDeviceId` üzerinden — **[VERİ YOK]: liste ucu
   makine adını döndürmüyor, yalnız id.**
3. Ayrıca **Servis Kanban** görünümü (Açık/Yolda/Yerinde/Tamamlandı kolonları) —
   liste ile aynı ekranda görünüm değiştirici, Fırsatlar'daki desenin aynısı.

### Servis Talep Detayı
1. Üstte kod + "Acil" rozeti + sağda durum.
2. `InfoRows`: Müşteri / Makine / Konu / Talep Tarihi / SLA Bitişi (geri sayım) /
   Durum / Atanan Teknisyen.
3. `Tabs`: Genel · İşlemler · Parçalar · Notlar.
4. **`StepTrack`**: Talep Alındı → Planlandı → Yolda → Yerinde → Tamamlandı.
5. Arıza Açıklaması ve **Kontrol Listesi** kartları yan yana.
6. Ekli Parçalar/Görevler listesi.
7. Altta: Müşteriyi Ara · Planla · Talebi Tamamla.

### Kurulum / Sevkiyat / Bakım / Makine Parkı
Listeler yapıldı. Eksik:
- Kurulum satırında **4 adımlı ilerleme göstergesi** ("2/4") — `StepTrack` ya da `ProgressBar`.
- Sevkiyat detayında harita **[VERİ YOK/KAPSAM DIŞI]** — harita bileşeni Expo Go'yu
  bozar; mevcut dikey takip çizgisi kalsın.
- Makine Parkı satırında Kurulum / Garanti / Sonraki Bakım üç tarihi yan yana.

---

## E · Finans, Rapor, Takvim

### Tahsilatlar
Yapıldı (Vadesi Geçen / Yaklaşan / Tahsil Edilen bölümleri). Eksik: üstte
**Aylık Tahsilat Özeti** kartı (toplam + ↑%18 + son 6 ay grafiği).

### Ödemeler & Kasa
Yapıldı. Eksik: üç kutulu şerit tasarımda **Kasa Bakiyesi / Gelen / Giden**
biçiminde; şu an Gelen/Giden/Net. Kasa bakiyesi için **[VERİ YOK]** — uç yok,
mevcut hâli koru.

### Faturalar / Cari Rapor / Vade Takvimi
Yapıldı. Cari Rapor'da eksik: satırda yaşlandırma (aging) kovaları ve "Riskli"
filtresi (`customerBalances` içinde `aging` alanı var, kullan).

### Raporlar
Yapıldı ama tasarımdaki grafikler eksik: Satış Performansı (alan), Tahsilat
Trendi (bar), Servis Tamamlama (donut), Stok Durumu (pie). `gifted-charts`
`PieChart`/`BarChart`/`LineChart` kullan; veri yoksa kartı gösterme.

### Takvim
Ay ızgarası + gün listesi yapıldı. Eksik: gün hücrelerinde etkinlik tipine göre
**renkli nokta** (tek nokta yerine tipe göre renk), ve "Bugün · 14 Mayıs Çarşamba"
başlığının tasarımdaki biçimi.
