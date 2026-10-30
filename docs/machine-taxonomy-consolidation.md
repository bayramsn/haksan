# Makine kategorileri ve aileleri

Makine bölümleri CNC, Üniversal ve Sac İşleme olarak kalır. Ana kategori adları CNC Tezgahları, Üniversal Tezgahlar ve Sac İşleme Tezgahlarıdır. Paylaşılan kategori kayıtları kendi UUID/kodlarını korur; görünen ad bölüm bağlamından üretilir.

| Bölüm | Alt kategoriler |
|---|---|
| CNC | İşleme Merkezi, Torna, Taşlama, EDM |
| Üniversal | Torna, Freze, Matkap, Taşlama, Testere, Pres, Planya, EDM |
| Sac İşleme | Bükme, Kesme, Lazer Kesim, Pres, Şekillendirme |

Ayrıntılı ürün tipleri ve modeller korunur. Kaynak, hava/kompresör, taşıma, aksesuar ve yedek parça katalogları bu değişikliğe dahil değildir. Kod eşlemesinin tek kaynağı `packages/shared/src/machine-taxonomy.ts` dosyasıdır. Yeni bir makine tipi eklenirken ilgili bölüm/ürün tipi kodu burada açıkça eşlenmelidir; migration ürün adlarından tahmin yapmaz.

## Veri geçişi

`023_consolidate_machine_taxonomy` mevcut data-migration sırasına kayıtlıdır. Normal data-migration çalıştırıcısı her geçişi transaction içinde çalıştırır. Bu çalışma kapsamında canlı çalıştırma veya yayın yapılmamıştır.

- Ön kontrol tüm makine tiplerini kimlikleriyle eşler. Bilinmeyen tip, belirsiz bölüm veya çakışan aile/ebeveyn bağlantısı varsa tüm işlem durur.
- Ürün tipi kimlikleri/kodları korunur; ürünlerin ve tiplerin alt kategori bağlantıları birlikte güncellenir. Fiyat, teknik bilgi, şablon ve donanım satırları yeniden yazılmaz.
- Yeni aileler aynı bölümdeki mevcut kayıtlarla büyük/küçük harften bağımsız eşleştirilir. Referansı kalmayan eski alt kategoriler pasife alınır; silinmez.
- Opsiyonel donanımın eski alt kategori kapsamı ürün tipi kurallarına dönüştürülür. Mevcut tip kısıtıyla kesişim ve marka/grup/kategori kısıtları korunur. Her mevcut makine için önce/sonra uyumluluk karşılaştırılır; herhangi bir fark işlemi durdurur.
- Önceki bağlantılar ve yeni satırlar `public.__machine_taxonomy_snapshots` içinde saklanır. Tekrar çalıştırma uygulanmış geçişi atlar.
- Katalog aktarımı, korunmuş eski kategori dallarını kullanır. Yeniden aktarım yeni ailelerin yanında eski ayrıntılı alt kategoriler oluşturmaz.

Data-migration çalıştırıcısı: `npm --workspace @haksan/api run db:data-migrate`. Bu komut hedef ortamda **tüm bekleyen data-migration kayıtlarını** uygular; ortam bağlantısını ve bekleyen kayıtları yayın sürecinde kontrol edin.

## Geri dönüş

Önizleme: `npx tsx apps/api/src/db/rollback-machine-taxonomy.ts`.

Uygulama: `npx tsx apps/api/src/db/rollback-machine-taxonomy.ts --execute`.

Derlenmiş ortamda eşdeğer komut `node apps/api/dist/db/rollback-machine-taxonomy.js` şeklindedir. Geri dönüş transaction içinde yapılır. Geçişten sonra değiştirilmiş kayıt veya yeni ailelere eklenmiş referans varsa geri dönüş reddedilir; sonradan eklenen veriler silinmez. Başarılı geri dönüş, tracking kaydını kaldırır ve normal çalıştırıcının migration'ı tekrar uygulamasına izin verir.

