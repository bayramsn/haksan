# Haksan Web CRM — Görsel Sistem

## Ürün bağlamı

- **Ürün:** Haksan satış, operasyon, servis, finans ve yönetim ekiplerinin kullandığı web CRM.
- **Hedef:** Kurumsal, ciddi, güvenilir ve premium; veri yoğunluğunu kaybetmeden hızlı taranabilen bir çalışma alanı.
- **Kapsam:** `apps/web` render ve stil katmanı. Native mobil, API, veri modeli, iş kuralları ve PDF çıktıları kapsam dışıdır.
- **Unutulmaması gereken his:** Haksan'ın kendi renkleriyle çalışan, ağırbaşlı ve güvenilir bir endüstriyel operasyon yazılımı.

## Değişmez davranış sözleşmesi

- Navigasyon sırası, görünürlük ve izin kararları değişmez.
- API URL'leri, istek gövdeleri, sorgular, hesaplamalar ve kayıt sonuçları değişmez.
- PDF, teklif, proforma ve sözleşme üretim kodu ile baskı stilleri değiştirilmez.
- C/B/A/A+/WIN satış dereceleri korunur; eski sıcak/soğuk/beklemede alanı geri getirilmez.
- Kompakt/rahat görünüm ve mevcut localStorage anahtarları korunur.

## Renk

| Rol | Değer | Kullanım |
|---|---|---|
| Ana marka | `#000c69` | Birincil aksiyon, seçili durum, güçlü vurgu |
| Marka kırmızısı | `#cf060c` | Marka detayı ve destructive durumlar |
| Ana metin | `#18202a` | Başlık ve gövde metni |
| Tuval | `#f4f6f8` | Uygulama zemini |
| Yüzey | `#ffffff` | Çalışma alanları, menüler ve yükseltilmiş katmanlar |

- Marka kırmızısı dekoratif olarak sınırlı kullanılır; başarı/uyarı/bilgi renklerinin yerine geçmez.
- Sayfa kodunda yeni sabit hex değeri kullanılmaz. Tüm renkler `theme.css` semantik tokenlarından gelir.
- Gölgeler lacivert tonlu ve düşük kontrastlıdır; katman veya tıklanabilirlik anlatmıyorsa kullanılmaz.

## Tipografi

- **Başlık:** Barlow Condensed, 600–700.
- **Gövde/UI:** Inter Variable, 400–600.
- **Veri:** mevcut monospace veri ailesi, `tabular-nums` ve `slashed-zero`.
- Normal gövde 14 px, açıklama ve metadata en az 12 px'tir.
- Büyük başlıklarda sıkı tracking; küçük etiketlerde ölçülü pozitif tracking kullanılır.
- Paragraflar `text-wrap: pretty`, kısa başlıklar `text-wrap: balance` kullanır.

## Boyut, boşluk ve yoğunluk

- Taban ölçek: 4, 8, 12, 16, 24, 32 px.
- Kontrol köşesi 6 px, yüzey 8 px, dialog/sheet 12 px.
- Masaüstü kontroller 36–40 px; mobil etkileşim hedefleri en az 44 px.
- Rahat tablo satırı 44–48 px, kompakt satır 36–40 px.
- Masaüstü veri yoğunluğu korunur; mobilde tablo küçültülmez, öncelikli alanlı kayıt satırına dönüşür.

## Yerleşim hiyerarşisi

Her sayfa şu sırayı kullanır:

1. `PageHeader`: konum, başlık, kısa açıklama ve ana aksiyon.
2. İsteğe bağlı `KpiStrip`: yalnız karar vermeyi hızlandıran sayılar.
3. `PageToolbar`: arama, filtre, görünüm ve dışa aktarma.
4. `DataViewFrame`: liste, tablo, Kanban veya ana çalışma alanı.
5. İsteğe bağlı `StickyActionBar`: uzun form ve mobil çalışma alanı aksiyonları.

Kart yalnız bağımsız bir özet veya etkileşim alanıysa kullanılır. Büyük beyaz kart mozaikleri yerine bölüm, ayırıcı ve yüzey hiyerarşisi tercih edilir.

## Etkileşim ve durumlar

- Standart geçiş 150 ms, büyük yüzey girişi en fazla 180 ms.
- Animasyon yalnız `opacity` ve `transform` kullanır.
- `prefers-reduced-motion` animasyon ve smooth scroll davranışını kapatır.
- Her veri yüzeyi loading, empty, error, success ve partial durumlarını tanımlar.
- Klavye odağı her zaman görünür; dialog kapandığında odak tetikleyiciye döner.

## Responsive sözleşme

- Masaüstü: sidebar + topbar + veri yoğun çalışma alanı.
- Tablet: daraltılmış kabuk, kontrollü yatay veri yüzeyleri ve önceliklendirilmiş toolbar.
- Mobil: Sheet navigasyon, tek sütun içerik, kayıt satırları ve en az 44 px aksiyonlar.
- Hiçbir ana sayfa viewport seviyesinde yatay taşma üretmez.

## Kaynak politikası

- Ana temel mevcut shadcn/ui + Radix bileşenleridir.
- Origin UI yalnız kaynak kodu incelenip Haksan tokenlarına uyarlandıktan sonra kullanılabilir.
- Mevcut çekirdek bileşenlerin CLI ile toplu üzerine yazılması yasaktır.
- Yeni production UI veya animasyon paketi eklenmez.

## Geri dönüş noktası

- Git tag: `ui-before-modernization-20260811-f6f4da50`
- Başlangıç commit: `f6f4da50114fab2cefdb1283e00a9cef079a6445`
- Web image: `866490183348.dkr.ecr.eu-central-1.amazonaws.com/haksan/web@sha256:ed123cf8d902c1fae33808e0a10b67f072128b49f65e380a52b3a9daecc89e1f`
- API image: `866490183348.dkr.ecr.eu-central-1.amazonaws.com/haksan/api@sha256:d4e41834a876bb7e6d6af6d500bc2dbcf2197129611b943e89a5bcdd65566710`
