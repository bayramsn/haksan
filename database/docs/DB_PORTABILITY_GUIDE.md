# Database Portability Guide

Bu sistem PostgreSQL üzerinde geliştirildi ama core schema "database-agnostic" tutuldu. Aşağıdaki sağlayıcılara taşınabilir:

| Sağlayıcı | Drizzle dialect | Test edildi mi? | Notlar |
|-----------|-----------------|-----------------|--------|
| PostgreSQL 14+ | `postgresql` | ✅ | Ana hedef |
| Supabase Postgres | `postgresql` | ✅ | RLS opsiyonel olarak ekstra koruma |
| Neon | `postgresql` | -- | Aynı kod yolu |
| Railway / Render Postgres | `postgresql` | -- | Aynı kod yolu |
| AWS RDS Postgres | `postgresql` | -- | Aynı kod yolu |
| Azure Postgres | `postgresql` | -- | Aynı kod yolu |
| Azure SQL | `mssql` | -- | Schema port gerek (UUID → uniqueidentifier) |
| MySQL 8 / MariaDB | `mysql` | -- | Schema port gerek (jsonb → json) |
| SQLite | `sqlite` | -- | Sadece test |

## Database'e özgü özellikler (taşınmayan)

PostgreSQL provider'ı tutmak istersek, aşağıdaki özellikler `database/providers/postgres/` altında opsiyonel olarak uygulanır:
- Row Level Security (RLS) — tenant_id bazlı
- Trigram index (`pg_trgm`) — legal_title fuzzy search
- citext extension — case-insensitive email
- Full-text search (`tsvector`) — opsiyonel
- Materialized view — rapor caching

Bunlar ana schema'da YOK. Sadece Postgres'teyken aktif edilir.

## Kullanılan tipler ve karşılıkları

| Drizzle / Postgres | MySQL | SQL Server | SQLite |
|--------------------|-------|------------|--------|
| `uuid` | `CHAR(36)` | `uniqueidentifier` | `TEXT` |
| `varchar(N)` | `VARCHAR(N)` | `nvarchar(N)` | `TEXT` |
| `text` | `LONGTEXT` | `nvarchar(max)` | `TEXT` |
| `numeric(18,4)` | `DECIMAL(18,4)` | `decimal(18,4)` | `NUMERIC` |
| `boolean` | `TINYINT(1)` | `bit` | `INTEGER` |
| `timestamp with time zone` | `DATETIME(6)` | `datetimeoffset` | `TEXT` (ISO) |
| `jsonb` (sadece audit_logs) | `JSON` | `nvarchar(max)` | `TEXT` |

## Default değer uyarıları

- `gen_random_uuid()` PostgreSQL özel. Diğer sağlayıcılarda Drizzle uygulama tarafında üretiyor (`defaultRandom()`).
- `now()` standart SQL, hepsinde çalışıyor.
- ON CONFLICT (Postgres) ↔ ON DUPLICATE KEY (MySQL) ↔ MERGE (SQL Server) — Drizzle bunu otomatik soyutluyor.

## Geçiş prosedürü

1. `apps/api/.env`'de `DB_PROVIDER` değiştir.
2. Mevcut Postgres DB'den `pg_dump --data-only --inserts` ile veriyi al.
3. Hedef DB'de `npm run db:migrate` ile schema oluştur.
4. Veriyi target DB'ye INSERT'lerle aktar (script gerekebilir; UUID kolonları için tip dönüşümü).
5. Smoke test.

**Önemli:** Audit_logs.old_values / new_values JSONB kolonu — hedef MySQL ise JSON, SQL Server ise nvarchar(max), SQLite ise TEXT olarak migrate edilmeli. Drizzle bunu otomatik yapar ama veri kopyalarken JSON string olarak gönder.