## Doğrulama

API testleri katalogdaki makine eşlemelerini, bölüm/ebeveyn kapsamını, bilinmeyen kodların reddini, uyumluluk kümelerini ve geri dönüş güvenliğini kapsar. Web testleri kategori adlarını, eski kod eşleşmesini, grup izolasyonunu, lazer ailesini ve mevcut CRM zincirini kapsar.

Gerçek PostgreSQL testi yalnız açıkça verilen özel test soketiyle çalışır; `DATABASE_URL` veya üretim ortam dosyası kullanmaz:

```sh
HAKSAN_TAXONOMY_TEST_SOCKET=/private/tmp/haksan-taxonomy-socket-<test-id> \
HAKSAN_TAXONOMY_TEST_PORT=55439 \
npm --workspace @haksan/api run test -- test/machine-taxonomy-postgres.spec.ts
```

Bu test, izole cluster'ın test tablolarını yeniden oluşturur. Transaction, yinelenen çalıştırma, tam geri dönüş, geçersiz tipte rollback, sonradan eklenen referans/açıklamada geri dönüş reddi ve hem 512 ürünlük genel hem 13 serilik lazer kataloglarının eski kategori koduyla tekrar aktarımı doğrulanır. Soket verilmezse bu entegrasyon testi atlanır.

12.10.2026 doğrulaması: 46 odaklı API testi, 58 web testi ve 5 gerçek PostgreSQL testi geçti. Shared/API/web üretim derlemeleri ve API tip kontrolü başarılı. Web tip kontrolünde önceden bulunan `print/templates.test.ts:267` test verisinin eksik `tarih` ve `belgeNo` alanları hatası devam ediyor. İzole test sunucusu kapatıldı; canlı veritabanı veya yayın değiştirilmedi.

## Üretim yayını — 12.10.2026

Kullanıcının deploy talimatıyla `machine-taxonomy-20261012` API/web yayını tamamlandı. SSM komutu `a7a30cfa-8b09-4c6f-8e43-8d2e3438f7b8` Success döndü. Canlı API sürümü ve HTTPS sağlık endpointleri doğrulandı; web paketi `index-D-eceAWc.js`.

Mevcut canlı API/web temelinden izole kategori patch'i kullanıldı. Diğer yerel değişiklikler, şema migration'ları ve katalog tekrar aktarımı yayına alınmadı. Yalnız data migration 023 transaction içinde çalıştırıldı; öncesinde doğrulanmış dış veritabanı yedeği alındı.

2.331 ürünün kategori dışındaki içeriği, 109 ürün tipinin kimlik/kodları, 24.776 teknik bilgi, 2.002 teknik şablon ve 6.279 donanım satırı SHA-256 karşılaştırmasıyla aynı kaldı. 2.012 ürünün kategori bağlantıları ve 38 ürün tipi üst bağlantısı düzenlendi. Üretimdeki referanslı pasif ana kategoriler etkinleştirildi; eski büyük/küçük harf kopyaları referansları taşındıktan sonra pasife alındı. Kaynak/temizleme makinesi tipleri değiştirilmedi.

İlk iki yayın denemesi koruma kapılarında güvenle geri alındı. PostgreSQL mikrosaniye hassasiyeti SQL sütun referansıyla korunuyor; ortak/pasif kategori dalları tek bölüm ebeveynine kararlı şekilde çözülüyor. Son paketin tam üretim denemesi commit edilmeyen transaction içinde fiyat/teknik bilgi/donanım eşitliği ve sıfır tekrar değişikliği koşuluyla geçti.

Canlı Chrome kategori filtresinde üç yeni başlık ve Üniversal'in sekiz alt kategorisi doğrulandı. Rapor, son deploy betiği, dar kaynak patch'i ve ekran kanıtları `reports/machine-taxonomy-release-20261012/` altındadır.
