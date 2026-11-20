#!/usr/bin/env bash
set -euo pipefail
umask 077
APP_ROOT="${APP_ROOT:-/opt/haksan}"
: "${TURN_PUBLIC_IP:?TURN_PUBLIC_IP is required}"
: "${TURN_PRIVATE_IP:?TURN_PRIVATE_IP is required}"
cd "$APP_ROOT"
test -f .env
image_tag='coturn/coturn:4.18.0-r0'
docker pull "$image_tag"
export TURN_IMAGE_DIGEST
auto_digest="$(docker image inspect --format '{{index .RepoDigests 0}}' "$image_tag")"
[[ "$auto_digest" == coturn/coturn@sha256:* ]] || { echo 'TURN_ERROR image digest missing' >&2; exit 1; }
TURN_IMAGE_DIGEST="$auto_digest"
export TURN_PUBLIC_IP TURN_PRIVATE_IP
python3 - <<'PY'
from pathlib import Path
import ipaddress, os, secrets
public = str(ipaddress.IPv4Address(os.environ['TURN_PUBLIC_IP']))
private = str(ipaddress.IPv4Address(os.environ['TURN_PRIVATE_IP']))
p = Path('.env')
lines = p.read_text().splitlines()
values = dict(line.split('=',1) for line in lines if '=' in line and not line.lstrip().startswith('#'))
secret = values.get('WEBRTC_TURN_SHARED_SECRET', '').strip().strip('\"\'')
if not secret: secret = secrets.token_hex(32)
if len(secret) < 32 or not all(c.isalnum() or c in '-_' for c in secret):
    raise SystemExit('TURN_ERROR existing shared secret format requires review')
updates = {'WEBRTC_TURN_SHARED_SECRET': secret, 'WEBRTC_TURN_PUBLIC_IP': public,
 'WEBRTC_TURN_PRIVATE_IP': private, 'WEBRTC_TURN_IMAGE': os.environ['TURN_IMAGE_DIGEST'],
 'WEBRTC_TURN_URLS': f'turn:{public}:3478?transport=udp,turn:{public}:3478?transport=tcp'}
backup = Path('.env.turn-backup')
if not backup.exists():
    backup.write_text(p.read_text()); backup.chmod(0o600)
kept = [line for line in lines if line.split('=',1)[0] not in updates]
next_env = Path('.env.turn-next')
next_env.write_text('\n'.join(kept + [f'{k}={v}' for k,v in updates.items()])+'\n')
next_env.chmod(0o600); next_env.replace(p)
print('TURN_ENV_CONFIGURED')
PY
docker compose --project-name haksan-turn -f deploy/docker-compose.turn.yml --env-file .env config --quiet
if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
  ufw allow 3478/udp comment 'Haksan authenticated TURN'
  ufw allow 3478/tcp comment 'Haksan authenticated TURN'
  ufw allow 49160:49259/udp comment 'Haksan TURN relay'
fi
docker compose --project-name haksan-turn -f deploy/docker-compose.turn.yml --env-file .env up -d --no-build
sleep 3
test "$(docker inspect --format '{{.State.Running}}' haksan-turn-turn-1)" = true
echo TURN_SERVICE_STARTED
