#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_ops_env
require_deploy_enabled

base="$(public_base_url)"
stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
prepare_id="prep_${ACTION_ID:-manual}_$(date -u +%Y%m%dT%H%M%SZ)"
report_file="$LOG_DIR/deploy-prepare-$prepare_id.txt"

{
  printf 'Deploy prepare @ %s\n' "$stamp"
  printf 'prepare_id=%s\n' "$prepare_id"
  printf 'app_root=%s\n' "$APP_ROOT"
  printf 'base_url=%s\n\n' "$base"

  cd "$APP_ROOT"
  printf '== git ==\n'
  git rev-parse --short HEAD 2>/dev/null || true
  git status --short 2>/dev/null | sed -n '1,120p' || true
  printf '\n'

  printf '== migrations ==\n'
  if [[ -f apps/api/src/db/migrations/meta/_journal.json ]]; then
    node -e "const j=require('./apps/api/src/db/migrations/meta/_journal.json'); console.log('expected_migrations=' + (j.entries?.length ?? 0));" || true
  else
    printf 'migration journal not found\n'
  fi
  printf '\n'

  printf '== backup age ==\n'
  BACKUP_DIR="${BACKUP_DIR:-$APP_ROOT/backups/postgres}"
  latest="$(find "$BACKUP_DIR" -name 'haksan_*.sql.gz' -type f -print 2>/dev/null | sort | tail -1 || true)"
  [[ -n "$latest" ]] || die "verified backup not found in $BACKUP_DIR"
  gzip -t "$latest" || die "backup integrity check failed: $latest"
  printf 'latest=%s\n' "$latest"
  if stat -c %Y "$latest" >/dev/null 2>&1; then
    mtime="$(stat -c %Y "$latest")"
  else
    mtime="$(stat -f %m "$latest")"
  fi
  now="$(date +%s)"
  age_hours="$(( (now - mtime) / 3600 ))"
  printf 'age_hours=%s\n' "$age_hours"
  max_age_hours="${OPS_BACKUP_MAX_AGE_HOURS:-26}"
  [[ "$age_hours" -le "$max_age_hours" ]] || die "backup is stale: ${age_hours}h (limit ${max_age_hours}h)"
  printf '\n'

  printf '== smoke ==\n'
  if [[ -x "$APP_ROOT/scripts/smoke-production.sh" ]]; then
    "$APP_ROOT/scripts/smoke-production.sh" "$base"
  else
    printf 'smoke script missing\n'
  fi
  printf '\n'

  printf '== compose config ==\n'
  compose config --quiet
  printf 'compose_config=ok\n'
} | redact_stream | tee "$report_file"

node "$OPS_ROOT/server/opsctl.js" register-prepare \
  --action-id "${ACTION_ID:-manual}" \
  --prepare-id "$prepare_id" \
  --report-file "$report_file" \
  --status success >/dev/null

node "$OPS_ROOT/server/opsctl.js" create-action \
  --type deploy_execute \
  --severity high \
  --source deploy_prepare \
  --title "Deploy execute ready" \
  --details "prepare_id=$prepare_id report=$report_file; second approval required" \
  --prepare-id "$prepare_id" \
  --notify >/dev/null

printf 'deploy_prepare_ok=%s\n' "$prepare_id"
