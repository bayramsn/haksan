# Haksan Makina CNC dışı ürün kataloğu

Kaynak: [haksanmakina.com.tr](https://www.haksanmakina.com.tr/). `scripts/extract-haksanmakina-catalog.py` herkese açık **yeni ürün** kategorilerini okur. CNC başlıklı kategorileri ve CNC başlıklı/modelli ürünleri çıkarır; ikinci el bölümü kapsamaz. Kaynak sayfalarındaki marka, model, açıklama, görsel URL'si ve eşleşen teknik değerler `apps/api/src/db/seed/data/haksanmakina/products.json` içinde kaynak bağlantılarıyla saklanır.

25.09.2026 anlık görüntüsü: **512 ürün**, **68 ürün tipi**, **2.253 modelle eşleşen teknik değer**. Seri tablolarından ayrıca **1.095 boş alan ipucu** çıkarıldı; toplam **1.119 benzersiz teknik şablon alanı** planlandı.

## Kapsam ve doğruluk

- Her katalog kartının kaynak ürün ID'si `HM-<ID>` CRM model koduna ve stok koduna dönüşür. Üretici model adı ayrıca korunur. Bu kod, tekrarlı aktarımlarda aynı ürünü bulur ve mevcut CNC model kodlarıyla çakışmayı önler.
- Ürün sayfasında birden fazla modelin aynı tabloda verildiği durumlarda tablo değeri seri ürününe otomatik atanmaz. Alan adları boş teknik şablona eklenir. Sayfadaki teknik metin ürün açıklamasında korunur.
- Fiyat ve menşe gibi kaynakta açıkça gösterilmeyen alanlar boş kalır. Ürün ailesi için eklenen boş alanlar düzenleme şablonudur; ölçü değeri değildir.
- Kaynak URL'si ürün açıklamasında tutulur. Görseller uzaktaki herkese açık kaynak URL'lerine bağlanır; bu komut dosya indirme veya depolama yüklemesi yapmaz.

## Çalıştırma

Kaynak anlık görüntüsünü yenilemek için `beautifulsoup4` kurulu Python ile:

```bash
python3 scripts/extract-haksanmakina-catalog.py
```

Veri dosyasını ve grup sayılarını veritabanına bağlanmadan kontrol etmek için:

```bash
npm --workspace @haksan/api run db:import:haksanmakina
```

CRM veritabanı ve migration'lar hazır olduğunda, etkin bir süper yönetici ve tenant UUID'leriyle açıkça uygulayın:

```bash
npm --workspace @haksan/api run db:import:haksanmakina -- --tenant=<tenant-uuid> --user=<admin-uuid> --apply
```

Aktarım tek transaction içinde çalışır ve mevcut `HM-<ID>` ürünlerini korur; ikinci çalıştırma onları yeniden oluşturmaz. Ürün ailesi teknik alanları `product_spec_templates` tablosunda, sayfada modele güvenle eşleşen değerler `product_specs` tablosunda oluşturulur. Kaynakta kaldırılan ürünler CRM'den silinmez. İşlem öncesinde anlık görüntüdeki `errors` listesinin boş olması zorunludur.

## Fiber lazer kesim ek aktarımı

`--fiber-laser-only` yalnızca Haksan Makina'nın üç fiber lazer kesim kategorisini okur: sac kesim, boru kesim ve sac/boru kesim. Genel CNC ürün kataloğunu içermez. 25.09.2026 anlık görüntüsünde kaynakta 14 kart görüldü; aynı AORE FT serisine ait iki karttan güncel olanı tutularak **13 seri** kaydedildi. Ürün sayfalarından **44 teknik değer** alındı; çoklu model tablolarındaki ölçüleri belirli bir modele atamadan alan başlıkları şablona eklendi. Kaynak: `apps/api/src/db/seed/data/haksanmakina/fiber-laser-products.json`.

```bash
python3 scripts/extract-haksanmakina-catalog.py --fiber-laser-only
npm --workspace @haksan/api run db:import:haksanmakina -- --fiber-laser-only
npm --workspace @haksan/api run db:import:haksanmakina -- --fiber-laser-only --tenant=<tenant-uuid> --user=<admin-uuid> --apply
```

Aktarım mevcut `fiber_lazer_kesim` ürünlerinin CRM hiyerarşisini kullanır; boru kesim için `fiber_lazer_boru_kesim` tipini bu hiyerarşi altında oluşturur. Mevcut model varyantlarını silmez veya değiştirmez. Tekrar çalıştırıldığında kaynak ID'lerinden oluşan `HM-<ID>` kayıtları atlanır.

Üretim imajı her iki JSON anlık görüntüsünü içerir. AWS üretim dağıtımı doğrulanmış uzak veritabanı yedeği ve migration'lardan sonra, canlı konteynerleri değiştirmeden önce iki aktarımı da `haksan` tenantı için otomatik çalıştırır. Bu tenant veya etkin bir süper yönetici bulunmazsa aktarım hata verip dağıtımı durdurur. Tekrar yapılan dağıtımlarda mevcut `HM-<ID>` kayıtları atlanır.

Operatörün gerektiğinde aynı aktarımı elle çalıştırması için, üretim imajında `npm` bulunmadığından derlenmiş dosya doğrudan `node` ile kullanılır:

```bash
cd /opt/haksan
docker compose --env-file .env run --rm --no-deps api node apps/api/dist/db/import-haksanmakina-catalog.js --tenant=<tenant-uuid> --user=<admin-uuid> --apply
docker compose --env-file .env run --rm --no-deps api node apps/api/dist/db/import-haksanmakina-catalog.js --fiber-laser-only --tenant=<tenant-uuid> --user=<admin-uuid> --apply
```

İlk komut CNC dışı aktarım üretimde zaten yapılmışsa kayıtları atlar. İkinci komut fiber lazer serilerini ekler.
