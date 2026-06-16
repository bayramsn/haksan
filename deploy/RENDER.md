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
| `SMTP_HOST` | Örn. `smtp.resend.com` |
| `SMTP_FROM` | Örn. `noreply@sizin-domain.com` |

JWT secret'ları Blueprint `generateValue` ile üretilir.

## 4. İlk veritabanı kurulumu

Migration'lar her deploy'da `preDeployCommand` ile çalışır. **İlk admin** için Render Shell (API servisi):

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
