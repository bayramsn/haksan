# Lazer baz modelleri ve opsiyonel donanımlar

Lazer katalog kartı seri seviyesinde tutulur: örneğin **F Serisi**. Tabla/kapasite, rezonatör gücü ve kabin, tek seçimli donanım gruplarıdır. Teklif tutarı, baz fiyat ve seçilen donanımların ayrı fiyat satırlarından oluşur.

## Kullanım

1. Ürün kartını düzenleyerek baz fiyatı girin.
2. Lazer konfigürasyonu bölümünden grup ve seçenek ekleyin; seçenek adı, ek fiyat ve para birimini kaydedin. Sıfır ek fiyat açıkça girilebilir. Fiyatı girilmemiş seçenek teklif için kullanılamaz.
3. Tabla seçeneği bilinen kaynak modele bağlanırsa teknik bilgiler seçilen ölçü, güç ve kabine göre çözülür. Özel ölçü veya katalog dışı güç seçeneklerinde teknik bilgileri teklif içinde elle tamamlayın.
4. Teklifte her konfigürasyon grubundan bir seçenek seçin. Seçenek bedeli donanım satırı olarak eklenir. Donanımın para birimi teklifin para birimiyle aynı olmalıdır.
5. Kullanılmayan grupları/seçenekleri pasife alabilirsiniz. Geçmiş tekliflerdeki kayıtlı seçenekler ve fiyatları korunur.

Diğer lazer markalarında da özel donanım grupları yönetilebilir. Otomatik teknik çözümleme, mevcut AORE/HEXLASER kaynak profil ailesiyle eşlenen kartlarda çalışır. GR ve GR Pro ayrı baz aileleridir.

## Veri geçişi

Şema geçişi `0159_laser_base_options.sql`, veri geçişi `024_laser_series_base_models` uygulanır. Bunlar bu geliştirme sırasında canlıya uygulanmamıştır.

- Yapılandırılmış ölçü modelleri marka ve aile kapsamında birleştirilir. Kaynak kayıtlar silinmez; `catalogHidden` ile katalogdan gizlenir. Kaynak fiyatlar, teknik profiller ve eski ticari bağlantılar korunur.
- Mevcut AORE seri kartlarına seçenekler eklenir; kimlikleri ve fiyatları korunur. Yeni üretilen baz kartların ve seçeneklerin fiyatları, kullanıcı tarafından tanımlanana kadar boş kalır.
- Teklifler ve belgeler geçiş sırasında değiştirilmez. Teklif düzenleme mevcut kalemleri kimlikleriyle günceller; yalnız yeni kalemleri ekler ve kaldırılanları siler.
- Veri geçişi tekrarında mükerrer kayıt oluşmaz. HEXLASER aktarımı, dönüştürülmüş ailelerin ayrıntılı satış kartlarını yeniden üretmez.
- Geri dönüş, migration öncesi bağlantıları/snapshotları kullanır; sonradan düzenlenmiş kart, seçenek veya yeni ticari referans varsa veri kaybı yaratacak geri dönüşü reddeder.

Geri dönüşü önce `apps/api/src/db/rollback-laser-bases.ts` ile inceleyin; gerçek işlem için `--execute` gerekir. Canlı yayından önce mevcut sürüm temelinde yalnız bu değişikliklerden yayın paketi hazırlanmalı; çalışma ağacındaki diğer geliştirmeler dahil edilmemelidir.

## Doğrulama

İzole PostgreSQL testleri tekrar çalıştırma, tam geri dönüş, mikrosaniye zaman damgası korunması, mevcut AORE fiyatları, eski teklif snapshotları ve sonraki düzenleme/referans karşısında geri dönüş engelini kapsar. API testleri seçeneklerin baz modele ait olmasını, grup başına tek seçimi, katalog fiyatının snapshotlanmasını ve özel ölçüde eski teknik profilin temizlenmesini kontrol eder.
