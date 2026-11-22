# Mobil işlev denetimi — 4 Kasım 2026

## Kapsam ve canlı sistem sınırı

Referans, AWS'de yayımlanan Haksan ERP web uygulamasıdır. Canlı webde Fırsat Kanbanı, Kontaklar, Yeni Kontak, Teklifler, Yeni Teklif, Ürünler ve ürün detayı salt okunur incelendi. Açılan oluşturma pencereleri kaydedilmeden kapatıldı. Canlı CRM kaydı, ayar, web kaynağı veya API kaynağı bu denetimde değiştirilmedi; yayın yapılmadı. Çalışma ağacında daha önce var olan API değişiklikleri bu ifadenin kapsamı dışındadır.

Yazma testleri yalnız bu iş için oluşturulan yerel PostgreSQL veritabanlarında yapıldı. Mobil arayüz Expo Web üzerinden `localhost:8085`, yerel test API'si `localhost:3039` ile sınandı. Arayüz testi önceden derlenmiş yerel API çıktısını kullanır; API test paketi ise çalışma ağacındaki API kaynaklarını kullanır. Bu nedenle sonuçlar canlı AWS sürümünün tüm davranışlarını sertifikalandırmaz.

## Düzeltilen mobil eksikler

- Sözleşme düzenlemede sunucunun `documentSnapshot.receivables` alanındaki taksitler yüklenir; eski `installments` biçimi için geri uyumluluk korunur. Tüm taksitler kaldırılıp kaydedildiğinde boş dizi gönderilir; eski ödeme planı yanlışlıkla korunmaz.
- Hızlı belge formunda firma değişince önceki firmanın kontak adı ve telefonu temizlenir. Form yüklenmeden veya kayıt sürerken tekrar gönderim engellenir.
- Stok oluşturma, sipariş rezervasyonu, tekliften sipariş, sipariş karşılama, sevkiyat ve teslimat işlemlerinden sonra ilgili stok/özet/sevkiyat sorguları geçersizleştirilir.
- Firma detayındaki kontak, görev, aktivite, teklif, fırsat, makine ve finans alt sorguları ilgili okuma izniyle sınırlandırılır. Elle yenileme de aynı kontrolleri uygular. Yetki olmayan özetlerde bekleyen sorgu yerine açıklama gösterilir.
- Bakım periyodu 1–3650 tam gün aralığında doğrulanır. 30 Şubat gibi imkânsız tarihler başka güne normalize edilerek gönderilmez.
- Kontakta iletişim verisi yoksa alan etiketleri ve boş değer işareti görünür; boş kart oluşmaz.
- Modül açma ve favori düğmeleri ayrı etkileşim alanlarıdır; iç içe HTML düğmesi sorunu kaldırıldı.
- Şikayet Kutusu, ortak web yetki alanını korurken kendi menü başlığıyla gösterilir; Servis Talepleri ile karışmaz.
- Kayıt formlarının detay ekranına dönüşünde açıldıkları sekme korunur. Ortak hedef çözümleyici Expo kök sarmalayıcısını ve modal altındaki son sekme yığınını dikkate alır. Firma, kontak, fırsat, teklif, aktivite, ödeme, sipariş, sevkiyat, makine, muhasebe faturası ve ticari belge kaydetme hedeflerine uygulanmıştır.
- Modüller'den başka sekmeye geçip geri dönüldüğünde katalog açılır. Kök form pencerelerinin açılması aynı sıfırlamayı tetiklemez. İlk açılıştaki doğrudan kayıt bağlantısı korunur.

## Gerçekte çalıştırılan arayüz kontrolleri

41 katalog girişinin tamamı açıldı ve ekran başlığı/veri veya boş durumunun yüklenmesi kontrol edildi. Bu kontrol her alt düğmeye basıldığı anlamına gelmez.

| Alan | Etkileşim kanıtı |
|---|---|
| Kontak | Yeni form → CRM firması seç → kontak oluştur → detay aç → Genel/İletişim sekmeleri; kayıt ve firma ilişkisi görüldü |
| Teklif doğrulama | Firma/kalem eksik gönderim engellendi ve alan hataları görüldü |
| Ürün seçici | Liste/peşin fiyatları görüldü; katalog makinesi seçilince fotoğraf, açıklama ve 74.588 USD fiyat kaleme aktarıldı |
| Teklif kaydı | Firma ve yeni test kontağı seçilerek teklif kaydedildi; detay, toplam ve otomatik bağlı fırsat görüldü |
| Teklif yeniden açma | Liste aramasında kayıt bulundu, düzenlenip kaydedildi; Modüller sekmesinde kaldığı doğrulandı |
| Modül menüsü | Favoriye ekleme ekran açmadan çalıştı; sekme değiştirip geri dönünce katalog açıldı; Şikayet Kutusu ayrı adla göründü |

Bütün yazımlar yerel test kayıtlarına yapılmıştır. Canlı numaraya arama, gerçek mail gönderimi, üretim belge kesinleştirme veya mali işlem yapılmamıştır.

## Otomatik doğrulama

- Mobil TypeScript: başarılı.
- Mobil mevcut test paketi ve yeni regresyonlar: **667 başarılı, 0 başarısız**.
- API mevcut test paketi, izole UTF-8 PostgreSQL: **145 dosya / 931 test başarılı; 10 dosya / 39 test atlandı; başarısız test yok**.
- İlk API koşusunda 4 hata vardı: test veritabanı yanlışlıkla SQL_ASCII kodlamasıyla kurulmuştu. UTF-8 kopyada ilgili 16 test, ardından tüm paket yeniden çalıştırıldı ve geçti. Uygulama koduyla hata gizlenmedi.
- `git diff --check`: başarılı.
- Android ve iOS Hermes dışa aktarma: her iki platformda başarılı. Bu, native imzalı paket veya cihaz testi değildir.

## Açık doğrulama sınırları

- 39 atlanan API testi: çağrı asistanı PostgreSQL entegrasyonu (5), katalog aktarımı (3), teknik backfill (1), müşteri makinesi PostgreSQL (6), Hexlaser aktarımı (1), lazer tabanı PostgreSQL (6), makine taksonomisi (5), izole ürün oluşturma PostgreSQL (7), MinIO depolama (1), üniversal taban PostgreSQL (4). Bu özel ortam/opt-in testleri başarılı sayılmadı.
- Yerel MinIO/S3 çalıştırılmadı. Gerçek dosya yükleme, sunucu PDF üretimi/indirme/paylaşma zincirinin tamamı bu turda arayüzden doğrulanmadı.
- Native iPhone/Android fiziksel cihaz, tablet yatay/dikey, klavye, biyometri, kamera, push bildirimi, arama sonrası ve Siri/mikrofon izin senaryoları bu turun tarayıcı testleriyle doğrulanmış sayılmaz.
- Tüm kayıt türlerinin her oluşturma/düzenleme/silme, çevrimdışı, yavaş ağ ve her kullanıcı rolü kombinasyonu elle tamamlanmadı. API yetki testleri ile firma alt alanı kontrolleri tüm uygulama güvenlik denetimi yerine geçmez.
- Bu değişiklikler için TestFlight/APK/OTA veya AWS yayını yapılmadı.
