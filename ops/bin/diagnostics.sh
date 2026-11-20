#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_ops_env

base="$(public_base_url)"
stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

printf 'Haksan diagnostics @ %s\n' "$stamp"
printf 'app_root=%s\n' "$APP_ROOT"
printf 'base_url=%s\n\n' "$base"

printf '== health ==\n'
for path in /health /health/ready /health/version; do
  printf '%s %s\n' "$path" "$(curl_code "$base$path")"
done
printf '\n'

printf '== disk ==\n'
df -h "$APP_ROOT" 2>/dev/null || df -h /
printf '\n'

printf '== memory ==\n'
free -m 2>/dev/null || vm_stat 2>/dev/null || true
printf '\n'

printf '== docker compose ps ==\n'
compose ps || true
printf '\n'

printf '== recent api errors ==\n'
(compose logs --tail="${OPS_LOG_WINDOW_LINES:-1000}" api 2>/dev/null | grep -Ei 'error|exception| 5[0-9][0-9] | 429 ' | tail -80 || true) | redact_stream
printf '\n'

printf '== recent nginx errors ==\n'
(compose logs --tail="${OPS_LOG_WINDOW_LINES:-1000}" nginx 2>/dev/null | grep -Ei 'error|crit|alert|emerg| 5[0-9][0-9] | 429 ' | tail -80 || true) | redact_stream
