#!/usr/bin/env bash
# Production smoke test — deploy sonrası çalıştırın.
# Kullanım: ./scripts/smoke-production.sh https://crm.alanadiniz.com
set -euo pipefail

BASE="${1:-}"
if [[ -z "$BASE" ]]; then
  echo "Kullanım: $0 BASE_URL" >&2
  echo "Örnek: $0 https://crm.alanadi.com" >&2
  exit 1
fi
BASE="${BASE%/}"

check() {
  local path="$1"
  local expect="${2:-200}"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")"
  if [[ "$code" != "$expect" ]]; then
    echo "[smoke] FAIL $path → HTTP $code (beklenen $expect)" >&2
    exit 1
  fi
  echo "[smoke] OK   $path → $code"
}

check "/health" 200
check "/health/ready" 200
check "/health/version" 200
check "/" 200

# API kökü (nginx /api/ proxy üzerinden değil; doğrudan API portu yoksa atla)
API_CODE="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/auth/login" -X POST \
  -H 'Content-Type: application/json' -d '{"email":"x@y.z","password":"invalid12"}' || true)"
if [[ "$API_CODE" == "401" || "$API_CODE" == "422" || "$API_CODE" == "400" ]]; then
  echo "[smoke] OK   /api/v1/auth/login → $API_CODE (API ayakta)"
else
  echo "[smoke] WARN /api/v1/auth/login → $API_CODE (beklenen 401/422)"
fi

echo "[smoke] Tüm kontroller geçti"
