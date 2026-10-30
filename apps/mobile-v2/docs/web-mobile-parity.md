# Web → mobil alan karşılaştırması

2026-10-23. Referans: çalışma ağacındaki apps/web ve apps/api kaynakları.
Web/backend dosyaları bu çalışma kapsamında değiştirilmedi. Üretim yazımı yapılmadı.

| Web kaynağı | Mobil karşılığı | Giderilen fark |
|---|---|---|
| dialogs/QuoteDialog.tsx | modal/quote-form.tsx, QuoteItemsEditor | Bağımsız KDV hesapla; firma değiştirme; fırsat makine/miktar/para birimi aktarımı; CRM firma ve PDF adresi düzenleme |
| pages/SalesCaseDetail.tsx | modal/opportunity-edit.tsx | Tahmini tutarı temizleme; makinesiz ticari kayıt düzenleme; ödeme biçimi ve altı nitelendirme alanı |
| QualificationKanban, ProcessChecklistPanel | QualificationBoard, fırsat Süreç sekmesi | İleri taşımada hedef alanla görev ekranı; firma/kontak bağlama; fırsata bağlı arama/ziyaret; manuel durum ve gerekçe |
| OpportunityStockPickerDialog | modal/opportunity-stock.tsx | Çoklu seri seçimi; müsait / aynı firmaya rezerve stok; atomik stock_picking geçişi |
| Fırsata bağlı sevkiyat / kurulum | modal/opportunity-operations.tsx, shipment-new.tsx | Tüm sayfalarda fırsata bağlı kayıt bulma; mevcut kaydı tamamlama; yeni kayıt fırsat bağlantısı |
| CRM kontak, firma ve müşteri makineleri | CRM / şirket / operasyon liste hook'ları | Aynı API kayıtları ve açılışta güncelleme; arama ve sayfalama korunur |
| dialogs/DocumentTermsTemplateEditor.tsx | TermsTemplatePicker, LinkedDocumentForm, QuickDocumentForm | Aynı quote_terms/proforma_terms/contract_terms kayıtlarını seçme, kaydetme, güncelleme ve silme |
| pages/purchase/PurchaseOrdersPage.tsx | features/order-detail-screen.tsx | Önceki vade, vade notu; kalem liste/olur fiyatı ve iskonto |
| pages/payments ve finans formları | finance-record-detail-screen, new-receivable | Ödeme/tahsilat ayrımı; bağlı alacak/teklif; yöntem ve belge referansı |
| pages/SalesCaseDetail ödeme planı | modal/payment-plan.tsx | Çek/senet kimliği, banka, şube, hesap sahibi/borçlu; taksit yeniden hesaplanınca girilmiş belge bilgilerinin korunması |
| CreateDialogs servis talebi | modal/new-ticket.tsx | Teklif gereksinimi; kontak/firma iletişim önizlemesi; başka firmanın makinesini seçince firma ilişkisinin güncellenmesi |
| pages/tasks/TaskFormDialog.tsx | modal/task.tsx | Firma seçmeden CRM kontağı seçebilme |
| reports/ActivityLogReportCard.tsx | ActivityLogSection, activity-log-share | Paylaşımda kişi, sonuç, takip, hedef, teklif ve gelecek hafta planı ayrıntıları; dahil 366 gün ve gerçek takvim günü doğrulama |
| mail/ComposeMailDialog.tsx | modal/mail-compose.tsx | Aynı mail şablon kütüphanesi; fırsata bağlı dosya ekleri ve 5 dosya/15 MB sınırı |

Kontak detayları ve firma ilişkileri, firma filtreleri/adres/iletişim,
fırsat aşama/sonuç/arşiv/sorumlu, servis garanti/RMA/parça/işçilik,
kurulum tutanağı, makine sahipliği/QR ve bakım işlemlerinin mevcut mobil
karşılıkları da incelendi.

## Doğrulamanın sınırı

Kaynak ve veri sözleşmesi karşılaştırmasıdır; tüm web davranışlarının native
cihazda birebir eşit olduğuna dair sertifika değildir. Bu turun native ekran ve
etkileşim doğrulaması tamamlanmadı. Webin tarayıcıda ürettiği baskı/PDF, zengin
metin editörü, gömülü görselli üretilmiş mail ekleri ve masaüstü toplu işlem
akışlarının tümü bu alan düzeltmeleriyle eşitlenmiş sayılmaz. Mobil mevcut
PDF dosyalarını açma/paylaşma akışını korur. Lazer teknik konfigürasyonunun webdeki
tüm yeni ürün ailesi akışları ayrıca uçtan uca doğrulanmalıdır.
