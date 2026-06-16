#!/usr/bin/env bash
# Render staging deploy — haksan-api + haksan-web (latest main commit).
set -euo pipefail

API_SVC="${API_SVC:-haksan-api}"
WEB_SVC="${WEB_SVC:-haksan-web}"

if ! command -v render >/dev/null 2>&1; then
  echo "Render CLI yok: brew install render"
  exit 1
fi

if ! render whoami -o text >/dev/null 2>&1; then
  echo "Önce: render login"
  exit 1
fi

echo "== Deploy: $API_SVC =="
render deploys create "$API_SVC" --wait --confirm -o text

echo ""
echo "== Deploy: $WEB_SVC =="
render deploys create "$WEB_SVC" --wait --confirm -o text

echo ""
echo "== Smoke =="
code=$(curl -sS -o /dev/null -w "%{http_code}" "https://${API_SVC}.onrender.com/api/v1/exports/companies")
echo "GET /exports/companies -> HTTP $code (beklenen: 401)"
curl -fsS "https://${API_SVC}.onrender.com/health" && echo
echo "Web: https://${WEB_SVC}.onrender.com"
