#!/usr/bin/env bash
# PostgreSQL yedek. Tek kanonik artefakt: backups/postgres/haksan_<UTC>.sql.gz
set -euo pipefail
umask 077

APP_ROOT="${APP_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${ENV_FILE:-$APP_ROOT/apps/api/.env}"
BACKUP_DIR="${BACKUP_DIR:-$APP_ROOT/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
DUMP_TIMEOUT_SECONDS="${DUMP_TIMEOUT_SECONDS:-1800}"

read_env_value() {
  local key="$1" value
  value="$(awk -v key="$key" 'index($0, key "=") == 1 { value = substr($0, length(key) + 2) } END { print value }' "$ENV_FILE")"
  value="${value%$'\r'}"
  if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' && "${#value}" -ge 2 ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "${value:0:1}" == "'" && "${value: -1}" == "'" && "${#value}" -ge 2 ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

[[ -f "$ENV_FILE" ]] || { printf '[backup] %s missing.\n' "$ENV_FILE" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { printf '[backup] node is required to safely parse DATABASE_URL.\n' >&2; exit 1; }
command -v pg_dump >/dev/null 2>&1 || { printf '[backup] pg_dump is required.\n' >&2; exit 1; }

database_url="$(read_env_value DATABASE_URL)"
[[ -n "$database_url" ]] || { printf '[backup] DATABASE_URL is not configured.\n' >&2; exit 1; }
[[ "$DUMP_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] && [[ "$DUMP_TIMEOUT_SECONDS" -ge 30 ]] || {
  printf '[backup] DUMP_TIMEOUT_SECONDS must be an integer of at least 30.\n' >&2
  exit 1
}

install -d -m 0700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/haksan_${stamp}.sql.gz"
tmp="$out.tmp.$$"
pgpass_file="$(mktemp "$BACKUP_DIR/.pgpass.XXXXXX")"

cleanup() {
  rm -f "$tmp" "$pgpass_file"
}
trap cleanup EXIT

# Password is written only to a 0600 temporary pgpass file. The URI passed to
# pg_dump has the password removed, so it cannot be read from process argv.
safe_database_url="$({ DATABASE_URL="$database_url" PGPASSFILE="$pgpass_file" node -e '
const { chmodSync, writeFileSync } = require("node:fs");
const url = new URL(process.env.DATABASE_URL);
if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL must be PostgreSQL");
const decode = (value) => decodeURIComponent(value);
const escape = (value) => value.replace(/([\\:])/g, "\\\\$1");
const host = url.hostname;
const port = url.port || "5432";
const database = decode(url.pathname.replace(/^\//, ""));
const username = decode(url.username);
const password = decode(url.password);
if (!host || !database || !username || !password) throw new Error("DATABASE_URL is incomplete");
writeFileSync(process.env.PGPASSFILE, `${escape(host)}:${escape(port)}:${escape(database)}:${escape(username)}:${escape(password)}\n`, { mode: 0o600 });
chmodSync(process.env.PGPASSFILE, 0o600);
url.password = "";
url.searchParams.delete("password");
process.stdout.write(url.toString());
'; })"

run_dump() {
  local -a command=(pg_dump --no-owner --no-acl --dbname "$safe_database_url")
  if command -v timeout >/dev/null 2>&1; then
    timeout "$DUMP_TIMEOUT_SECONDS" "${command[@]}"
    return
  fi

  # macOS does not ship GNU timeout. A background watchdog keeps the production
  # backup bounded there as well, rather than silently running without a limit.
  "${command[@]}" &
  local dump_pid=$!
  ( sleep "$DUMP_TIMEOUT_SECONDS"; kill -TERM "$dump_pid" 2>/dev/null || true ) &
  local watchdog_pid=$!
  local status=0
  wait "$dump_pid" || status=$?
  kill "$watchdog_pid" 2>/dev/null || true
  wait "$watchdog_pid" 2>/dev/null || true
  return "$status"
}

run_dump | gzip -9 > "$tmp"
gzip -t "$tmp"
chmod 0600 "$tmp"
mv "$tmp" "$out"
find "$BACKUP_DIR" -type f -name 'haksan_*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

trap - EXIT
rm -f "$pgpass_file"
printf '[backup] wrote %s\n' "$out"
