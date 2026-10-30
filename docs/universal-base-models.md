# Üniversal baz modeller

`run-universal-bases` varsayılan olarak salt okunur önizleme üretir. `CATALOG_TENANT_ID`, `CATALOG_USER_ID` zorunludur; aktif süper yönetici kontrolü uygulanır. Önce 0161 şema geçişi, ardından Haksan aktarımı, sonra `node dist/db/run-universal-bases.js --apply` çalıştırılır.

Yalnız tenantın Üniversal bölümündeki ana tezgah kategorileri kapsanır. CNC ve yardımcı/aksesuar kayıtları kapsam dışıdır. Mevcut bağımsız makinelerin kimlikleri, fiyatları, teknik bilgileri, opsiyonları korunur; genel baz-model metadata eklenir. Farklı kapasite/gövde numaraları otomatik seri kabul edilmez.

Tek açık çoklu eşleme VOUGA CD 6241/1000 (kaynak 600) ve CD 6241/1500 (1122) içindir. Kaynaklar CD 6241 modelini belgelemektedir. Farklı boy, ağırlık ve hareket bilgileri ayrı konfigürasyonlarda korunur. Bazda yalnız birebir ortak teknik bilgiler bulunur. Mevcut özel donanım/opsiyon/muadil bağlantısı varsa eşleme yapılmaz; kaynakta doğrulanan standart donanım listeleri farklıysa her konfigürasyonun `Standart Donanım` teknik alanında ayrı korunur, yalnız ortak standartlar baz donanımına kopyalanır; bağımsız bazlar korunup inceleme raporuna yazılır. Yeni baz fiyatı ve uzunluk opsiyon fiyatları boştur; sıfır varsayılmaz. Eski iki kart yalnız yeni seçimden gizlenir.

`baseModelConfiguration` lazer alanından ayrıdır: `kind`, `baseModelCode`, `sourceModelCodes`, `variableSpecKeys`, `sourceRevision`, `configurations` (kaynak model/ürün kimliği/bağlantısı, teknik değerler ve konfigürasyona ait standart donanım) taşır. Opsiyon grupları genel tiptedir (`configurationKind=null`); seçim `sourceModelCode` ile doğru teknik konfigürasyona bağlanır.

Geri dönüş sırası: Üniversal bazlar → Haksan aktarımı. `--rollback` önizleme, `--rollback --apply` geri dönüş uygular. Journal ham PostgreSQL satırlarını kaydeder; timestamp hassasiyeti korunur. Sonraki düzenleme veya journal dışı yabancı anahtar referansı varsa geri dönüş durur. Tam veritabanı geri yüklemesi bağımsız operatör yedeğiyle yapılmalıdır.

Kaynak önizlemesi: `reports/universal-base-20261013/source-preview.json`. 180 kaynak makine, koşullar sağlandığında 179 baz kimliği. Diğer varyant gibi görünen adlar raporda gösterilir; doğrulanmamış alternatif donanım üretilmez.
