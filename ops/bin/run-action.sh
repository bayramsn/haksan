#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_ops_env

ACTION="${1:-}"
ACTION_ID="${2:-manual}"

if [[ -z "$ACTION" ]]; then
  die "usage: run-action.sh <action> [action-id]"
fi

case "$ACTION" in
  diagnostics|smoke_test|nginx_test|nginx_reload|restart_nginx|restart_api|backup_verify|deploy_prepare|deploy_execute) ;;
  *) die "action is not whitelisted: $ACTION" ;;
esac

case "$ACTION" in
  deploy_prepare|deploy_execute) require_deploy_enabled ;;
  nginx_reload|restart_nginx|restart_api) require_actions_enabled ;;
  diagnostics|smoke_test|nginx_test|backup_verify) require_ops_enabled ;;
esac

append_audit "action_started" "{\"action\":\"$ACTION\",\"actionId\":\"$ACTION_ID\"}"

if ! dry_run_or_continue "$ACTION"; then
  append_audit "action_completed" "{\"action\":\"$ACTION\",\"actionId\":\"$ACTION_ID\",\"dryRun\":true}"
  exit 0
fi

run_selected_action() {
  case "$ACTION" in
  diagnostics)
    "$SCRIPT_DIR/diagnostics.sh"
    ;;
  smoke_test)
    base="$(public_base_url)"
    [[ -x "$APP_ROOT/scripts/smoke-production.sh" ]] || die "smoke script missing: $APP_ROOT/scripts/smoke-production.sh"
    "$APP_ROOT/scripts/smoke-production.sh" "$base"
    ;;
  nginx_test)
    compose exec -T nginx nginx -t
    ;;
  nginx_reload)
    compose exec -T nginx nginx -t
    compose exec -T nginx nginx -s reload
    ;;
  restart_nginx)
    compose restart nginx
    sleep 3
    code="$(curl_code "$(public_base_url)/health")"
    [[ "$code" == "200" ]] || die "health failed after nginx restart: HTTP $code"
    ;;
  restart_api)
    compose restart api
    wait_ready 30 || die "readiness failed after api restart"
    ;;
  backup_verify)
    BACKUP_DIR="${BACKUP_DIR:-$APP_ROOT/backups/postgres}"
    latest="$(find "$BACKUP_DIR" -name 'haksan_*.sql.gz' -type f -print 2>/dev/null | sort | tail -1 || true)"
    [[ -n "$latest" ]] || die "no backup found in $BACKUP_DIR"
    gzip -t "$latest"
    if stat -c %Y "$latest" >/dev/null 2>&1; then
      mtime="$(stat -c %Y "$latest")"
    else
      mtime="$(stat -f %m "$latest")"
    fi
    age_hours="$(( ($(date +%s) - mtime) / 3600 ))"
    [[ "$age_hours" -le "${OPS_BACKUP_MAX_AGE_HOURS:-26}" ]] || die "backup is stale: ${age_hours}h"
    printf 'backup_ok=%s age_hours=%s\n' "$latest" "$age_hours"
    ;;
  deploy_prepare)
    "$SCRIPT_DIR/deploy-prepare.sh"
    ;;
  deploy_execute)
    "$SCRIPT_DIR/deploy-execute.sh"
    ;;
  esac
}

set +e
run_selected_action
rc=$?
set -e

if [[ "$rc" -eq 0 ]]; then
  append_audit "action_completed" "{\"action\":\"$ACTION\",\"actionId\":\"$ACTION_ID\"}"
else
  append_audit "action_failed" "{\"action\":\"$ACTION\",\"actionId\":\"$ACTION_ID\",\"exitCode\":$rc}"
fi

exit "$rc"
