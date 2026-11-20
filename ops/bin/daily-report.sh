#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_ops_env

"$SCRIPT_DIR/diagnostics.sh" > "$STATE_DIR/daily-report-latest.txt"

if [[ -n "${OPS_TELEGRAM_BOT_TOKEN:-}" && -n "${OPS_TELEGRAM_CHAT_IDS:-}" ]]; then
  node "$OPS_ROOT/telegram/send-message.js" --text-file "$STATE_DIR/daily-report-latest.txt" --prefix "Daily Haksan ops report"
fi

printf 'daily_report=%s\n' "$STATE_DIR/daily-report-latest.txt"

