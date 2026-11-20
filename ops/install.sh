#!/usr/bin/env bash
set -euo pipefail

OPS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$OPS_ROOT/.." && pwd)"
INSTALL_SYSTEMD=false
FORCE_SYSTEMD=false

usage() {
  cat <<'EOF'
Usage:
  ops/install.sh [--systemd] [--force-systemd]

Defaults:
  - Creates ops/.env from ops/.env.example only if ops/.env does not exist.
  - Does not overwrite existing systemd units unless --force-systemd is passed.
EOF
}

log() { printf '[ops-install] %s\n' "$*"; }
die() { printf '[ops-install] ERROR: %s\n' "$*" >&2; exit 1; }

for arg in "$@"; do
  case "$arg" in
    --systemd) INSTALL_SYSTEMD=true ;;
    --force-systemd) FORCE_SYSTEMD=true ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 1 ;;
  esac
done

if [[ ! -f "$OPS_ROOT/.env" ]]; then
  cp "$OPS_ROOT/.env.example" "$OPS_ROOT/.env"
  chmod 600 "$OPS_ROOT/.env"
  log "created $OPS_ROOT/.env from example"
else
  log "kept existing $OPS_ROOT/.env"
fi

mkdir -p "$OPS_ROOT/state/actions" "$OPS_ROOT/state/logs" "$OPS_ROOT/state/deploy-prepares"
chmod 700 "$OPS_ROOT/state" "$OPS_ROOT/state/actions" "$OPS_ROOT/state/logs" "$OPS_ROOT/state/deploy-prepares"

if [[ "$INSTALL_SYSTEMD" != "true" ]]; then
  log "systemd install skipped"
  exit 0
fi

[[ "$(id -u)" -eq 0 ]] || die "--systemd must be run as root"

install_unit() {
  local src="$1"
  local dst="/etc/systemd/system/$(basename "$src")"
  if [[ -f "$dst" && "$FORCE_SYSTEMD" != "true" ]]; then
    log "kept existing $dst"
    return
  fi
  sed "s|/opt/haksan|$APP_ROOT|g" "$src" > "$dst"
  chmod 644 "$dst"
  log "installed $dst"
}

for unit in "$OPS_ROOT"/systemd/*.service "$OPS_ROOT"/systemd/*.timer; do
  [[ -f "$unit" ]] || continue
  install_unit "$unit"
done

systemctl daemon-reload
log "systemd daemon reloaded"
log "enable timers with: systemctl enable --now haksan-ops-monitor.timer haksan-ops-daily-report.timer"
