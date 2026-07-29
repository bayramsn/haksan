#!/usr/bin/env bash
set -euo pipefail
umask 077

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_ROOT"

ENV_FILE="${ENV_FILE:-.env}"
BACKUP_DIR="${BACKUP_DIR:-$APP_ROOT/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
DUMP_TIMEOUT_SECONDS="${DUMP_TIMEOUT_SECONDS:-1800}"
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
[[ "$DUMP_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] && [[ "$DUMP_TIMEOUT_SECONDS" -ge 30 ]] || {
  printf '[backup] DUMP_TIMEOUT_SECONDS must be an integer of at least 30.\n' >&2
  exit 1
}
POSTGRES_USER="$(read_env_value POSTGRES_USER)"
POSTGRES_DB="$(read_env_value POSTGRES_DB)"
[[ -n "$POSTGRES_USER" && -n "$POSTGRES_DB" ]] || { printf '[backup] POSTGRES_USER and POSTGRES_DB are required.\n' >&2; exit 1; }

detect_compose
install -d -m 0700 "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/haksan_${stamp}.sql.gz"
tmp="$out.tmp.$$"
trap 'rm -f "$tmp"' EXIT

run_dump() {
  local -a command=("${COMPOSE_CMD[@]}" --env-file "$ENV_FILE" exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges)
  if command -v timeout >/dev/null 2>&1; then
    # A non-interactive backup must never inherit an SSH/CI terminal. In a
    # pipeline, timeout creates a separate process group; reading that terminal
    # would stop the dump with SIGTTIN and leave the deployment waiting.
    timeout "$DUMP_TIMEOUT_SECONDS" "${command[@]}" </dev/null
    return
  fi

  # macOS does not ship GNU timeout. Keep the compose-based dump bounded there.
  "${command[@]}" </dev/null &
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
printf '[backup] wrote %s\n' "$out"
