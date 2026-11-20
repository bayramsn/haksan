# Haksan / HEX 2026 katalog aktarımı

Canlıya uygulanmadı. Önce şema0159/0160, sonra tenant kapsamında operatör aktarımı kullanılır. Önizleme varsayılandır; `--apply` yazım yapar. İlk aşama sıfır ürün kataloğudur.

- Haksan kaynağında593 aktarılabilir ürün, CNC dahil; HEX/AORE lazerleri ayrıca HEX2026 hattına yönlendirilir. Yatay işleme merkezleri dahil edilir. Belirsiz model eşleşmeleri bütün aktarımı durdurur; `match-decisions.json` somut kararlarla çözülür.
- Kaynak kimlikleri `catalog_sources` içinde saklanır. Aynı marka/model eşleşmesinde mevcut kart korunur. Fiyat veya elle girilmiş teknik bilgi üzerine yazılmaz. Yardımcı ekipman kendi kategorisindedir ve bölüm/uyumluluk filtresiyle gösterilir.
- HEX PDF17seri/60konfigürasyon için ana kaynaktır. AORE tabloları doğrulanmamış teknik kanıt olarak saklanır. AORE-only seriler kendi markalarıyla pasif ve katalogdan gizlenmiş taslak kartlardır.
- Seri başına tek baz kart: ölçü/kapasite seçenekleri tam PDFmodelkodunu taşır. Güç aralığından seçenek üretilmez. HW açıkça1.5/2/3kW verir; diğer güçler kullanıcı tarafından doğrulanıp fiyatlandırılır. Sabit kabin yalnız doğrulanmış serilerde eklenir.
- Teklifte fiyatı olmayan seçenek reddedilir; ücretsiz seçenek açıkça0dır. Teknik çözümleme2026revizyonuyla yapılır; eski tekliflerin snapshotları değişmez. Koşullu/belirsiz teknik alanlar boş ve inceleme notuyla gelir.
- Haksan geçişleri ham PostgreSQL satırlarıyla günlüklenir; geri dönüş sonraki düzenleme varsa durur. HEX geçişi kendi değişim günlüğünü kullanır. Gizlenen eski kartların ticari referansları korunur.

## Komutlar

API çalışma dizininde:

```sh
node --import tsx src/db/import-haksanmakina-catalog.ts
node --import tsx src/db/import-haksanmakina-catalog.ts --tenant=<uuid> --user=<uuid> --apply
node --import tsx src/db/import-hexlaser-catalog.ts --tenant=<uuid> --user=<uuid>
node --import tsx src/db/import-hexlaser-catalog.ts --tenant=<uuid> --user=<uuid> --apply
node --import tsx src/db/rollback-catalog-import.ts --tenant=<uuid>
node --import tsx src/db/rollback-catalog-import.ts --tenant=<uuid> --execute
node --import tsx src/db/rollback-catalog-import.ts --tenant=<uuid> --hex2026
node --import tsx src/db/rollback-catalog-import.ts --tenant=<uuid> --hex2026 --execute
```

`--refresh-templates` eski alanları değiştiren ayrı operatör seçeneğidir; bu uygulamanın normal aktarımında kullanılmaz. `--keep-superseded` eski lazer kartlarını görünür tutmak için özel seçenektir; normal aktarım baz serileri gösterir.


### Üniversal baz kart genişlemesi

Üniversal ana tezgahlar `baseModelConfiguration` ile yönetilir. Kaynakta aynı gövde olduğu doğrulanan VOUGA CD 6241/1000 ve /1500 tek baz karta bağlanır; ölçüler fiyatı boş seçeneklerdir. Sabit teknik bilgiler ve ortak standart donanımlar baz kartta, farklı bilgiler seçilen kaynak konfigürasyonunda tutulur. Eski ürün ve donanım kimlikleri ile fiyatlar korunur. Diğer gövdeler bağımsız baz kartlardır; doğrulanmamış seri/kapasite eşlemeleri otomatik birleştirilmez. Elle yeni Üniversal tezgah açıldığında genel seçenek yönetimi etkinleşir.

Üniversal aktarımı Haksan sonrasında uygulanır; kısmi geri dönüşte Üniversal → HEX → Haksan sırası izlenir. Yayın geri dönüşü için bakım sırasında alınmış tam veritabanı yedeği ve önceki uygulama imajları kullanılır.
