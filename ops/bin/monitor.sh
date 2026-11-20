#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_ops_env

if [[ "${OPS_ENABLED:-true}" == "false" ]]; then
  log "OPS_ENABLED=false; monitor skipped"
  exit 0
fi

base="$(public_base_url)"
stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
health="$(curl_code "$base/health")"
ready="$(curl_code "$base/health/ready")"

disk_pct="$(df -P "$APP_ROOT" 2>/dev/null | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
disk_pct="${disk_pct:-0}"
warn="${OPS_DISK_WARN_PCT:-85}"
crit="${OPS_DISK_CRIT_PCT:-92}"

api_errors="$(compose logs --tail="${OPS_LOG_WINDOW_LINES:-1000}" api 2>/dev/null | grep -Eic ' 5[0-9][0-9] | 429 |error|exception' || true)"
nginx_errors="$(compose logs --tail="${OPS_LOG_WINDOW_LINES:-1000}" nginx 2>/dev/null | grep -Eic ' 5[0-9][0-9] | 429 |error|crit|alert|emerg' || true)"
backup_age_hours=-1
BACKUP_DIR="${BACKUP_DIR:-$APP_ROOT/backups/postgres}"
latest_backup="$(find "$BACKUP_DIR" -name 'haksan_*.sql.gz' -type f -print 2>/dev/null | sort | tail -1 || true)"
if [[ -n "$latest_backup" ]]; then
  if stat -c %Y "$latest_backup" >/dev/null 2>&1; then
    backup_mtime="$(stat -c %Y "$latest_backup")"
  else
    backup_mtime="$(stat -f %m "$latest_backup")"
  fi
  backup_age_hours="$(( ($(date +%s) - backup_mtime) / 3600 ))"
fi

node "$OPS_ROOT/server/opsctl.js" snapshot \
  --payload-json "{\"ts\":\"$stamp\",\"baseUrl\":\"$base\",\"health\":\"$health\",\"ready\":\"$ready\",\"diskPct\":$disk_pct,\"apiErrors\":$api_errors,\"nginxErrors\":$nginx_errors,\"backupAgeHours\":$backup_age_hours}" >/dev/null

notify_action() {
  local type="$1" severity="$2" title="$3" details="$4"
  node "$OPS_ROOT/server/opsctl.js" create-action \
    --type "$type" \
    --severity "$severity" \
    --source monitor \
    --title "$title" \
    --details "$details" \
    --notify >/dev/null
}

if [[ "$health" != "200" || "$ready" != "200" ]]; then
  notify_action "restart_api" "critical" "API readiness failed" "health=$health ready=$ready base=$base"
fi

if [[ "$disk_pct" =~ ^[0-9]+$ && "$disk_pct" -ge "$crit" ]]; then
  notify_action "diagnostics" "critical" "Disk critical" "disk=${disk_pct}% threshold=${crit}%"
elif [[ "$disk_pct" =~ ^[0-9]+$ && "$disk_pct" -ge "$warn" ]]; then
  notify_action "diagnostics" "warning" "Disk warning" "disk=${disk_pct}% threshold=${warn}%"
fi

if [[ "$api_errors" -gt 0 || "$nginx_errors" -gt 0 ]]; then
  notify_action "diagnostics" "warning" "Recent API/nginx errors" "api_errors=$api_errors nginx_errors=$nginx_errors window_lines=${OPS_LOG_WINDOW_LINES:-1000}"
fi

if [[ "$backup_age_hours" -lt 0 ]]; then
  notify_action "backup_verify" "warning" "Backup not found" "backup_dir=$BACKUP_DIR"
elif ! gzip -t "$latest_backup" >/dev/null 2>&1; then
  notify_action "backup_verify" "critical" "Backup integrity failed" "backup=$latest_backup"
elif [[ "$backup_age_hours" -gt "${OPS_BACKUP_MAX_AGE_HOURS:-26}" ]]; then
  notify_action "backup_verify" "warning" "Backup is stale" "age_hours=$backup_age_hours threshold_hours=${OPS_BACKUP_MAX_AGE_HOURS:-26}"
fi

printf 'monitor ok ts=%s health=%s ready=%s disk=%s api_errors=%s nginx_errors=%s backup_age_hours=%s\n' "$stamp" "$health" "$ready" "$disk_pct" "$api_errors" "$nginx_errors" "$backup_age_hours"
