#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_ROOT"

ENV_FILE="${ENV_FILE:-.env}"
COMPOSE_CMD=()

detect_compose() {
  if [[ -n "${COMPOSE:-}" ]]; then
    # shellcheck disable=SC2206
    COMPOSE_CMD=($COMPOSE)
  elif docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
  elif docker-compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
  else
    printf '[security-check] Docker Compose not found.\n' >&2
    exit 1
  fi
}

compose() {
  "${COMPOSE_CMD[@]}" "$@"
}

[[ -f "$ENV_FILE" ]] || { printf '[security-check] %s missing.\n' "$ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

detect_compose

mkdir -p deploy/security

printf '[security-check] docker compose config\n'
compose --env-file "$ENV_FILE" config --quiet

printf '[security-check] service health\n'
compose --env-file "$ENV_FILE" ps

printf '[security-check] production npm audit\n'
compose --env-file "$ENV_FILE" run --rm api npm audit --omit=dev --json > deploy/security/npm-audit-prod.json || true
python3 - <<'PY'
import json
from pathlib import Path

path = Path("deploy/security/npm-audit-prod.json")
data = json.loads(path.read_text())
counts = data.get("metadata", {}).get("vulnerabilities", {})
print("[security-check] npm audit:", counts)
if counts.get("critical", 0) or counts.get("high", 0):
    raise SystemExit(2)
PY

if [[ -n "${APP_DOMAIN:-}" ]]; then
  printf '[security-check] public health\n'
  curl -fsS "https://${APP_DOMAIN}/health" >/dev/null
fi

printf '[security-check] ok\n'
