#!/usr/bin/env bash
# Render production setup helper — auth, env check, bootstrap.
# Kullanım: ./deploy/render-setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v render >/dev/null 2>&1; then
  echo "Render CLI yok. Kur: brew install render"
  exit 1
fi

if ! render whoami -o text >/dev/null 2>&1; then
  echo "Render oturumu yok. Çalıştır: render login"
  exit 1
fi

echo "== Render servisleri =="
render services list -o text | rg 'haksan' || true

API_SVC="${API_SVC:-haksan-api}"
echo ""
echo "== Son deploy (API) =="
render deploys list "$API_SVC" -o text | head -5 || true

echo ""
echo "== Health =="
curl -fsS "https://${API_SVC}.onrender.com/health" && echo

if [[ "${SKIP_BOOTSTRAP:-}" == "1" ]]; then
  echo "SKIP_BOOTSTRAP=1 — bootstrap atlandı."
  exit 0
fi

: "${ADMIN_EMAIL:?ADMIN_EMAIL gerekli}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD gerekli}"
TENANT_NAME="${TENANT_NAME:-Haksan}"
TENANT_SLUG="${TENANT_SLUG:-haksan}"
ADMIN_NAME="${ADMIN_NAME:-Sistem Yöneticisi}"

echo ""
echo "== Bootstrap (Render Shell) =="
render ssh "$API_SVC" --confirm -e -- \
  env TENANT_NAME="$TENANT_NAME" TENANT_SLUG="$TENANT_SLUG" \
  ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" ADMIN_NAME="$ADMIN_NAME" \
  npm run db:bootstrap

echo ""
echo "Bitti. Giriş: https://haksan-web.onrender.com"
