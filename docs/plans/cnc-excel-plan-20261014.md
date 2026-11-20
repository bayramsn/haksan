# Excel taslağına göre CNC düzenleme planı

Tarih: 14 Ekim 2026
Durum: Uygulandı ve 14 Ekim 2026 tarihinde cnc-excel-20261014 sürümüyle canlıya alındı. 98 görünür CNC ürünü ve mevcut kayıtlar korundu.
Kaynak: Kullanıcının paylaştığı altı sekmeli Excel alan ve süreç taslağı.

## Kapsam

CNC'nin güncelleme öncesi yedekten geri getirilen 98 görünür ürününü esas al. Mevcut ürün kimlikleri, fiyatları, teknik bilgiler, görseller ve eski teklif bağlantıları korunsun. Bu çalışma yeni makine aktarımı veya CNC baz serilerine toplu dönüşüm yapmaz. Excel'de yer almayan mevcut geçerli ürün tiplerini otomatik kaldırma.

## Hedefler

1. Firma ve kontak bilgilerini aynı firma altında düzenle. Müşteri/tedarikçi ilişkisi, cari/potansiyel statüsü, sektör, kaynak kanalı, birden çok telefon/e-posta ve adres alanlarını karşılaştır. VKN/TCKN ile mevcut kayıt eşlemesini kontrollü yap; otomatik mükerrer firma açma.
2. CNC ürün seçimlerini bölüm ve üst kategoriyle sınırlandır. Ana kategoriler: CNC Tezgahları, Yedek Parça, Opsiyonel Donanım, İşçilik, Aksesuar. Kodlar ve kimlikler korunur. Tezgah aileleri İşleme Merkezi ve Torna; Excel'in makine tipleri bu ailelerin altındadır. Mevcut diğer geçerli CNC aileleri inceleme olmadan silinmez.
3. Ürün kartında marka/model, ürün adı, para birimi, liste/peşin fiyat, menşe, GTİP, KDV, stok kodu, fotoğraf ve ürün tipine bağlı teknik alanlar görünür olsun. Ayrıntılı teknik dosyalar eşlenmeden teknik değerlerin üzerine yazılmaz. Katalog modeli, stoktaki fiziksel makinenin seri numarasından ayrıdır.
4. Satış fiyat listesi yalnız seçilen CNC bölümündeki tezgahları çeksin. Küçük kare fotoğraf, marka, ürün adı, peşin ve liste fiyatı; para birimi görünür. Fiyatın tek kaynağı ürün/fiyat kaydı, geçmiş teklif fiyatı kendi anlık görüntüsünde korunur.
5. Stokta her fiziksel tezgah ayrı seri numaralı kayıttır. Ürün, kontrol ünitesi ve ünitenin seri numarası, yükleme/varış tarihi, mağaza/antrepo/şube konumu ve bekliyor/opsiyonlandı/iade durumu yer alır. Opsiyonlanan tezgah için firma ve ayrılma tarihi izlenir.
6. Tamamlanan satıştan müşteri cihazı oluşsun. Firma/kontak, ürün tipi/model ve tezgah seri numarası stoktan taşınsın. Aynı stok makinesinden ikinci cihaz oluşmasın. Teklif veya fiyat onayı cihaz oluşturma tetikleyicisi değildir. İade ve satış iptali bağlantıyı kaybetmeden izlenir.

## Veri kuralları

- Excel para birimi TL, sistem kodu TRY olarak eşlenir.
- Excel'in 0,01 / 0,10 / 0,20 KDV değerleri %1 / %10 / %20 olarak yorumlanır; 100 kat fiyat/KDV hatası engellenir.
- GTİP, stok kodu, vergi kimliği ve seri numarası metindir; baştaki sıfırlar korunur.
- Eksik fiyat boş kalır; ücretsiz değer yalnız açıkça sıfır girildiyse sıfırdır.
- Marka/ürün tipi listeleri mevcut değerlerle karşılaştırılır; Excel'de olmayan kayıtlar silinmez.
- Kontakta önce iş ilişkisi alanları uygulanır. Sağlık ve siyasi görüş alanları ilk sürüme dahil edilmez.
- Excel gerçek ürün/teknik değer envanteri içermez; teknik dosyalara atıf yapar. Teknik bilgi eşleme için bu ek kaynaklar ayrıca incelenmelidir.

## Mevcut sistemde doğrulanan eksikler

Ürün temel alanları, çoklu firma/kontak iletişim bilgileri ve yalnız tezgah fiyat listesi mevcut altyapıda bulunuyor. Yeniden kurulum yerine alan ve davranış eşlemesi yapılmalı.

- Kontrol ünitesi seri numarası veritabanı/API'de var; stok oluşturma formuna eklenmeli.
- Cihazın kontak bağlantısı veritabanında var; oluşturma/güncelleme girdisi ve serviste tamamlanmalı, kontak firmaya ait olmalı.
- Satıştan cihaz oluşturma zaten fatura ve fırsat teslimi yollarında var. Bu yollar tek ortak işlemde birleştirilmeli; aynı stok için tek aktif cihaz korunmalı. Önce mevcut mükerrerler salt okunur raporlanmalı.
- Stok konumu (mağaza/antrepo/şube) ile ticari durum ayrı alanlardır. Excel'in Bekliyor değeri Stokta/Yolda seçeneklerine otomatik eşlenmez; anlamı belirlenir.

## Uygulama sırası

A. Mevcut CNC ile Excel alanlarının salt okunur fark raporu; tamamlanacak alanlar ve eşlemeler.
B. Ürün/kategori/teknik ekranları ve yalnız tezgah fiyat listesi; CNC verisi silinmeden.
C. Seri numaralı stok, rezervasyon, satıştan cihaz oluşturma ve iade/iptal akışı.
D. Önizleme, izole doğrulama, yeni yedek, sınırlı canlı uygulama ve karşılaştırma.

## Kabul

98 görünür CNC ürünü ve kimliği korunur. Her tip kendi teknik alanlarını gösterir. Aksesuar ve işçilik tezgah fiyat listesinde görünmez. Ürün-stok-cihaz bağlantısı doğru taşınır. Tekrar satış işleminde aynı seri numarasına ikinci cihaz açılmaz. Liste ve peşin fiyatlar, para birimi ve KDV oranları doğru okunur. Eski teklifler ve PDF'ler değiştirilmez. Her veri değişikliği geri alınabilir.

## Uygulama sonucu

Bekliyor: Stokta, satışa hazır olarak kararlaştırıldı. Değişiklik ve doğrulama ayrıntıları: `reports/cnc-excel-20261014/changes.md`. Yayın öncesi yeni yedek: `haksan_20261014T120729Z.sql.gz`. Önceki uygulama imajları geri dönüş için korundu. Canlı migration sonucu: 98 görünür CNC ürünü, mevcut satırlar korunmuş, 162 migration kaydı.
