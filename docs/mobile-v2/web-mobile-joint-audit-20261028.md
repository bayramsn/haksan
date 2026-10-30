# Web ve Mobile v2 ortak veri denetimi — 28 Ekim 2026

Bu tur önceki mobil veri denetimini web tarafıyla tamamlar. Kapsam: kaynak kodu, veri sözleşmeleri, sorgu yaşam döngüsü, sayfalama, toplamlar ve otomatik regresyonlar. Üretim verisi yazılmadı; API/mağaza/OTA yayını yapılmadı.

## Kapatılan doğrulanmış eksikler

| Alan | Düzeltme |
|---|---|
| Web bölüm/departman/hak değişimi | Sadece header değiştirmek yerine cache temizliği ve hesap kapsamlı ekran/store yeniden oluşturma. Aynı anahtarlı eski QueryObserver yeni kapsamda yeniden sorgular. |
| Web ağ/refresh/store yarışı | Eski hesap/bölüm/departman yanıtları, kuyrukta bekleyen istekler, yavaş JSON ve refresh sonucu yeni bağlama geçemez. Store eski reload sonucunu yayımlamaz. |
| Web görev/onay/fuar | İlk 50/100 kayıt sınırları kaldırıldı; kayda bağlı görevler, bekleyen erişim talepleri ve fuar ekleri tüm sayfalardan okunur. |
| Web muhasebe faturaları | İlk 200 kayıtta kesilmez; filtreler ve hesap/bölüm/departman sorgu kimliğine dahildir. Eksik okuma başarı gibi gösterilmez. |
| Web vade takvimi | Eski ayın geç yanıtı yeni aya yazılamaz; API hatası açık hata/tekrar deneme gösterir. |
| Web cari rapor/ekstre | Ağ hatası “kayıt yok” değildir. Firma A'nın geciken ekstresi firma B'yi değiştiremez. Hatalı ekstre, sıfır hareket veya başarılı toplam gibi sunulmaz. |
| Web satın alma | Siparişler ilk 100'de, ürün seçicisi ilk 200'de kesilmez. Detay seçili sipariş sorgusuna bağlıdır. Karışık para birimleri USD diye toplanmaz; gerçek kaynağı olmayan sabit KPI değişim yüzdeleri kaldırıldı. |
| Web Meta içgörü/mesaj | İlk 100 satır sınırı kaldırıldı; tekrarlanan/bozuk veya başarısız sonraki sayfa kısmi başarı olarak sunulmaz. |
| Ortak Meta konuşma araması | Arama şemada düşürülmez. Backend konuşma kimliği/mesaj metnini arar; liste grupları, mesaj sayıları ve son mesaj sırası korunur. Tenant/bağlantı sınırları uygulanır. |
| Ortak Meta overview | Seçili bağlantı/tarih lead ve reklam içgörü sorgularına uygulanır. Nitelikli/dönüşen lead sayıları sunucuda hesaplanır; fırsat kaynak bölüm/departman yetkileri korunur. İlk yanıt süresi gibi hesaplanmayan alanlar sıfır yerine null/“—” gösterilir. |
| Ortak Meta Graph kampanya/yorum | Sabit 100/50 sınırları yerine cursor sayfalaması; gönderi yorumlarının sonraki sayfaları da okunur. Her seferinde sabit doğrulanmış Graph yolu kullanılır, upstream next URL'si izlenmez. İşlem başına 50 istek ve yeni istek başlatmadan önce 15 saniye sınırı vardır; sınır aşılırsa eksik liste başarılı gösterilmez. |
| Web/mobil Meta para birimleri | TRY+USD toplamı tek para birimiyle etiketlenmez; bilinmeyen/karışık para birimli harcama ve kaynağı olmayan kampanya KPI'ları “—” gösterilir. |
| Web test ortamı | Hoisted UI kütüphanelerinin mobil React 19'a çözülmesi düzeltildi. Vitest web React 18 ve browser ESM bağımlılıklarını kullanır. Üretim Vite çözümlemesi zaten doğruydu; gerçek Radix checkbox/dialog portalı ve lucide ile doğrulandı. |

## Yetki ve veri anlamı

Meta CRM lead metrikleri fırsat kaynak yetkileriyle bölüm/departman kapsamında hesaplanır. Reklam harcaması Meta okuma yetkisine sahip kullanıcının tenant reklam hesaplarından gelir; kayıtlarda CRM bölüm eşlemesi bulunmadığından reklam harcaması için CRM bölüm dağılımı varsayılmaz. Karışık para birimleri için dönüşüm yapılmaz. İlk yanıt süresini hesaplayacak kaynak henüz sağlanmadığından bu metrik bilinmiyor olarak gösterilir.

## Doğrulamanın sınırı

Bu rapor tüm gerçek kullanıcı/cihaz/üretim kombinasyonlarının geçtiği iddiası değildir. Canlı Meta hesabı, fiziksel Android/iPhone ve gerçek PostgreSQL ile uçtan uca senaryolar çalıştırılmadı. UI ve ağ yarışları yerel regresyonlarda, SQL/parametreler Drizzle üzerinden, Graph cursor davranışı kontrollü yanıtlarla doğrulandı. Mağaza paketleri ve API dağıtımı ayrıca yapılmalıdır.

Önceki çalışma ayrıntıları: `data-parity-audit-20261027.md`. Tekrarlanabilir mobil GET rota envanteri: `node scripts/audit-mobile-v2-read-routes.mjs`. Rota eşleşmesi yetki/gerçek veri/cihaz başarısı kanıtı değildir.

## Son doğrulama

- Mobil tüm test paketi: **531/531 geçti**.
- Web/mobil/API TypeScript kontrolleri geçti; shared build geçti.
- Odaklı API paketi (Meta + görüşme yardımcısı): **44/44 geçti**.
- Web üretim derlemesi geçti. Derleme, mevcut büyük chunk uyarısını raporlamaya devam ediyor.
- Gerçek Radix checkbox/dialog portalı, lucide, ürün diyaloğu ve lazer editörünün odaklı 17 testi geçti. Test ortamındaki React sürüm karışması giderildi.
- Tam web paketi son sıralı koşuda **726 geçti, 1 süre aşımı** verdi. `LaserConfigurationEditor.test.tsx` içindeki alan ekleme/adlandırma/gruplama/sıralama/silme testi 15 saniye sınırını aştı. Aynı dosyanın 8/8 testi tek başına geçti (bu senaryo yaklaşık 5 saniye). Zaman aşımı testi kaldırılmadı veya sınırı yükseltilmedi. Toplu koşudaki süre aşımının kesin nedeni çözülmedi; tam web test paketi yeşil olarak raporlanmıyor.
- Mobil rota denetimi: **215/215 kayıtlı GET çağrı noktası**, 0 çözümlenemeyen yol. Bu sayı tam ekran/gerçek veri sertifikası değildir.
