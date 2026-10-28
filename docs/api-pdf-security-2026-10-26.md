# API / ticari PDF güvenlik kontrolü — 2026-10-26

Bu rapor yerel çalışma ağacındaki kaynak incelemesi ve aşağıdaki testlere dayanır.
Canlı ortama geçiş bu rapor hazırlanırken yapılmamıştır. Tüm uygulamanın açık
içermediği veya bütün saldırı türlerine karşı güvenli olduğu iddia edilmez.

## Doğrulanan düzeltmeler

- Ortak Chromium PDF hizmeti aynı anda en fazla iki üretim kabul eder. Fazla
  istekler 429 ile reddedilir; sınırsız kuyruk oluşturulmaz.
- HTML girdisi UTF-8 olarak 8 MB ile sınırlıdır. Tarayıcının açılması dahil
  işlem süresi varsayılan 30 saniye, izin verilen en fazla 60 saniyedir.
- Başarısız, geç açılan ve zaman aşımına uğrayan sayfalar temizlenir. Sayfa
  kapanışı takılırsa uygulamanın başlattığı Chromium işlemi sonlandırılır.
- Teklif PDF ucuna, proforma ve sözleşme PDF uçlarıyla uyumlu olarak IP başına
  dakikada 10 istek sınırı eklendi.
- Chromium başlatma hatasının ayrı bir işlenmemiş Promise reddi üretmesi giderildi.
- JSON ayrıştırıcısına ve Zod doğrulama pipe'ına ortak, iteratif girdi karmaşıklığı
  kontrolü eklendi. Sınırlar: 32 derinlik, dizide 10.000 eleman, nesnede 1.000
  anahtar ve toplam 100.000 değer. Aşım, Zod eleman hatalarını üretmeden 413 döner.
  Mevcut 5.000 satırlık ürün aktarımı ve 10.000 kimlikli Meta işlemleri desteklenir.
  Ham dosya Buffer'ları atlanır; webhook imzası için tutulan ham JSON değiştirilmez.

## İncelenen erişim ve izolasyon zinciri

Teklif, proforma ve sözleşme PDF uçları kimlik doğrulama ve belge türüne ait okuma
izinlerini kullanır. Hizmetler belgeyi tenant, silinme durumu, kaynak bölüm kapsamı
ve firma görünürlük filtreleri üzerinden okur. İncelenen yeni PDF yollarında bu
kontrolleri atlayan somut bir erişim yolu saptanmadı; bu sonuç bütün modüllerdeki
yetkilendirmeye ilişkin kapsamlı bir sertifika değildir.

PDF sayfasında JavaScript kapalıdır. İstek yakalama yalnız `data:` ve `about:`
adreslerine izin verir; HTTP(S), `file:`, iframe ve meta-refresh ile dış ağa erişim
engellenir. Ticari belge görselleri istemcinin verdiği URL'ler indirilerek değil,
doğrulanmış genel medya hizmetlerinden çözülür. HTML şablonları kullanıcı alanlarını
kaçışlayarak basar; dosya adları yanıt başlığına uygun karakterlerle sınırlandırılır.

Global throttler, Helmet başlıkları, CORS origin listesi ve aktif oturuma bağlı
AuthGuard kaynakta mevcuttur. Bunların canlı yapılandırması ayrıca doğrulanmalıdır.

## Test kanıtı

- API TypeScript kontrolü başarılı.
- `html-pdf-limits.spec.ts`, `commercial-document-pdf.spec.ts` ve
  `html-pdf.spec.ts`: gerçek Chromium ile **24/24 başarılı**. Eşzamanlılık, boyut,
  süre sınırı, kapanışta takılma ve iframe/meta-refresh SSRF denemeleri dahil.
  Chromium testleri macOS sandbox dışında izinli çalıştırıldı; sandbox içindeki
  ilk çalıştırmada tarayıcı başlatılamadı.
