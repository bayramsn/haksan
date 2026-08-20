<!--
  PR şablonu. Alakasız bölümleri silebilirsin, ancak DB migration bölümü
  şema değişikliği içeren her PR için ZORUNLUDUR.
-->

## Özet

<!-- Ne değişti ve neden? (1-3 cümle, "what" değil "why") -->

## Değişiklik türü

- [ ] feat (yeni özellik)
- [ ] fix (hata düzeltmesi)
- [ ] refactor / chore
- [ ] docs / test

## Veritabanı / Migration (şema değişikliği varsa zorunlu)

- [ ] `npm run db:generate` çalıştırıldı ve üretilen `.sql` + `meta/` snapshot commit edildi
- [ ] `npm run lint:migrations` temiz geçti (yeni migration'larda high-severity bulgu yok)
- [ ] Migration **expand-contract** kurallarına uyuyor:
  - [ ] Kolon DROP yok (varsa: ayrı, release-sonrası migration ve önce yazma durduruldu)
  - [ ] Yeni NOT NULL kolon: önce nullable + backfill, NOT NULL ayrı migration'da
  - [ ] Index ekleme: büyük/canlı tablolarda Drizzle migration'ına `CONCURRENTLY` eklenmedi; [transaction dışı release prosedürü](../docs/migration-concurrent-index-runbook.md) planlandı
  - [ ] Yeni UNIQUE constraint/index: mevcut veride duplicate olmadığı doğrulandı
  - [ ] Yeni FK: önce kolon, sonra backfill, sonra constraint
- [ ] Yeni kalıcı izin (permission) eklendiyse: bir data-migration ile mevcut rollere bağlandı (bkz. `apps/api/src/db/data-migrations`)
- [ ] Prod'a uygulamadan önce yedek alınacağı doğrulandı (Render preDeploy / VDS `backup-db.sh`)

## Test planı

<!-- Bu değişikliğin nasıl doğrulandığı / doğrulanacağı -->

- [ ] `npm run build` yeşil
- [ ] `npm test` yeşil
