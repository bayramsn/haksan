# VDS / VPS Kurulum Kılavuzu

**Production hedefi:** kendi VDS sunucunuz. Render yalnızca isteğe bağlı staging/demo içindir ([`RENDER.md`](RENDER.md)).

Tek sunucu (Ubuntu 22.04/24.04) üzerinde production kurulumu. Şablonlar:
[`nginx.conf.example`](nginx.conf.example), [`haksan-api.service`](haksan-api.service),
[`.env.production.example`](.env.production.example), [`deploy-vds.sh`](deploy-vds.sh), [`backup-db.sh`](backup-db.sh).

## 0. Önkoşullar
```bash
# Node 20+, Docker, nginx, certbot
sudo apt update && sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
# Docker: https://docs.docker.com/engine/install/ubuntu/
sudo apt install -y certbot python3-certbot-nginx
```

## 1. Kullanıcı + dizin
```bash
sudo useradd -r -m -d /var/www/haksan -s /usr/sbin/nologin haksan
sudo mkdir -p /var/www/haksan && sudo chown -R haksan:haksan /var/www/haksan
# Kodu /var/www/haksan içine kopyala/clone et
```

## 2. Altyapı (Postgres + MinIO)
```bash
cd /var/www/haksan
# .env (compose için): güçlü parolalar + BIND_HOST=127.0.0.1 (varsayılan)
cat > .env <<'EOF'
POSTGRES_PASSWORD=STRONG_DB_PWD
MINIO_ROOT_USER=STRONG_MINIO_USER
MINIO_ROOT_PASSWORD=STRONG_MINIO_PWD
# BIND_HOST=127.0.0.1   # varsayılan; portlar internete açılmaz
EOF
# Mailhog'u prod'da kaldır (gerçek SMTP kullan):
docker compose up -d postgres minio minio-init
```
> **Güvenlik:** docker-compose portları artık varsayılan olarak **yalnızca 127.0.0.1**'e bind eder. Yine de `ufw` ile güvenlik duvarı kur:
> ```bash
> sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
> ```

## 3. Build + migrate
```bash
cd /var/www/haksan
sudo -u haksan bash -c '
  npm ci
  npm run build:shared
  npm run build:api
  VITE_API_BASE_URL=https://crm.alanadi.com/api/v1 npm run build:web
'
# Prod env
sudo -u haksan cp deploy/.env.production.example apps/api/.env
sudo -u haksan nano apps/api/.env     # secret'ları doldur (openssl rand -hex 32)
# Migration (şema).
sudo -u haksan bash -c 'cd apps/api && npm run db:migrate'
# PRODUCTION bootstrap — tenant + roller/izinler + TEK admin (demo veri YOK).
# ⚠️ db:seed (demo) PROD'da ÇALIŞTIRILMAZ — bilinen şifreli demo hesaplar oluşturur.
sudo -u haksan bash -c "cd apps/api && \
  TENANT_NAME='Firma Adı' TENANT_SLUG='firma' \
  ADMIN_EMAIL='admin@alanadi.com' ADMIN_PASSWORD='GucluParola1!' ADMIN_NAME='Yönetici' \
  npm run db:bootstrap"
```
> `db:bootstrap` idempotent'tir; lookupları da kendi içinde seed eder. İlk girişten sonra admin parolasını uygulamadan değiştir.

## 4. API servisi (systemd)
```bash
sudo cp deploy/haksan-api.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now haksan-api
journalctl -u haksan-api -f          # log
```

## 5. nginx + TLS
```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/haksan.conf
sudo nano /etc/nginx/sites-available/haksan.conf      # alanadi.com → kendi domain'in
sudo ln -s /etc/nginx/sites-available/haksan.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d crm.alanadi.com -d storage.alanadi.com
sudo nginx -t && sudo systemctl reload nginx
```

## 6. Doğrulama
```bash
./scripts/smoke-production.sh https://crm.alanadi.com
curl -s https://crm.alanadi.com/health/ready | jq .
```

## 7. Güncelleme deploy (runbook)

