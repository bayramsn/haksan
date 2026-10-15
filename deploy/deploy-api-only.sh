#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${API_RELEASE_ID:?API_RELEASE_ID is required}"
: "${API_ARTIFACT_URI:?API_ARTIFACT_URI is required}"
: "${API_ARTIFACT_SHA256:?API_ARTIFACT_SHA256 is required}"

AWS_REGION="${AWS_REGION:-eu-central-1}"
APP_ROOT="${APP_ROOT:-/opt/haksan}"
API_CONTAINER="${API_CONTAINER:-haksan-api-1}"
SHORT="${API_RELEASE_ID:0:12}"
WORK_DIR="$(mktemp -d "/tmp/haksan-api-${SHORT}.XXXXXX")"
ARCHIVE="$WORK_DIR/api-source.tar.gz"
STAGE="$WORK_DIR/stage"
PREVIOUS_COMPOSE="$WORK_DIR/docker-compose.previous.yml"
ROLLBACK_TAG="haksan-api:api-rollback-${SHORT}"
COMPOSE_INSTALLED=false
API_SWITCH_STARTED=false

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

[[ -f "$APP_ROOT/.env" ]] || { echo "API_DEPLOY_ERROR production env missing" >&2; exit 1; }
[[ -f "$APP_ROOT/docker-compose.yml" ]] || { echo "API_DEPLOY_ERROR compose file missing" >&2; exit 1; }

aws s3 cp "$API_ARTIFACT_URI" "$ARCHIVE" --region "$AWS_REGION" --only-show-errors
printf '%s  %s\n' "$API_ARTIFACT_SHA256" "$ARCHIVE" | sha256sum -c -

mkdir -p "$STAGE"
tar -xzf "$ARCHIVE" -C "$STAGE"
[[ -f "$STAGE/deploy/Dockerfile.api-only" && -f "$STAGE/docker-compose.yml" ]] || {
  echo "API_DEPLOY_ERROR invalid artifact layout" >&2
  exit 1
}

cp "$APP_ROOT/docker-compose.yml" "$PREVIOUS_COMPOSE"
CURRENT_IMAGE="$(docker inspect -f '{{.Image}}' "$API_CONTAINER")"
docker tag "$CURRENT_IMAGE" "$ROLLBACK_TAG"

rollback() {
  local code=$?
  trap - ERR
  echo "API_ROLLBACK_START code=$code"
  if [[ "$COMPOSE_INSTALLED" == "true" ]]; then
    install -m 0644 "$PREVIOUS_COMPOSE" "$APP_ROOT/docker-compose.yml" || true
  fi
  docker tag "$ROLLBACK_TAG" haksan-api:latest || true
  if [[ "$API_SWITCH_STARTED" == "true" ]]; then
    cd "$APP_ROOT"
    docker compose --env-file .env up -d --no-deps --no-build --force-recreate api || true
  fi
  echo "API_ROLLBACK_FINISHED"
  exit "$code"
}
trap rollback ERR

docker build --pull=false --provenance=false \
  --build-arg "API_RELEASE_ID=$API_RELEASE_ID" \
  --build-arg "BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --label "com.haksan.api-release=$API_RELEASE_ID" \
  -f "$STAGE/deploy/Dockerfile.api-only" \
  -t haksan-api:latest \
  "$STAGE"

ln -s "$APP_ROOT/.env" "$STAGE/.env"
docker compose -f "$STAGE/docker-compose.yml" --env-file "$APP_ROOT/.env" config --quiet
install -m 0644 "$STAGE/docker-compose.yml" "$APP_ROOT/docker-compose.yml"
COMPOSE_INSTALLED=true

cd "$APP_ROOT"
API_SWITCH_STARTED=true
docker compose --env-file .env up -d --no-deps --no-build --force-recreate api

for _ in $(seq 1 45); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$API_CONTAINER" 2>/dev/null || true)"
  if [[ "$status" == "healthy" ]]; then
    break
  fi
  sleep 2
done
[[ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$API_CONTAINER")" == "healthy" ]] || {
  echo "API_DEPLOY_ERROR api did not become healthy" >&2
  docker logs --tail 100 "$API_CONTAINER" >&2 || true
  false
}

set -a
# shellcheck disable=SC1091
source "$APP_ROOT/.env"
set +a
curl -kfsS --resolve "${APP_DOMAIN}:443:127.0.0.1" "https://${APP_DOMAIN}/health" >/dev/null
curl -kfsS --resolve "${APP_DOMAIN}:443:127.0.0.1" "https://${APP_DOMAIN}/health/ready" >/dev/null
docker exec "$API_CONTAINER" node -e \
  "Promise.all(['/health/live','/health/dependencies','/health/version'].map(async (path) => { const response = await fetch('http://127.0.0.1:3000' + path); if (!response.ok) throw new Error(path + ':' + response.status); })).catch((error) => { console.error(error); process.exit(1); })"

trap - ERR
echo "API_DEPLOY_SUCCEEDED release=$API_RELEASE_ID rollback=$ROLLBACK_TAG"
