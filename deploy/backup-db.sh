#!/usr/bin/env bash
# PostgreSQL yedek — apps/api/.env içindeki DATABASE_URL kullanılır.
# Kullanım: ./deploy/backup-db.sh
# Cron: 0 3 * * * /var/www/haksan/deploy/backup-db.sh
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/haksan}"
ENV_FILE="${ENV_FILE:-$APP_ROOT/apps/api/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/haksan}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[backup] HATA: $ENV_FILE bulunamadı" >&2
  exit 1
fi

# shellcheck disable=SC1090
source <(grep -E '^DATABASE_URL=' "$ENV_FILE" | sed 's/^/export /')

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[backup] HATA: DATABASE_URL tanımlı değil" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/haksan_${STAMP}.sql.gz"

echo "[backup] $OUT"
pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip -9 > "$OUT"
echo "[backup] tamam ($(du -h "$OUT" | cut -f1))"

find "$BACKUP_DIR" -name 'haksan_*.sql.gz' -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
