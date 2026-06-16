#!/usr/bin/env bash
# Haksan CRM — VDS production deploy (güvenli güncelleme veya ilk kurulum).
#
# Kullanım:
#   export VITE_API_BASE_URL=https://crm.alanadiniz.com/api/v1
#   ./deploy/deploy-vds.sh              # güncelleme
#   ./deploy/deploy-vds.sh --first-run  # ilk kurulum (bootstrap + systemd)
#
# Ortam değişkenleri:
#   APP_ROOT, VITE_API_BASE_URL, SKIP_GIT_PULL=1, SKIP_BACKUP=1, SKIP_SMOKE=1
set -euo pipefail

APP_ROOT="${APP_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$APP_ROOT"

FIRST_RUN=0
for arg in "$@"; do
  case "$arg" in
    --first-run) FIRST_RUN=1 ;;
    -h|--help)
      echo "Kullanım: $0 [--first-run]"
      exit 0
      ;;
  esac
done

log() { echo "[deploy] $*"; }
die() { echo "[deploy] HATA: $*" >&2; exit 1; }

# ── Ön kontroller ──
NODE_MAJOR="$(node -v | sed 's/v//' | cut -d. -f1)"
[[ "$NODE_MAJOR" == "20" ]] || die "Node 20 gerekli (mevcut: $(node -v))"

ENV_FILE="$APP_ROOT/apps/api/.env"
[[ -f "$ENV_FILE" ]] || die "apps/api/.env yok — önce deploy/.env.production.example kopyalayın"

if [[ -z "${VITE_API_BASE_URL:-}" ]]; then
  CORS_LINE="$(grep -E '^CORS_ORIGINS=' "$ENV_FILE" | head -1 || true)"
  if [[ -n "$CORS_LINE" ]]; then
    ORIGIN="$(echo "$CORS_LINE" | cut -d= -f2- | tr -d '"' | cut -d, -f1)"
    VITE_API_BASE_URL="${ORIGIN}/api/v1"
    log "VITE_API_BASE_URL otomatik: $VITE_API_BASE_URL"
  else
    die "VITE_API_BASE_URL export edin (örn. https://crm.alanadi.com/api/v1)"
  fi
fi

# ── Yedek ──
if [[ "${SKIP_BACKUP:-}" != "1" ]] && [[ "$FIRST_RUN" != "1" ]]; then
  if command -v pg_dump >/dev/null 2>&1; then
    APP_ROOT="$APP_ROOT" bash "$APP_ROOT/deploy/backup-db.sh"
  else
    log "pg_dump yok — yedek atlandı (postgresql-client kurun)"
  fi
fi

# ── Kod güncelle ──
if [[ "${SKIP_GIT_PULL:-}" != "1" ]] && [[ -d .git ]]; then
  log "git pull"
  git pull --ff-only
fi

# ── Build metadata ──
GIT_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
touch "$ENV_FILE"
if grep -q '^GIT_COMMIT=' "$ENV_FILE"; then
  sed -i.bak "s/^GIT_COMMIT=.*/GIT_COMMIT=$GIT_COMMIT/" "$ENV_FILE"
else
  echo "GIT_COMMIT=$GIT_COMMIT" >> "$ENV_FILE"
fi
if grep -q '^BUILD_TIME=' "$ENV_FILE"; then
  sed -i.bak "s/^BUILD_TIME=.*/BUILD_TIME=$BUILD_TIME/" "$ENV_FILE"
else
  echo "BUILD_TIME=$BUILD_TIME" >> "$ENV_FILE"
fi
rm -f "$ENV_FILE.bak"

# ── Bağımlılık + build ──
log "npm ci"
NPM_CONFIG_PRODUCTION=false npm ci
log "build shared + api"
npm run build:shared
npm run build:api
log "build web ($VITE_API_BASE_URL)"
VITE_API_BASE_URL="$VITE_API_BASE_URL" npm run build:web

