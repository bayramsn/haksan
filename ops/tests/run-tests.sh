#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

tmp="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp"
}
trap cleanup EXIT

fail() {
  printf '[ops-tests] FAIL: %s\n' "$*" >&2
  exit 1
}

write_env() {
  local file="$1"
  local actions="${2:-false}"
  local deploy="${3:-false}"
  cat > "$file" <<EOF
OPS_ENABLED=true
OPS_ACTIONS_ENABLED=$actions
OPS_DEPLOY_ENABLED=$deploy
OPS_DRY_RUN=false
OPS_EXECUTOR=local
OPS_HOST=127.0.0.1
OPS_PORT=3900
OPS_CONSOLE_TOKEN=0123456789abcdef0123456789abcdef
OPS_HMAC_SECRET=abcdef0123456789abcdef0123456789
OPS_PUBLIC_BASE_URL=http://127.0.0.1
OPS_APP_ROOT=$ROOT
OPS_ENV_FILE=.env
OPS_STATE_DIR=$tmp/state
OPS_LOG_WINDOW_LINES=10
OPS_TELEGRAM_ALLOWED_USERS=111,222
EOF
}

printf '[ops-tests] shell syntax\n'
for file in ops/bin/*.sh ops/install.sh; do
  bash -n "$file"
done

printf '[ops-tests] node syntax\n'
for file in ops/server/lib/core.js ops/server/opsctl.js ops/server/server.js ops/telegram/send-message.js ops/telegram/poll.js; do
  node --check "$file"
done

printf '[ops-tests] missing config fails closed\n'
if OPS_CONFIG_FILE="$tmp/missing.env" node ops/server/opsctl.js state >/dev/null 2>&1; then
  fail 'missing config did not fail'
fi

printf '[ops-tests] config parser does not execute shell\n'
injection_env="$tmp/injection.env"
write_env "$injection_env" false false
printf 'OPS_PUBLIC_BASE_URL=$(touch %s/pwned)\n' "$tmp" >> "$injection_env"
OPS_CONFIG_FILE="$injection_env" bash -c 'source ops/bin/lib.sh; load_ops_env; printf "%s\n" "$OPS_PUBLIC_BASE_URL"' >/dev/null
[[ ! -e "$tmp/pwned" ]] || fail 'env parser executed command substitution'

printf '[ops-tests] redaction masks secrets\n'
redacted="$(printf 'DATABASE_URL=postgres://user:secret@db:5432/x\nOPS_TELEGRAM_BOT_TOKEN=123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\nJWT=eyJaaaaaaaaaaaa.bbbbbbbbbbbbb.cccccccccccc\n' | node ops/server/opsctl.js redact)"
[[ "$redacted" != *'secret@db'* ]] || fail 'database password leaked'
[[ "$redacted" != *'123456:AAAAAAAA'* ]] || fail 'telegram token leaked'
[[ "$redacted" != *'eyJaaaaaaaaaaaa'* ]] || fail 'jwt leaked'

printf '[ops-tests] disabled mutating action is blocked before docker\n'
disabled_env="$tmp/disabled.env"
write_env "$disabled_env" false false
if OPS_CONFIG_FILE="$disabled_env" bash ops/bin/run-action.sh restart_api test_disabled >"$tmp/disabled.out" 2>&1; then
  fail 'restart_api ran while actions disabled'
fi
grep -q 'OPS_ACTIONS_ENABLED=false' "$tmp/disabled.out" || fail 'disabled action failed for the wrong reason'

printf '[ops-tests] deploy_execute requires approved prepare state\n'
deploy_env="$tmp/deploy.env"
write_env "$deploy_env" true true
if OPS_CONFIG_FILE="$deploy_env" bash ops/bin/run-action.sh deploy_execute manual >"$tmp/deploy.out" 2>&1; then
  fail 'deploy_execute ran without approval state'
fi
grep -q 'approved deploy action id is required' "$tmp/deploy.out" || fail 'deploy gate failed for the wrong reason'

printf '[ops-tests] action token is single use and telegram allowlist works\n'
actions_env="$tmp/actions.env"
write_env "$actions_env" true false
OPS_CONFIG_FILE="$actions_env" node <<'NODE'
const core = require('./ops/server/lib/core');
const config = core.loadConfig();
const created = core.createAction(config, {
  type: 'diagnostics',
  severity: 'info',
  source: 'test',
  title: 'Test diagnostics',
  details: 'single-use check',
}).action;
const view = core.publicAction(config, created, true);
core.decideAction(config, created.id, 'reject', view.rejectSig, 'test', 'unit');
let blocked = false;
try {
  core.decideAction(config, created.id, 'reject', view.rejectSig, 'test', 'unit');
} catch (error) {
  blocked = error.code === 'ACTION_NOT_PENDING';
}
if (!blocked) process.exit(2);
if (!core.validateTelegramUser(config, 111)) process.exit(3);
if (core.validateTelegramUser(config, 999)) process.exit(4);
NODE

printf '[ops-tests] ok\n'
