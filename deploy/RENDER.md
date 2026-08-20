# Render Deploy Kılavuzu

> **Not:** Production ortamı kendi VDS sunucunuzdur ([`README.md`](README.md)).
> Render bu repoda yalnızca **staging / demo** veya geçici test içindir.

Monorepo: **NestJS API** + **Vite SPA** + **PostgreSQL**. Blueprint: kökteki [`render.yaml`](../render.yaml).

## 1. Kodu GitHub'a gönder

```bash
git add render.yaml deploy/RENDER.md
git commit -m "chore: add Render Blueprint for API, web, and Postgres"
git push origin main
```

## 2. Render hesabı + Blueprint

1. [render.com](https://render.com) → **New** → **Blueprint**
2. Repo: `bayramsen/haksan`, branch `main`
3. Blueprint `render.yaml` dosyasını okur; 3 kaynak oluşturur:
   - `haksan-db` (PostgreSQL)
   - `haksan-api` (Node web service)
   - `haksan-web` (static site)

Alternatif CLI:

```bash
render login
render blueprints validate render.yaml
# Dashboard üzerinden Blueprint bağlantısı önerilir
```

## 3. Zorunlu ortam değişkenleri (Dashboard)

API servisi (`haksan-api`) → **Environment**:

| Değişken | Açıklama |
|----------|----------|
| `S3_ENDPOINT` | Cloudflare R2: `https://<account_id>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY_ID` | R2 API token |
| `S3_SECRET_ACCESS_KEY` | R2 API token secret |
| `S3_BACKUP_BUCKET` | R2'de `erp-backups` bucket oluşturun (Blueprint varsayılanı) |
| `SMTP_HOST` | Örn. `smtp.resend.com` |
| `SMTP_FROM` | Örn. `noreply@sizin-domain.com` |
| `SENTRY_DSN` | (Önerilir) Sentry proje DSN — 5xx ve exception yakalama |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | (Opsiyonel) OTLP trace endpoint (Grafana Cloud, Honeycomb, …) |
| `OTEL_EXPORTER_OTLP_HEADERS` | OTLP auth header (örn. Grafana `Authorization=Basic%20…`) |
| `METRICS_TOKEN` | (Önerilir) `/metrics` için Bearer token — Prometheus scrape koruması |

JWT secret'ları Blueprint `generateValue` ile üretilir.

### Gözlemlenebilirlik hızlı kurulum

1. **Sentry** — [sentry.io](https://sentry.io) → Node.js projesi → DSN'i `SENTRY_DSN` olarak ekleyin.
2. **Traces** — Grafana Cloud / Honeycomb OTLP HTTP endpoint'ini `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS` ile ekleyin.
3. **Metrikler** — `openssl rand -hex 32` ile `METRICS_TOKEN` üretin; Grafana Agent veya Prometheus'ta `Authorization: Bearer <token>` ile `/metrics` scrape edin.

```bash
# Doğrulama (token set ise):
curl -s -H "Authorization: Bearer $METRICS_TOKEN" https://haksan-api.onrender.com/metrics | head
```

### DB yedek sınırı

Bu Blueprint yalnız staging içindir ve bunu makinece belirten `DEPLOYMENT_PROFILE=staging` değerini taşır. Staging'de `DB_BACKUP_ENABLED=false` ve `DB_BACKUP_REQUIRED=false` kullanılır; ücretsiz Render ortamı production yedek zinciri sayılmaz. Production yalnız VDS/ECR iş akışından, `DEPLOYMENT_PROFILE=production`, `DB_BACKUP_ENABLED=true` ve `DB_BACKUP_REQUIRED=true` ile yayınlanır. Ayrım `npm run validate:deployment-profiles` tarafından CI'da doğrulanır.

## 4. İlk veritabanı kurulumu

Ücretsiz Render planında `preDeployCommand` yoktur. Migration'lar API `startCommand` zincirinde, uygulama başlamadan önce çalışır. **İlk admin** için Render Shell (API servisi):

```bash
TENANT_NAME='Haksan' TENANT_SLUG='haksan' \
ADMIN_EMAIL='admin@ornek.com' ADMIN_PASSWORD='GucluParola1!' ADMIN_NAME='Yönetici' \
npm run db:bootstrap
```

> `db:seed` (demo) production'da **çalıştırılmaz**.

## 5. URL'ler

| Servis | URL |
|--------|-----|
| Web | https://haksan-web.onrender.com |
| API | https://haksan-api.onrender.com |
| Health | https://haksan-api.onrender.com/health |

## 6. Cookie / CORS notu

Frontend ve API farklı `*.onrender.com` alt alan adlarında olduğu için:

- `CORS_ORIGINS=https://haksan-web.onrender.com`
- `COOKIE_SAMESITE=none` + `COOKIE_SECURE=true`

Özel domain kullanırsanız `render.yaml` içindeki `CORS_ORIGINS`, `COOKIE_DOMAIN` ve `VITE_API_BASE_URL` değerlerini güncelleyip yeniden deploy edin.

## 7. Doğrulama

```bash
curl -s https://haksan-api.onrender.com/health
```

Tarayıcıda https://haksan-web.onrender.com → giriş yapın.

## 8. Deploy sonrası migration doğrulama

API `startCommand` zinciri her deploy'da önce migration'ları uygular
(`node apps/api/dist/db/migrate.js`), ardından uygulamayı başlatır. İlk deploy sonrası kısa kontrol listesi:

- [ ] **Deploy log'u**: API servisinin "Deploy" log'unda `[migrate] running pending migrations …` ve `[migrate] done.` satırlarını görün. Hata varsa `/health/ready` 503 döner ve trafik başlamaz.
- [ ] **Şema kontrolü** (API Shell veya `render psql`):

```sql
-- 0024_service_metadata
SELECT column_name FROM information_schema.columns
WHERE table_name = 'service_tickets' AND column_name = 'metadata';

-- 0026_quote_revision
SELECT column_name FROM information_schema.columns
WHERE table_name = 'quotes' AND column_name = 'revision_no';
```

  İki sorgu da bir satır döndürmelidir.

- [ ] **Uygulanan migration sayısı**: `/health/ready` 200 dönüyorsa journal'daki tüm migration'lar uygulanmış demektir (health check migration sayısına bağlıdır).
- [ ] **Revizyon backfill**: Aynı fırsata bağlı tekliflerde `revision_no` 1, 2, 3 … şeklinde artmalı:

```sql
SELECT opportunity_id, document_no, revision_no
FROM quotes
WHERE opportunity_id IS NOT NULL
ORDER BY opportunity_id, revision_no;
```