# ── Offsite backup (R2/S3) — migrate öncesi, dist hazır olduktan sonra ──
if grep -qE '^DB_BACKUP_ENABLED=true' "$ENV_FILE" 2>/dev/null; then
  log "db:backup (R2/S3 offsite)"
  if ! node apps/api/dist/db/backup.js; then
    if grep -qE '^DB_BACKUP_REQUIRED=true' "$ENV_FILE" 2>/dev/null; then
      die "Offsite backup başarısız (DB_BACKUP_REQUIRED=true)"
    fi
    log "Offsite backup atlandı/başarısız — devam (DB_BACKUP_REQUIRED!=true)"
  fi
fi

# ── Migrate (başarısızsa restart yok) ──
log "db:migrate"
if ! node apps/api/dist/db/migrate.js; then
  die "Migration başarısız — API yeniden başlatılmadı. Rollback için deploy/README.md"
fi

log "db:data-migrate"
if ! node apps/api/dist/db/data-migrate.js; then
  die "Data migration başarısız — API yeniden başlatılmadı"
fi

# ── İlk kurulum: bootstrap ──
if [[ "$FIRST_RUN" == "1" ]]; then
  log "db:bootstrap (ilk kurulum)"
  if [[ -z "${TENANT_NAME:-}" || -z "${ADMIN_EMAIL:-}" || -z "${ADMIN_PASSWORD:-}" ]]; then
    read -r -p "Tenant adı: " TENANT_NAME
    read -r -p "Tenant slug [firma]: " TENANT_SLUG
    TENANT_SLUG="${TENANT_SLUG:-firma}"
    read -r -p "Admin e-posta: " ADMIN_EMAIL
    read -r -s -p "Admin parola: " ADMIN_PASSWORD
    echo
    read -r -p "Admin adı [Yönetici]: " ADMIN_NAME
    ADMIN_NAME="${ADMIN_NAME:-Yönetici}"
  fi
  (cd apps/api && \
    TENANT_NAME="$TENANT_NAME" TENANT_SLUG="${TENANT_SLUG:-firma}" \
    ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" ADMIN_NAME="${ADMIN_NAME:-Yönetici}" \
    npm run db:bootstrap)

  if [[ ! -f /etc/systemd/system/haksan-api.service ]]; then
    log "systemd unit kurulumu (sudo gerekir)"
    sudo cp deploy/haksan-api.service /etc/systemd/system/haksan-api.service
    sudo systemctl daemon-reload
    sudo systemctl enable haksan-api
  fi
fi

# ── Restart ──
if systemctl is-active --quiet haksan-api 2>/dev/null; then
  log "systemctl restart haksan-api"
  sudo systemctl restart haksan-api
elif [[ "$FIRST_RUN" == "1" ]]; then
  log "systemctl start haksan-api"
  sudo systemctl start haksan-api
else
  log "haksan-api systemd servisi yok — atlandı"
fi

if command -v nginx >/dev/null 2>&1 && [[ -d /etc/nginx ]]; then
  sudo nginx -t && sudo systemctl reload nginx
fi

# ── Smoke ──
if [[ "${SKIP_SMOKE:-}" != "1" ]]; then
  SMOKE_BASE="$(echo "$VITE_API_BASE_URL" | sed 's|/api/v1/*$||')"
  if [[ -f "$APP_ROOT/scripts/smoke-production.sh" ]]; then
    bash "$APP_ROOT/scripts/smoke-production.sh" "$SMOKE_BASE"
  else
    log "smoke script yok — curl /health"
    curl -sf "$SMOKE_BASE/health" >/dev/null || die "Smoke /health başarısız"
    curl -sf "$SMOKE_BASE/health/ready" >/dev/null || die "Smoke /health/ready başarısız (migration?)"
  fi
fi

log "Deploy tamamlandı (commit=$GIT_COMMIT)"
