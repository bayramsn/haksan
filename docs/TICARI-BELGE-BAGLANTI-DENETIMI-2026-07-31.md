# Ticari Belge Bağlantı Denetimi

Tarih: 31 Temmuz 2026

## Amaç

Teklif, proforma, sözleşme, ticari fatura, muhasebe faturası ve saha belgelerinin arayüzde bağımsız PDF kutuları gibi kalmasını önlemek; her belgeyi üretildiği gerçek firma, fırsat ve kaynak teklif revizyonuyla izlenebilir hale getirmek.

## Doğrulanan veri omurgası

| Kayıt | Birincil kaynak | Devam ilişkisi | Dosya alanı |
|---|---|---|---|
| Teklif | Fırsat + firma | Proforma, sözleşme, ticari fatura, satış siparişi | Yazdırılabilir canlı çıktı |
| Proforma | `quoteId` zorunlu | Teklif revizyonu | Opsiyonel `fileId` + değişmez snapshot |
| Sözleşme | `quoteId` zorunlu | Teklif revizyonu | Opsiyonel `fileId` + değişmez snapshot |
| Ticari fatura | `quoteId` zorunlu | Teklif revizyonu | Opsiyonel `fileId` + değişmez snapshot |
| Muhasebe faturası | Firma; opsiyonel teklif ve satış siparişi | Taksit, alacak/borç ve ödeme | Opsiyonel `fileId` |
| Sevkiyat | Firma; opsiyonel fırsat, teklif ve satış siparişi | İrsaliye ve teslim | Canlı sevk çıktısı |
| Kurulum | Firma; opsiyonel fırsat ve teklif | Kurulum formu ve cihaz | Canlı form verisi |

Sonuç: Ticari PDF zincirinin doğru kökü firma değil, teklif revizyonudur. Firma ve fırsat teklif üzerinden çözülebilir; yalnız firma bağlantısı revizyon izlenebilirliği sağlamaz.

## Yüzey envanteri ve karar

| Yüzey | Önceki sorun | Yeni rol |
|---|---|---|
| Fırsat kartı | Ticari PDF'ler genel eklerle karışıyor ve kayboluyordu | Dört adımlı kompakt belge zinciri; eksik adımda doğrudan aksiyon |
| Fırsat hızlı paneli | Belgeler bağlamsız sayaç/ek gibi görünüyordu | Salt okunur zincir ve tam çalışma alanına geçiş |
| Fırsat çalışma alanı | Proforma/sözleşme/fatura ayrı buton kümeleriydi | Kaynak teklif revizyonunu gösteren tam belge rotası |
| Teklif detayı | Proforma ve sözleşme butonları footer'da havada kalıyordu | Teklif revizyonlarıyla aynı panelde belge zinciri; eksik adım kendi düğümünde |
| Proformalar menüsü | Dokümanlar sayfasının filtrelenmiş kopyasıydı | Görünür navigasyondan kaldırıldı; eski kalıcı seçim Belge Merkezi'ne yönlenir |
| Sözleşmeler menüsü | Dokümanlar sayfasının filtrelenmiş kopyasıydı | Görünür navigasyondan kaldırıldı; eski kalıcı seçim Belge Merkezi'ne yönlenir |
| Dokümanlar | Dosya deposu görünümündeydi; kaynak kayıtlar tıklanamıyordu | Tek “Ticari Belge Merkezi”; teklif–proforma–sözleşme–fatura rotası ve kaynak bağlantıları |
| Belge detayı | Gerçek içerik vardı fakat kaynağa dönüş yoktu | Teklif, fırsat ve firma düğmeleri eklendi |
| Belge yükleme | Ticari PDF yalnız firma/fırsata bağlanabiliyor, `quoteId` boş kalıyordu | Proforma, sözleşme ve ticari faturada kaynak teklif revizyonu zorunlu; gerçek ticari kayıt oluşturulur |
| Eski yüklemeler | Önceden yüklenmiş ticari PDF teklif revizyonuna taşınamıyordu | “Bağlantıyı tamamla” ile mevcut dosya seçilen teklife bağlanır |

