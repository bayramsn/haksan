# Hexlaser katalog sadeleştirmesi

- 101 kesim modeli ve 10 kaynak/temizleme modeli satış kataloğunda ayrı model kartlarıdır.
- 1414 kabin/güç teknik profili teklif yapılandırmasında kullanılmaya devam eder.
- Eski `MODEL-ACIK/KAPALI-GUCKW` kartlarında yalnız `catalog_hidden=true` ayarlanır. Kimlik, fiyat, teknik yapılandırma, isim ve tüm belge/stok bağlantıları korunur; `deleted_at` değiştirilmez.
- Normal katalog listelemesi gizli kartları dışlar. Yetkili doğrudan ürün okuması mevcut belgeler için çalışır. Teklif düzenleme eksik ürün metadata bilgisini ayrıca yükler.
- Başka markanın tuttuğu model kodu korunur; Hexlaser kartında gerektiğinde `HEXLASER-` öneki kullanılır. Yeni model fiyatı kaynakta yoksa boş kalır.
- Profil güncellemeleri gizli tarihî varyantları değiştirmez.
- Yeni güç/kabin kartı oluşturma ve yeni Excel içe aktarma engellenir. Mevcut varyantlar geçmiş işlemler için okunabilir.
- Marka filtresi ürün listesini daraltır; seri filtresinden model seçilir.

## Çalıştırma

Salt okunur plan:

```sh
node apps/api/dist/db/import-hexlaser-catalog.js --tenant-slug=haksan
```

Uygulama: aynı komuta `--apply` eklenir. AWS yayınında doğrulanmış veritabanı yedeği ve şema migrasyonlarından sonra çalışır. Tekrar çalıştırma mevcut model kartlarını korur ve zaten gizlenmiş varyantları tekrar saymaz.

Geri alma gerektiğinde yalnız ilgili tenant/markanın audit kaydında belirtilen eski varyantlarının `catalog_hidden` alanı geri açılır. Belge bağlantılarını taşıma ya da silme yapılmaz.