- `json-complexity.spec.ts` ve ürün aktarımı, Meta, teklif opsiyonlarıyla ilgili
  yedi mevcut saf test paketi: **36/36 başarılı**. Büyük koleksiyonun Zod'a
  ulaşmadan reddedilmesi, normal aktarım boyutları ve ham dosya davranışı sınandı.
- `product-import-template.spec.ts` ve `product-import-division.spec.ts` DB
  entegrasyon paketleri sandbox localhost dinleme/Postgres bağlantısı kısıtı
  nedeniyle başlayamadı. Bu paketler başarılı sayılmamıştır.

## Bağımlılık incelemesi ve kalan sınırlar

Monorepo audit çıktısı mobil paketleri de içerdiğinden API'nin üretim bağımlılık
kapanışı ayrıca ayrıldı: incelenen yerel lock dosyasında 588 paket yolu. Fastify,
Nodemailer, Puppeteer ve Zod için advisory kayıtları görüldü. Güncelleme hedefleri
Fastify 5.12.7, Nodemailer 10.2.1 ve Puppeteer Core 25.16.0 olarak doğrulandı.
Bu rapor söz konusu sürümlerin canlıda bulunduğunu veya aday imajın audit
sonucunun temiz olduğunu iddia etmez; aday bağımlılık kilidi ayrıca denetlenmelidir.

Zod için yayımlanmış düzeltme 4.6.6'dadır. Mevcut Zod 3 şemaları major sürüme
taşınmadı. Eklenen karmaşıklık kontrolü büyük koleksiyonların hata nesnesi
biriktirmesini sınırlayan geçici bir azaltımdır; Zod 3 advisory kaydı kalır ve
bağımlılık güncellemesinin yerine geçmiş sayılmaz.
[Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
[üreticinin düzeltmesi](https://github.com/colinhacks/zod/pull/6652).

Chromium mevcut konteyner yaklaşımında `--no-sandbox` ile başlatılır. JavaScript
ve ağ engelleri işletim sistemi sandbox'ının yerini tutmaz. Bu incelemede Chromium
üzerinden kod çalıştırma gösterilmemiştir; işletim sistemi izolasyonu ve güncel
Chromium paketleri ayrı bir sağlamlaştırma ve bakım gereksinimidir.

## Canlı geçişte doğrulanacaklar

- Aday imajda kilitlenmiş gerçek üretim bağımlılıkları ve güncel audit sonucu.
- Chromium kullanılabilirliği ve üç belge türünden gerçek PDF çıktısı.
- Kimliksiz/izinsiz PDF isteklerinin reddi, bölüm ve tenant kapsamı.
- HTTPS, CORS, güvenlik başlıkları, 429 yanıtları ve yoğunluk sonrası toparlanma.
- Sağlık kontrolü, mevcut web/mobil istemci uyumu ve geri dönüş imajı.

Bu kontrollerin canlı ortamda tamamlanması ayrı yayın kanıtıyla kaydedilmelidir.

## Canlı geçiş sonucu

2026-10-26: `pdf-security-20261026-r3` API yayını yapıldı. SSM `09a859a2-8546-4591-9858-c04a6d6bceb5` Success / exit 0.
Aday imaj: `sha256:1f4d65ae5f79f4c926f49b054e60f9b81adcf430ce080ebecd621f2accc891f8`.
Beş sağlık/sürüm yolu geçti. Teklif/proforma/sözleşme generate-pdf yolları anonim, geçersiz kayıt kimliğiyle 401 döndü. Compose/.env hashleri ve Postgres/nginx konteyner kimlikleri korundu. Migration/seed çalıştırılmadı. Geri dönüş etiketi `haksan-api:rollback-pdf-security-20261026-r3` mevcut.
Bu kontroller yetkili gerçek CRM kaydı üzerinde uçtan uca PDF kullanıcı kabul testi yerine geçmez.

Dış HTTPS kontrolü: /health/version 200 ve doğru release kimliği; HSTS, nosniff, DENY, strict-origin-when-cross-origin başlıkları doğrulandı. Yabancı Origin isteğine Access-Control-Allow-Origin verilmedi ve anonim quotes erişimi 401 döndü.
