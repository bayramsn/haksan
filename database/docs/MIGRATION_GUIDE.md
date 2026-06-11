# Migration Guide

## Lokal geliştirme

```bash
# Yeni schema değişikliği yap (apps/api/src/db/schema/*.ts dosyalarında)
# Sonra:
npm run db:generate     # drizzle-kit generate
npm run db:migrate      # apply pending migrations
```

`apps/api/src/db/migrations/` dizinine yeni bir `.sql` dosyası eklenecek. Bu dosyayı **MUTLAKA** commit et.

## Production migration

```bash
# 1) Manuel snapshot al (Supabase Studio / RDS / pg_dump)
# 2) Migration'ı staging'e uygula, smoke test geç
# 3) Production'a uygulamadan ÖNCE:
#    - app instances'i drain et (rolling deploy)
#    - migration user (DDL yetkisi olan) ile bağlan
DATABASE_URL=postgres://migrate_user@prod-db npm run db:migrate
#    - migration başarılı olduktan sonra runtime user'a (sadece DML) geç
# 4) App instances'i tekrar ayağa kaldır
# 5) Smoke test
```

## Rollback

Drizzle migration'lar idempotent değildir; rollback için:
1. Önceki snapshot'a dön (`pg_restore` veya cloud restore)
2. Veya manuel rollback SQL yaz (`ALTER TABLE … DROP COLUMN …`)

Bu yüzden migration başına manuel snapshot zorunlu.

## Migration kuralları (önemli)

- **Asla** bir kolonu DROP yapan migration prod'a gönderme — önce yazma'yı durdur, sonra release sonrası ayrı bir migration ile DROP.
- Yeni NOT NULL kolon eklerken önce nullable ekle + backfill + sonra NOT NULL.
- Index ekleme: `CREATE INDEX CONCURRENTLY` kullan (Postgres).
- Foreign key ekleme: Önce kolon, sonra backfill, sonra constraint.
