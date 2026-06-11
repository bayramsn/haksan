# Haksan ERP / CRM

CNC takım tezgahları satan bir firma için **ERP + CRM + teklif/proforma/sözleşme/fatura + stok/seri no + kurulum/servis + finans + raporlama** sistemi. Aynı kod tabanı:

- React + Vite frontend (`apps/web`)
- NestJS + Drizzle ORM backend (`apps/api`)
- Tip ve şema paylaşımı için ortak paket (`packages/shared`)
- PostgreSQL veritabanı (Supabase'e ve geri dönüş yapabilen db-agnostic tasarım)
- S3 uyumlu nesne depolama (MinIO dev, Supabase Storage / AWS S3 / Cloudflare R2 prod)

---

## Hızlı başlangıç

### Önkoşullar

| Araç | Sürüm | Not |
|------|-------|-----|
| Node.js | ≥ 20 | `node --version` |
| npm | ≥ 10 | npm workspaces kullanıyoruz |
| Docker Desktop | son | Postgres + MinIO + Mailhog için |

### Kurulum

```bash
git clone <repo> && cd haksan
npm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Altyapıyı ayağa kaldır (Postgres, MinIO, Mailhog)
docker compose up -d

# Veritabanını oluştur + seed
npm run db:migrate
npm run db:seed

# Backend (port 3000)
npm run dev:api

# Frontend (port 5173) — başka bir terminalde
npm run dev:web
```

Sonra `http://localhost:5173` adresini aç. Demo kullanıcılar:

| E-posta | Şifre | Rol |
|---------|-------|-----|
| admin@haksan.local | admin12345 | admin |
| sales@haksan.local | sales12345 | sales |
| service@haksan.local | service12345 | service |
| finance@haksan.local | finance12345 | finance |

Seed verisi: KİLİTSAN (Manford DL-2112, $170K), Contra Makine (LK MV-1050, $72K), ALİŞLER (ECOCA MT-208/500, $68.3K) müşterileri + teklifleri + 2 seri numaralı stok kalemi.

---

## Repo yapısı

```
haksan/
  apps/
    api/                  NestJS backend
      src/
        config/           env.ts (Zod doğrulanmış)
        db/
          schema/         Drizzle schema (50+ tablo)
          migrations/     drizzle-kit generate çıktısı
          seed/           lookups + Manford/LK/ECOCA seed scripti
        modules/          domain başına Nest modülü (auth, companies, contacts,
                          opportunities, products, inventory, quotes, files,
                          finance, reports, service, admin, lookups, activities)
        shared/
          database/       Drizzle client + audit servis
          security/       JWT, auth guard, permissions guard, RBAC cache
          storage/        StorageService + S3/Supabase/MinIO sağlayıcılar
          utils/          errors, pagination, logger, zod-pipe, lookup helpers
      test/               Vitest + Supertest (auth, tenant, RBAC, flow, file)
    web/                  React + Vite + Tailwind + Radix frontend
      src/
        app/              Mevcut sayfalar, dialoglar, store (TanStack Query ile API'ye bağlı)
        lib/              apiClient, authClient, queryClient, services
  packages/
    shared/               Zod şemaları + sabitler + tipler (FE+BE ortak)
  database/               SQL referans, ERD, port docs (drizzle-kit migration üretir)
  docker-compose.yml      Postgres + MinIO + Mailhog
```

---

## Mimari kararlar

1. **Database-agnostic core:** Postgres enum yerine lookup tabloları, jsonb/array kolonları yok, ANSI'ye yakın migration'lar. Postgres'e özgü özellikler (RLS, trigram, citext) `database/providers/postgres/` altında opsiyonel.
2. **Multi-tenant by default:** Her ana tabloda `tenant_id`. Backend repo katmanı her sorguya tenant_id ekler. JWT içinden çözümlenir, frontend'den GÜVENİLMEZ.
3. **JWT + httpOnly refresh:** Access token 15dk (Bearer), refresh token 30 gün, httpOnly + SameSite + (production) Secure cookie. Refresh token SHA-256 hash olarak DB'de saklanır, kullanımda rotate edilir.
4. **RBAC matrix:** 7 sistem rolü (super_admin, admin, sales, service, finance, stock, readonly). Permission'lar `<resource>.<action>` formatında lookup tablosunda. AuthService login'de yetkiyi cache'ler.
5. **Storage soyutlaması:** `StorageService` arayüzü; provider'a göre MinIO/S3/R2 (aynı `S3StorageProvider`) veya Supabase'e map'ler. Frontend asla SECRET görmez — sadece signed URL.
6. **Audit log:** Tüm yazma işlemleri merkezi `AuditService.write()` çağırır. Şifre/token gibi alanlar `redact()` ile loglara sızdırılmaz.

---

## Database'i farklı sağlayıcıya taşıma

| Hedef | Adım |
|-------|------|
| **Supabase Postgres (prod)** | 1) Supabase'de yeni proje aç. 2) Connection string'i `apps/api/.env` `DATABASE_URL`'e koy. 3) `npm run db:migrate && npm run db:seed:lookups`. 4) `S3_PROVIDER=supabase`, `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` ayarla. 5) Bucket'ları Supabase Studio'da oluştur (`docker-compose.yml`'deki listeden). |
| **Neon / Railway / Render Postgres** | `DATABASE_URL` değiştir, `db:migrate` çalıştır. Aynı şema. |
| **AWS RDS Postgres / Azure SQL** | RDS Postgres için aynı yol. Azure SQL için `DB_PROVIDER=sqlserver` yapıp `database/providers/sqlserver/` notlarındaki tip uyumluluklarını uygula (numeric→decimal, uuid→uniqueidentifier). |
| **MySQL / MariaDB** | `DB_PROVIDER=mysql`, drizzle-kit'i mysql dialect ile çalıştır. JSONB sütunları (audit_logs.old_values/new_values) JSON olarak çalışacak. |
| **SQLite (sadece local test)** | Schema mevcut, sadece test için. UUID'ler text. |

