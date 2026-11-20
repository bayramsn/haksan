# Play Console yanıt hazırlığı

18 Kasım 2026. Bu kayıt konsola gönderim kanıtı değildir. Canlı sağlayıcı ve saklama bilgileri henüz kesinleşmediği için Veri güvenliği formu tamamlandı sayılmaz.

| Alan | Kaynağa dayalı yanıt / durum |
|---|---|
| Geliştirici kuruluş | Haksan Takım Tezgahları Makina Sanayi ve Ticaret Limited Şirketi; kamuya açık kurumsal KVKK metnindeki unvan. |
| Destek | info@haksanmakina.com.tr; işletme tarafından talepleri karşılayan adres olarak teyit edildi. |
| Reklam Kimliği | İncelenen kaynakta reklam SDK'sı ve önceki 15 paketinin manifestinde AD_ID yok. 16 paketinin manifesti ayrıca kontrol edilecek. Bu kanıtla reklam kimliği kullanılmadığı yanıtı hazırlanabilir. |
| Reklam içerme | İncelenen uygulama kaynaklarında reklam işlevi tespit edilmedi. Konsoldaki mevcut beyan görülmeden üzerine yazılmamalı. |
| Fotoğraf/video | Fotoğraf ekleri kullanıcı seçimiyle gönderilir. 16 kaynağı Android sistem fotoğraf seçicisini kullanır; geniş medya/depolama izinleri engellenir. Yeni paket manifesti doğrulanmadan izin beyanı kapatılmamalı. |
| Hesap oluşturma | Uygulamanın kayıt ekranı otomatik hesap oluşturmaz; ERP yöneticisine yönlendirir. Gerçek hesap açma ve dağıtım modeli değerlendirilmeden Google'ın hesap silme şartı kapsamında muafiyet varsayılmamalı. |
| Hesap işlemleri | Haksan ekibi e-posta talebi üzerine 3 gün içinde hesabı pasife alır, veriler saklanır. Kalıcı hesap/veri silme desteği sunulduğu işaretlenemez. |
| Veri toplama | Hesap, CRM kişi/iletişim, iş/finans, sohbet/ek ve kullanılan özelliğe göre konum/bildirim verileri sunucuya aktarılır. “Hiç veri toplanmıyor” seçilemez. |
| Üçüncü taraf paylaşımı | Hizmet sağlayıcıların rolleri ve Google tanımları değerlendirilmeden tüm veri kategorileri için “paylaşım yok” seçilemez. |
| Saklama | Verilerin saklandığı teyit edildi; kategorilere göre süre ve gerekçe henüz açıklanmadı. 3 gün veri saklama süresi değil, hesabı pasife alma süresidir. |
| Gizlilik URL'si | Kurumsal KVKK URL'si mevcut. Uygulamaya özel Google Sites bildirimi henüz yayımlanmadı. Taslakta eksik işletme bilgileri var. |
| İnceleme erişimi | Uygulama yetkili hesap gerektirir. Mevcut Play inceleme erişimi Chrome bağlantısı yeniden sağlanınca kontrol edilmeli. Parolalar bu dosyaya yazılmamalı. |
| Satıcı durumu / Hizmet Şartları | Konsoldaki güncel metin ve geliştirici hesabı beyanı incelenmeli. Hukuken bağlayıcı yeni şart kabulüyle karşılaşılırsa tam metin kullanıcıya gösterilmeli. |

Google kaynakları:

- [Veri güvenliği formu](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Hesap silme şartları](https://support.google.com/googleplay/android-developer/answer/13327111?hl=tr)

Üretim dağıtımına hazır onayı verilmedi. Önceki 1.5.0 (15) dahili test sürümü ile hazırlanan 1.5.0 (16) birbirinden ayrı takip edilmelidir.
