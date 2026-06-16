#!/usr/bin/env bash
# Render staging deploy — haksan-api + haksan-web (latest main commit).
set -euo pipefail

API_ID="${API_ID:-srv-d8lcie0js32c73d7caug}"
WEB_ID="${WEB_ID:-srv-d8lcj328qa3s73a24760}"
API_URL="${API_URL:-https://haksan-api.onrender.com}"
WEB_URL="${WEB_URL:-https://haksan-web.onrender.com}"

if ! command -v render >/dev/null 2>&1; then
  echo "Render CLI yok: brew install render"
  exit 1
fi

if ! render whoami -o text >/dev/null 2>&1; then
  echo "Önce: render login"
  exit 1
fi

echo "== Deploy: haksan-api ($API_ID) =="
render deploys create "$API_ID" --wait --confirm -o text

echo ""
echo "== Deploy: haksan-web ($WEB_ID) =="
render deploys create "$WEB_ID" --wait --confirm -o text

echo ""
echo "== Smoke =="
code=$(curl -sS -o /dev/null -w "%{http_code}" "${API_URL}/api/v1/exports/companies")
echo "GET /exports/companies -> HTTP $code (beklenen: 401)"
curl -fsS "${API_URL}/health" && echo
echo "Web: ${WEB_URL}"