Geçiş öncesi mutlaka backup al (`pg_dump`, RDS snapshot, Supabase backup).

---

## Storage'ı farklı sağlayıcıya taşıma

Her şey `apps/api/.env` üzerinden:

```env
# Dev (MinIO docker)
S3_PROVIDER=minio
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin

# Prod — Cloudflare R2
S3_PROVIDER=r2
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false

# Prod — AWS S3
S3_PROVIDER=s3
S3_REGION=eu-central-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false

# Prod — Supabase Storage
S3_PROVIDER=supabase
SUPABASE_URL=https://<proj>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

Bucket'ları her sağlayıcıda manuel oluştur (MinIO'da `minio-init` otomatik yapar). Object key formatı her zaman `tenant/{tenant_id}/{entity}/{id}/yyyy/mm/uuid_safe-name`.

---

## Güvenlik kontrol listesi (production öncesi)

- [ ] `JWT_ACCESS_SECRET` ve `JWT_REFRESH_SECRET` ≥32 char, rastgele (`openssl rand -hex 32`)
- [ ] `COOKIE_SECURE=true`, `COOKIE_SAMESITE=strict`
- [ ] `CORS_ORIGINS` sadece prod domain(ler)
- [ ] `NODE_ENV=production`
- [ ] Supabase service_role_key SADECE backend ortamında, GIT'e sızdırılmadı
- [ ] `.env` git'te değil, secret manager (Vault/AWS Secrets/Doppler) kullan
- [ ] DB user'ı runtime için minimum yetkiyle; migration için ayrı user
- [ ] Postgres backup günlük + haftalık full; restore prosedürü test edilmiş
- [ ] Reverse proxy (nginx/Caddy) HTTPS + HSTS + CSP başlıkları
- [ ] Rate limit prod'da daha sıkı (login 3/dk, genel 60/dk)
- [ ] `npm audit` sıfır kritik açık
- [ ] Pino loglarına PII sızıntısı yok (redact kontrolü)
- [ ] MFA schema'da hazır, gerçek implementasyon planı var

---

## OWASP Top 10 kontrolleri

| Risk | Önlem |
|------|-------|
| Broken Access Control | `AuthGuard` + `PermissionsGuard` + `BaseRepository` tenant_id filter |
| Cryptographic Failures | argon2id password, JWT secrets 32+ byte, signed URL TTL 5 dk |
| Injection | Drizzle parametrize sorgu, Zod input validation, raw SQL yok |
| Insecure Design | Multi-tenant baştan tasarımda, audit log her yazmada |
| Security Misconfiguration | helmet + CORS allowlist + body size limit + rate limit |
| Vulnerable Components | `npm audit`, sürüm sabitleme, devDependencies prod'a sızmıyor |
| Auth Failures | Login lockout (5 hata → 15dk kilit), refresh token rotation + revocation |
| Software & Data Integrity | Tüm değişiklikler audit_logs'a, soft delete + retention |
| Logging/Monitoring | Pino structured log, redact, request_id korelasyonu |
| SSRF | Storage URL üretimi sadece allow-list bucket'lar üzerinden |

---

## Test çalıştırma

```bash
# Backend testleri (Vitest + Supertest + canlı Postgres)
npm test

