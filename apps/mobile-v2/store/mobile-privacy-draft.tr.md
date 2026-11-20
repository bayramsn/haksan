# HAKSAN Mobil — Gizlilik bildirimi taslağı

18 Kasım 2026 — İnceleme nüshası; henüz yayımlanmamıştır. Aşağıdaki işletme kararları tamamlanmadan Play Console'a nihai beyan olarak gönderilmemelidir.

## Uygulama ve sorumlu kuruluş

HAKSAN (`com.haksan.mobileapp`), yetkili kullanıcıların şirket CRM/ERP kayıtları üzerinde çalışmasını sağlar. Kuruluşun kamuya açık unvanı Haksan Takım Tezgahları Makina Sanayi ve Ticaret Limited Şirketi'dir. Kurumsal iletişim adresi info@haksanmakina.com.tr, telefon +90 212 567 33 31, adres Yenidoğan Mah. Eyüp Sultan Caddesi No:24 Bayrampaşa–İstanbul'dur.

Şirketin mevcut [kurumsal KVKK aydınlatma metni](https://www.haksancnc.com.tr/blog-kisiselverilerinkorunmasihakkindabilgilendirme-104) ayrıca incelenebilir. Bu taslak mobil uygulamanın kaynak kodundaki veri akışlarını açıklar.

## Hangi bilgiler kullanılır?

- Hesap kimliği, ad ve e-posta: oturum açma, yetkilendirme ve hesap işlemleri için kullanılır. Uygulama içindeki kayıt ekranı kullanıcıyı hesap açılması için ERP yöneticisine yönlendirir.
- Kullanıcının yetkileri kapsamında açtığı veya kaydettiği firma, kişi, iletişim, adres ve not kayıtları: müşteri ilişkileri ve iş süreçleri için CRM sunucusunda işlenir. Cihaz rehberini okuyan bir işlev tespit edilmemiştir.
- Teklif, fatura, ödeme, servis, görev ve randevu bilgileri: ilgili iş akışlarını yürütmek için kullanılır.
- Sohbet mesajları ve seçilen dosya/fotoğraflar: ilgili görüşme ve iş kaydına iletilir. Android izin düzeltmesi sistem fotoğraf seçicisiyle yalnız seçilen görsele erişir; bu değişiklik henüz yeni mağaza paketine aktarılmamıştır.
- Kullanıcının başlattığı konum işlevleri: yakın firmaları göstermek, firma koordinatı kaydetmek veya konum göndermek için konum bilgisi kullanılabilir. Konum gönderilen/kaydedilen işlemlerde sunucuya aktarılabilir.
- Bildirim izni verildiğinde bildirim belirteci: bildirim göndermek için sunucuya kaydedilir. Expo Push üzerinden etiketleme bildirimi gönderilirken mesajın ilk 200 karakteri bildirim içeriğine girebilir.
- Sesli/görüntülü görüşme: kullanıcı görüşmeyi başlattığında kamera ve mikrofon kullanılır. Kaynak kodda görüşme kaydı işlevi tespit edilmemiştir; üretim hizmetlerinin uygulaması ayrıca doğrulanmalıdır.

## İzinler ve tercihler

Kamera fotoğraf çekme, QR/barkod tarama ve görüntülü görüşme; mikrofon görüşme; konum ilgili harita ve konum işlemleri; bildirim izni bildirim alma amacıyla kullanılır. Kullanıcı izinleri cihaz ayarlarından değiştirebilir. İlgili izin reddedilirse o izne bağlı özellik kullanılamayabilir. Reklam kimliği kullanan bir SDK veya AD_ID izni incelenen Android 15 paketinde tespit edilmemiştir.

## Aktarım ve hizmetler

CRM/ERP verileri yapılandırılmış şirket API'sine gönderilir. Üretim mobil API istemcisi HTTPS gerektirir. Kodda Expo Push ve görüşme bağlantısı için Google STUN yapılandırması vardır; TURN isteğe bağlıdır. Dosya depolaması birden fazla sağlayıcıyı destekler. Canlı depolama sağlayıcısı, bölgesi ve alt işleyen listesi henüz doğrulanmamıştır. Sentry koşullu yapılandırılır; incelenen 15 derlemesinde DSN etkinliği bulunmamıştır.

**Tamamlanacak:** Üretimde kullanılan depolama, bildirim, harita, görüşme ve e-posta sağlayıcıları; alıcı rolleri; bölgeler ve aktarım düzenlemeleri. Bu bölüm tamamlanmadan tüm veriler için "paylaşım yok" beyanı verilemez.

## Hesabın pasife alınması ve verilerin saklanması

Hesabı pasife alma talepleri Haksan ekibi tarafından info@haksanmakina.com.tr adresinde karşılanır. Talep alındıktan sonra hesap 3 gün içinde pasife alınır; hesap ve ilişkili veriler saklanır. Bu işlem kalıcı hesap veya veri silme değildir. Uygulamada Ayarlar → Hesabımı pasife al, bu adrese “Hesabı pasife alma talebi” konulu bir e-posta taslağı açar. Talep kullanıcı tarafından gönderilir; düğme kendi başına hesabı kapatmaz. Uygulamaya giriş yapılamıyorsa aynı adrese doğrudan e-posta gönderilebilir. Parola veya kimlik belgesi talep e-postasına eklenmemelidir.

Yönetici panelindeki kullanıcı silme işlemi hesabı pasife alır ve oturumları iptal eder. Kimlik alanlarını, bağlı iş kayıtlarını ve yedekleri kalıcı olarak temizleyen tamamlanmış bir otomatik süreç kaynak kodda tespit edilmemiştir.

**18 Kasım 2026 işletme teyidi:** Talep kanalı info@haksanmakina.com.tr, sorumlu Haksan ekibi, pasife alma süresi 3 gün; veriler saklanır. Kalıcı veri silme hizmeti sunulduğu beyan edilmemelidir.

**Tamamlanacak:** Kimlik doğrulama yöntemi; saklanan kayıtların kategorisi, gerekçesi ve süresi; yedeklerin yaşam döngüsü. Yerel yedek betiğindeki 7 günlük değer, canlı sistemde veri silme taahhüdü değildir. Google Play hesap/veri silme şartının bu hesap açma ve dağıtım modeline uygulanması ayrıca değerlendirilmelidir; pasife alma kalıcı silme yerine sunulamaz.

## Yayınlanacak Google Sites sayfaları

1. Gizlilik Politikası: onaylanan bu metin; herkes tarafından, giriş yapmadan erişilebilir.
2. Hesap İşlemleri: pasife alma başvuru kanalı, adımları ve 3 günlük süre; verilerin saklandığı açıkça belirtilir. Bu sayfa kalıcı veri silme kaynağı olarak beyan edilmez.
3. Destek: doğrulanmış işletme iletişimi ve uygulama destek yönlendirmesi.

Google Sites editöründe “HAKSAN Mobil – Gizlilik ve Destek” belgesi açılmıştır. Tarayıcı bağlantısı kesildiği için gövde metni ve yayın henüz tamamlanmamıştır.