## Bilinçli olarak ayrı kalan modüller

- Muhasebe Faturaları ayrı kalır; çünkü ödeme planı, cari hareket ve vergi/muhasebe işlemleri PDF arşivinden farklı bir iş akışıdır. Belge Merkezi bu kaydın dosya çıktısını gösterir, finans kaydının yerine geçmez.
- Ödemeler & Kasa ayrı kalır; belge ekleri ödeme detayında ilgili firma/fırsat üzerinden gösterilir. Belge, ödeme kaydının kendisi değildir.
- Sevkiyat ve Kurulum ayrı operasyon ekranlarıdır. Ürettikleri irsaliye/teslim/kurulum çıktıları Belge Merkezi'nde arşiv görünümü olarak bulunur; canlı durum değişikliği kendi kaynak ekranında yapılır.
- Dış teklifler Teklifler ekranında satış girdisi olarak, Belge Merkezi'nde ise dosya arşivi olarak görünür. Bu iki görünüm aynı kaydın farklı bağlamlardaki projeksiyonudur; ikinci bir veri kaydı değildir.

## Boşta kayıt denetimi

Belge Merkezi aşağıdaki durumları artık görünür biçimde sınıflandırır:

- `Teklife doğrudan bağlı`: `quoteId` mevcut ve teklif bulunuyor.
- `Fırsattan eşleştirildi`: belge fırsata bağlı fakat eski kayıtta teklif bağlantısı yok.
- `Firma kaydına bağlı`: genel dosya; ticari zincirin bir adımı değildir.
- `Kasa hareketine bağlı`: ödeme detayından eklenen fiş/fatura; ödeme kimliğiyle kasa ekranına geri açılır ve ticari zincirde yanlışlıkla teklif belgesi sayılmaz.
- `Servis talebine bağlı`: servis kartına eklenen dosya; servis talebi kaynağına geri açılır.
- `Canlı saha kaydı`: teslim veya kurulum verisinden üretilen çıktı.
- `Bağlantı gerekli`: hiçbir kaynak bulunmayan kayıt; ticari PDF ise satırdan onarılabilir.

Üst denetim sayaçları toplam kayıt, kaynağa bağlı kayıt, teklife doğrudan bağlı kayıt ve bağlantısı incelenecek ticari belge sayılarını ayrı gösterir.

## Kabul ölçütleri

- Teklif, proforma, sözleşme ve ticari fatura aynı fırsat üzerinde tek zincirde görünür.
- Zincir her zaman en yeni teklif revizyonunu ana kaynak seçer; eski revizyon belgelerini sayıda ve kaynak metninde kaybetmez.
- Yeni ticari PDF yüklenirken teklif revizyonu seçilmeden kayıt tamamlanamaz.
- Eski bağlantısız ticari PDF yeniden yüklenmeden bir teklif revizyonuna bağlanabilir.
- Belge tablosundan firma, fırsat ve teklif gerçek ekranlarına geçilebilir.
- Genel ek görselleri ile ticari belgeler fırsat kartında mükerrer gösterilmez.
- Proforma ve Sözleşme için ayrı, tekrarlı navigasyon alanı bulunmaz.
- Filtre sonucu boşsa kullanıcı çıkmazda kalmaz; filtre temizleme, belge oluşturma veya kaynağa bağlı yükleme aksiyonu görür.

## Teknik doğrulama

- Saf belge zinciri modeli birim testleri: son revizyon seçimi, eksik/kilitli adımlar ve tüm adımların hazır olması.
- Yükleme kaynak testi: ticari PDF tiplerinde zorunlu teklif seçimi ve gerçek ticari kayıt üretimi.
- Web üretim derlemesi ve birim test paketi teslim öncesi çalıştırılır.