# Beklenen sonuç: 26/26 test geçiyor
#   - auth.spec.ts: login, lockout, refresh, me
#   - tenant-isolation.spec.ts: cross-tenant read/write reddi
#   - permissions.spec.ts: RBAC sınırları
#   - quote-flow.spec.ts: stage transition state machine (lead→sales→quote→cancel)
#   - file-upload.spec.ts: MIME/size validasyonu, signed URL üretimi
```

---

## Backup / Disaster Recovery

### Database
```bash
# Manuel backup
docker exec haksan-postgres pg_dump -U haksan haksan > backup_$(date +%F).sql

# Restore
docker exec -i haksan-postgres psql -U haksan -d haksan < backup_2026-05-28.sql
```

Production'da:
- Günlük otomatik snapshot (RDS/Supabase built-in)
- Haftalık full dump'ı şifreli S3 cold storage'da 90 gün
- Migration öncesi ZORUNLU manuel snapshot

### Storage
- Versioning aç (S3/R2: object versioning, MinIO: bucket versioning)
- Lifecycle: 30 gün soft delete bekletme sonra physical delete
- Cross-region replication (RPO ≤ 1 saat)

---

## Production deployment checklist

1. [ ] Tüm secret'lar secret manager'a girildi
2. [ ] `DATABASE_URL` production Postgres'i gösteriyor
3. [ ] Migration uygulandı: `npm run db:migrate`
4. [ ] Lookup seed yapıldı: `npm run db:seed:lookups`
5. [ ] İlk tenant + admin user oluşturuldu (script ile veya admin endpoint üzerinden)
6. [ ] Storage bucket'ları manuel oluşturuldu (S3/Supabase için)
7. [ ] CORS allowlist sadece prod domain
8. [ ] Reverse proxy HTTPS + sıkı header'lar (HSTS, CSP, X-Frame-Options, X-Content-Type-Options)
9. [ ] Health endpoint reverse proxy tarafından izleniyor (`/health`)
10. [ ] Smoke test: login → bir CRUD → bir signed upload + download
11. [ ] Backup prosedürü ilk gün denenmiş
12. [ ] Rollback prosedürü dokümante (önceki dist artifact + DB snapshot)

---

## API endpoint özeti (`/api/v1`)

```
POST   /auth/login                  -- login (rate limit 5/dk)
POST   /auth/logout
POST   /auth/refresh                -- rotates refresh token
POST   /auth/forgot-password
POST   /auth/reset-password
GET    /auth/me

GET    /companies                   -- pagination + search + filter
POST   /companies
GET    /companies/:id
PATCH  /companies/:id
DELETE /companies/:id

GET    /contacts                    POST /contacts ...
GET    /opportunities               POST /opportunities ...
PATCH  /opportunities/:id/stage     -- state machine enforced

GET    /activities    POST /activities    POST /visits    POST /calls

GET    /brands        POST /brands
GET    /products      POST /products      ...
GET    /products/:id/specs           POST /products/:id/specs
GET    /products/:id/equipment       POST /products/:id/equipment

GET    /warehouses    POST /warehouses
GET    /inventory     POST /inventory     PATCH /inventory/:id/reserve
PATCH  /inventory/:id/sell           GET /inventory/serial/:serialNumber
GET    /customer-devices

GET    /quotes        POST /quotes        PATCH /quotes/:id
POST   /quotes/:id/items             PATCH /quotes/:id/items/:itemId
PUT    /quotes/:id/terms
POST   /quotes/:id/approve           POST /quotes/:id/reject     POST /quotes/:id/send

POST   /files/signed-upload-url      POST /files/signed-download-url
POST   /files/link                   DELETE /files/:id

GET    /receivables                  POST /receivables
GET    /payments                     POST /payments

GET    /reports/weekly-visits        GET /reports/monthly-visits
GET    /reports/weekly-quotes-by-product
GET    /reports/expected-receivables GET /reports/completed-payments
GET    /reports/stock-summary        GET /reports/pipeline-summary
GET    /reports/warranty-expiring
GET    /reports/export/pipeline-summary    (xlsx)
GET    /reports/export/stock-summary       (xlsx)

GET    /service-tickets              POST /service-tickets
PATCH  /service-tickets/:id/status
GET    /installations                POST /installations
GET    /shipments                    POST /shipments

GET    /users      POST /users      PATCH /users/:id
GET    /roles      POST /roles      GET /permissions
GET    /departments POST /departments
GET    /lookups/:name                -- frontend dropdown'ları için
```

---

## Mega prompt referansı

Bu sistemin tüm gereksinim ve mimari kararlarının kaynağı:
`cnc_erp_crm_cloud_db_siber_guvenlik_mega_prompt.md`

38 modül, 50+ tablo, 100+ endpoint, 15 raporlama view'ı, OWASP risk listesi ve database/storage geçiş senaryoları orada detaylanmıştır.
