#!/usr/bin/env bash
set -euo pipefail

ops_dir() {
  local src
  src="${BASH_SOURCE[0]}"
  cd "$(dirname "$src")/.." && pwd
}

OPS_ROOT="${OPS_ROOT:-$(ops_dir)}"
OPS_CONFIG_FILE="${OPS_CONFIG_FILE:-$OPS_ROOT/.env}"
APP_ROOT="${OPS_APP_ROOT:-$(cd "$OPS_ROOT/.." && pwd)}"
ENV_FILE="${ENV_FILE:-${OPS_ENV_FILE:-.env}}"
STATE_DIR="${OPS_STATE_DIR:-$OPS_ROOT/state}"
ACTIONS_DIR="$STATE_DIR/actions"
LOG_DIR="$STATE_DIR/logs"
DEPLOY_PREPARES_DIR="$STATE_DIR/deploy-prepares"

trim_value() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

parse_env_file() {
  local file="$1"
  local mode="${2:-required}"
  local raw line key value lineno

  if [[ ! -f "$file" ]]; then
    if [[ "$mode" == "required" ]]; then
      die "required config file is missing: $file"
    fi
    return 0
  fi

  lineno=0
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    lineno=$((lineno + 1))
    raw="${raw%$'\r'}"
    line="$(trim_value "$raw")"
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue

    if [[ "$line" == export[[:space:]]* ]]; then
      line="$(trim_value "${line#export}")"
    fi

    if [[ ! "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      die "invalid env syntax in $file:$lineno"
    fi

    key="${BASH_REMATCH[1]}"
    value="$(trim_value "${BASH_REMATCH[2]}")"

    if [[ "$value" == \"* ]]; then
      [[ "$value" == *\" && "${#value}" -ge 2 ]] || die "unterminated double quote in $file:$lineno"
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'* ]]; then
      [[ "$value" == *\' && "${#value}" -ge 2 ]] || die "unterminated single quote in $file:$lineno"
      value="${value:1:${#value}-2}"
    fi

    printf -v "$key" '%s' "$value"
    export "$key"
  done < "$file"
}

normalize_paths() {
  APP_ROOT="${OPS_APP_ROOT:-$APP_ROOT}"
  ENV_FILE="${ENV_FILE:-${OPS_ENV_FILE:-.env}}"
  STATE_DIR="${OPS_STATE_DIR:-$STATE_DIR}"
  ACTIONS_DIR="$STATE_DIR/actions"
  LOG_DIR="$STATE_DIR/logs"
  DEPLOY_PREPARES_DIR="$STATE_DIR/deploy-prepares"
}

ensure_state_dirs() {
  mkdir -p "$STATE_DIR" "$ACTIONS_DIR" "$LOG_DIR" "$DEPLOY_PREPARES_DIR"
}

load_ops_env() {
  parse_env_file "$OPS_CONFIG_FILE" required
  normalize_paths
  parse_env_file "$APP_ROOT/.env" optional
  parse_env_file "$OPS_CONFIG_FILE" required
  normalize_paths
  ensure_state_dirs
  validate_ops_switches
}

log() {
  printf '[ops] %s\n' "$*"
}

die() {
  printf '[ops] ERROR: %s\n' "$*" >&2
  exit 1
}

validate_bool() {
  local name="$1"
  local value="${!name:-}"
  case "$value" in
    true|false) ;;
    *) die "$name must be true or false" ;;
  esac
}

validate_ops_switches() {
  OPS_ENABLED="${OPS_ENABLED:-true}"
  OPS_ACTIONS_ENABLED="${OPS_ACTIONS_ENABLED:-false}"
  OPS_DEPLOY_ENABLED="${OPS_DEPLOY_ENABLED:-false}"
  OPS_DRY_RUN="${OPS_DRY_RUN:-false}"
  OPS_EXECUTOR="${OPS_EXECUTOR:-local}"

  validate_bool OPS_ENABLED
  validate_bool OPS_ACTIONS_ENABLED
  validate_bool OPS_DEPLOY_ENABLED
  validate_bool OPS_DRY_RUN

  case "$OPS_EXECUTOR" in
    local|ssm|both) ;;
    *) die "OPS_EXECUTOR must be local, ssm, or both" ;;
  esac
}

detect_compose() {
  if [[ -n "${COMPOSE:-}" ]]; then
    case "$COMPOSE" in
      "docker compose") COMPOSE_CMD=(docker compose) ;;
      "docker-compose") COMPOSE_CMD=(docker-compose) ;;
      *) die "COMPOSE override is not allowed: use 'docker compose' or 'docker-compose'" ;;
    esac
  elif docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
  elif docker-compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
  else
    die "Docker Compose not found"
  fi
}

env_file_path() {
  if [[ "$ENV_FILE" = /* ]]; then
    printf '%s' "$ENV_FILE"
  else
    printf '%s/%s' "$APP_ROOT" "$ENV_FILE"
  fi
}

compose() {
  detect_compose
  (cd "$APP_ROOT" && "${COMPOSE_CMD[@]}" --env-file "$(env_file_path)" "$@")
}

public_base_url() {
  if [[ -n "${OPS_PUBLIC_BASE_URL:-}" ]]; then
    printf '%s' "${OPS_PUBLIC_BASE_URL%/}"
  elif [[ -n "${APP_DOMAIN:-}" ]]; then
    printf 'https://%s' "$APP_DOMAIN"
  else
    printf 'http://127.0.0.1'
  fi
}

curl_code() {
  local url="$1"
  command -v curl >/dev/null 2>&1 || { printf '000'; return 0; }
  curl -fsS -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || printf '000'
}

wait_ready() {
  local base tries code
  base="$(public_base_url)"
  tries="${1:-30}"
  for _ in $(seq 1 "$tries"); do
    code="$(curl_code "$base/health/ready")"
    if [[ "$code" == "200" ]]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

require_ops_enabled() {
  if [[ "${OPS_ENABLED:-true}" == "false" ]]; then
    die "OPS_ENABLED=false"
  fi
}

require_actions_enabled() {
  require_ops_enabled
  if [[ "${OPS_ACTIONS_ENABLED:-true}" == "false" ]]; then
    die "OPS_ACTIONS_ENABLED=false"
  fi
}

require_deploy_enabled() {
  require_actions_enabled
  if [[ "${OPS_DEPLOY_ENABLED:-false}" != "true" ]]; then
    die "OPS_DEPLOY_ENABLED=false"
  fi
}

is_mutating_action() {
  case "$1" in
    nginx_reload|restart_nginx|restart_api|deploy_execute) return 0 ;;
    *) return 1 ;;
  esac
}

dry_run_or_continue() {
  local action="$1"
  if is_mutating_action "$action" && [[ "${OPS_DRY_RUN:-false}" == "true" ]]; then
    log "dry-run: skipped mutating action $action"
    append_audit "action_dry_run" "{\"action\":\"$action\",\"actionId\":\"${ACTION_ID:-manual}\"}"
    return 1
  fi
  return 0
}

redact_stream() {
  if command -v node >/dev/null 2>&1 && [[ -f "$OPS_ROOT/server/opsctl.js" ]]; then
    node "$OPS_ROOT/server/opsctl.js" redact
  else
    sed 's/.*/[redaction unavailable]/'
  fi
}

append_audit() {
  local event="$1"
  local payload
  if [[ "$#" -ge 2 ]]; then
    payload="$2"
  else
    payload='{}'
  fi
  command -v node >/dev/null 2>&1 || die "node is required for audit logging"
  node "$OPS_ROOT/server/opsctl.js" audit --event "$event" --payload-json "$payload" >/dev/null
}
