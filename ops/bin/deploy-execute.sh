#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_ops_env

require_deploy_enabled

approved_action_id="${OPS_APPROVED_ACTION_ID:-${ACTION_ID:-}}"
[[ -n "$approved_action_id" && "$approved_action_id" != "manual" ]] || die "approved deploy action id is required"

if [[ ! -x "$APP_ROOT/deploy.sh" ]]; then
  die "$APP_ROOT/deploy.sh is missing or not executable"
fi

prepare_json="$(node "$OPS_ROOT/server/opsctl.js" verify-deploy-execute --action-id "$approved_action_id")"
prepare_id="$(printf '%s' "$prepare_json" | node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>console.log(JSON.parse(s).id));")"

log "deploy_execute action_id=$approved_action_id prepare_id=$prepare_id"
cd "$APP_ROOT"
./deploy.sh
node "$OPS_ROOT/server/opsctl.js" consume-prepare --prepare-id "$prepare_id" --action-id "$approved_action_id" >/dev/null
