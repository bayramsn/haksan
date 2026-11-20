# Haksan Mobile 1.5.0 Android veri güvenliği incelemesi

Bu çalışma dosyası, Google Play Veri güvenliği formu ve uygulamaya özel gizlilik bildirimi için kaynak koddan doğrulanan işlevleri listeler. Üretim servisleri, saklama süreleri ve üçüncü taraf ilişkileri teyit edildikten sonra mağaza beyanı hazırlanabilir.

| Veri | Android uygulamasında kullanım | Mağaza beyanı için doğrulanacak bilgi |
|---|---|---|
| Hesap ve e-posta | Oturum açma ve parola kurtarma CRM sunucusuna istek gönderir. Kayıt ekranı hesap oluşturmak için ERP yöneticisine yönlendirir. | Hesap açma ve silme işlemlerinin nasıl yürütüldüğü ve kimlik verisinin saklama süresi. |
| Firma ve kişi kayıtları | Kullanıcılar CRM'e ad, iletişim bilgileri, adres ve not girebilir. | Kişi verisinin aktarımı, saklanması ve silinmesi ile ilgili şirket uygulaması. |
| İş ve finans kayıtları | Fatura, ödeme, teklif, görev ve randevular yetkili CRM hesaplarında görüntülenir veya kaydedilir. | Sunucunun finansal veri kapsamı, saklama süreleri ve servis sağlayıcıları. |
| Sohbet, dosya ve görseller | Sohbet içeriği ile kullanıcının seçtiği ekler gönderilebilir. Sesli ve görüntülü görüşmede mikrofon ve kamera kullanılabilir. | Dosya depolama ve arama altyapısı, görüşmenin kaydedilip kaydedilmediği, aktarım, erişim ve silme süreleri. |
| Konum | Kullanıcı konum gönderebilir, firma konumunu kaydedebilir ve yakın firmaları sorgulayabilir. | Kesin konumun hangi olaylarda sunucuda saklandığı, saklama süresi ve Maps SDK kullanımı. |
| Bildirim ve tanılama | İzin verilirse uygulama bildirim belirtecini kaydeder. Expo Push, grup sohbetinde kullanıcı etiketlendiğinde mesajın ilk 200 karakterini içerebilir. Sentry, DSN yapılandırıldığında hata ve performans verisi alabilir. | Yayın paketinde etkin SDK’lar, servis sağlayıcılarının rolleri, tanılama kapsamı ve veri silme süreci. |

## Yayın öncesi doğrulama

- Hesabı pasife alma talebi kaynak kodda `info@haksanmakina.com.tr` adresine yönlendirilir. İşletme 18 Kasım 2026 tarihinde talepleri bu adresten karşıladığını, hesabın 3 gün içinde pasife alındığını ve verilerin saklandığını teyit etti. Kalıcı hesap/veri silme sunulduğu beyan edilmemelidir. Saklama gerekçeleri, süreleri, yedeklerin yaşam döngüsü ve herkese açık hesap işlemleri sayfası henüz tamamlanmadı. Bu değişiklik henüz yeni mağaza paketine aktarılmadı.
- Üretim CRM API istemcisi HTTPS gerektirir. Tüm aktarımın şifreli olduğunu beyan etmeden önce dosya depolama URL’lerini, medya aktarımını ve üçüncü taraf SDK’ları doğrulayın.
- Şirketin [ana sitesi](https://www.haksanmakina.com.tr/) ve [iletişim sayfası](https://www.haksanmakina.com.tr/?i%2Filetisim.html=) pazarlama ve destek bağlantıları için adaydır. Uygulamaya özel gizlilik bildirimi, mobil veri işleme kapsamını ayrıca açıklamalıdır.
- Harici servislerin hangi verileri işlediğini ve Google Play'in hizmet sağlayıcı ölçütlerini karşılayıp karşılamadığını doğrulamadan veri paylaşımı sorusunu yanıtlamayın. [Google Play Veri güvenliği formu](https://support.google.com/googleplay/android-developer/answer/10787469)
