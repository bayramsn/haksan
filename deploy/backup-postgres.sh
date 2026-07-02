#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_ROOT"

ENV_FILE="${ENV_FILE:-.env}"
BACKUP_DIR="${BACKUP_DIR:-$APP_ROOT/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
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
    printf '[backup] Docker Compose not found.\n' >&2
    exit 1
  fi
}

compose() {
  "${COMPOSE_CMD[@]}" "$@"
}

[[ -f "$ENV_FILE" ]] || { printf '[backup] %s missing.\n' "$ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

detect_compose
install -d -m 0700 "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmp="$BACKUP_DIR/haksan-${stamp}.dump.tmp"
out="$BACKUP_DIR/haksan-${stamp}.dump"

compose --env-file "$ENV_FILE" exec -T postgres pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --format=custom \
  --no-owner \
  --no-privileges > "$tmp"

chmod 0600 "$tmp"
mv "$tmp" "$out"
find "$BACKUP_DIR" -type f -name 'haksan-*.dump' -mtime "+$RETENTION_DAYS" -delete

printf '[backup] wrote %s\n' "$out"