Her yeni sürüm için (SSH ile sunucuda):

```bash
cd /var/www/haksan
export VITE_API_BASE_URL=https://crm.alanadi.com/api/v1   # domain'inize göre
./deploy/deploy-vds.sh
```

Script sırası: **pg_dump yedek** → `git pull` → `npm ci` → build → **migrate** → `systemctl restart` → smoke.

İlk kurulum için:
```bash
./deploy/deploy-vds.sh --first-run
```

Ortam değişkenleri: `SKIP_BACKUP=1`, `SKIP_GIT_PULL=1`, `SKIP_SMOKE=1` (acil durum).

## 8. Rollback

1. API'yi durdur: `sudo systemctl stop haksan-api`
2. Son yedeği geri yükle:
   ```bash
   gunzip -c /var/backups/haksan/haksan_YYYYMMDD.sql.gz | psql "$DATABASE_URL"
   ```
3. Önceki git commit'e dön: `git checkout <tag-veya-commit>`
4. Build + migrate (gerekirse) + `systemctl start haksan-api`

## 9. Otomatik yedekleme (cron)

```bash
sudo apt install -y postgresql-client
chmod +x /var/www/haksan/deploy/backup-db.sh
sudo crontab -e
# Her gece 03:00
0 3 * * * /var/www/haksan/deploy/backup-db.sh >> /var/log/haksan-backup.log 2>&1
```

Haftalık off-site kopya için yedeği S3/R2'ye `aws s3 cp` veya `rclone` ile taşıyın.

## 10. Secret rotation checklist

- [ ] `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — tüm oturumlar düşer
- [ ] `POSTGRES_PASSWORD` — `DATABASE_URL` güncelle + restart
- [ ] MinIO `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`
- [ ] Admin parolası — uygulama içinden değiştir

## 11. Monitoring

- UptimeRobot / Better Stack: `https://crm.alanadi.com/health` (5 dk)
- Readiness: `/health/ready` (migration eksikse 503)
- Log: `journalctl -u haksan-api -f`

## Eski doğrulama (manuel)
```bash
curl -s https://crm.alanadi.com/api/v1/auth/login -X POST \
  -H 'Content-Type: application/json' -d '{"email":"a@b.c","password":"xxxxxxxx"}'
# 401/422 dönmeli (sunucu ayakta). 6+ hızlı denemede 429 (rate limit).
```

## Sık yapılan hatalar (deployment gotchas)
| Belirti | Sebep | Çözüm |
|---|---|---|
| SPA açılıyor ama hiçbir veri gelmiyor, konsol `localhost:3000` hatası | `VITE_API_BASE_URL` build'den önce set edilmedi | Doğru URL ile **yeniden** `build:web` |
| Dosya yükleme/indirme 403/erişilemiyor | `S3_ENDPOINT` tarayıcıdan erişilemez (localhost/iç IP) | `S3_ENDPOINT=https://storage.alanadi.com` + nginx storage server bloğu |
| Presigned URL "SignatureDoesNotMatch" | nginx storage proxy'sinde `Host` header değişmiş | `proxy_set_header Host $host` (değiştirme) |
| Login sonrası hemen logout / 401 | Cookie `Secure` ama HTTP, ya da farklı domain + `SameSite=strict` | HTTPS + aynı-origin topoloji veya `SameSite=none`+`COOKIE_DOMAIN` |
| Tüm kullanıcılar aynı anda rate-limit'e takılıyor / login sonrası modüller `429` oluyor | AWS ALB/proxy IP'si rate-limit anahtarı oluyor veya SPA ilk yükleme fan-out'u tek `/api/` edge kotasını dolduruyor | Güncel `nginx.conf.template`/`nginx.conf.example` ile yeniden deploy et (`real_ip_*`, `api_per_ip rate=300r/m`, `burst=240`) |
| API başlamıyor: "Invalid environment configuration" | Prod'da `COOKIE_SECURE!=true` / CORS localhost / dev reset token açık | env'i `.env.production.example`'a göre düzelt (fail-fast koruması) |
