#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${NGINX_RELEASE_ID:?NGINX_RELEASE_ID is required}"
: "${NGINX_ARTIFACT_URI:?NGINX_ARTIFACT_URI is required}"
: "${NGINX_ARTIFACT_SHA256:?NGINX_ARTIFACT_SHA256 is required}"

AWS_REGION="${AWS_REGION:-eu-central-1}"
APP_ROOT="${APP_ROOT:-/opt/haksan}"
NGINX_CONTAINER="${NGINX_CONTAINER:-haksan-nginx-1}"
SHORT="${NGINX_RELEASE_ID:0:12}"
WORK_DIR="$(mktemp -d "/tmp/haksan-nginx-config-${SHORT}.XXXXXX")"
ARCHIVE="$WORK_DIR/nginx-config.tar.gz"
STAGE="$WORK_DIR/stage"
ROLLBACK_TAG="haksan-nginx:config-rollback-${SHORT}"
BASE_TAG="haksan-nginx:config-base-${SHORT}"
NGINX_SWITCH_STARTED=false

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

[[ -f "$APP_ROOT/.env" ]] || { echo "NGINX_CONFIG_DEPLOY_ERROR production env missing" >&2; exit 1; }
aws s3 cp "$NGINX_ARTIFACT_URI" "$ARCHIVE" --region "$AWS_REGION" --only-show-errors
printf '%s  %s\n' "$NGINX_ARTIFACT_SHA256" "$ARCHIVE" | sha256sum -c -

mkdir -p "$STAGE"
tar -xzf "$ARCHIVE" -C "$STAGE"
[[ -f "$STAGE/deploy/Dockerfile.nginx-config-only" && -f "$STAGE/deploy/nginx.conf.template" ]] || {
  echo "NGINX_CONFIG_DEPLOY_ERROR invalid artifact layout" >&2
  exit 1
}

CURRENT_IMAGE="$(docker inspect -f '{{.Image}}' "$NGINX_CONTAINER")"
CURRENT_INDEX_SHA="$(docker exec "$NGINX_CONTAINER" sha256sum /usr/share/nginx/html/index.html | awk '{print $1}')"
docker tag "$CURRENT_IMAGE" "$ROLLBACK_TAG"
docker tag "$CURRENT_IMAGE" "$BASE_TAG"

rollback() {
  local code=$?
  trap - ERR
  echo "NGINX_CONFIG_ROLLBACK_START code=$code"
  docker tag "$ROLLBACK_TAG" haksan-nginx:latest || true
  if [[ "$NGINX_SWITCH_STARTED" == "true" ]]; then
    cd "$APP_ROOT"
    docker compose --env-file .env up -d --no-deps --no-build --force-recreate nginx || true
  fi
  echo "NGINX_CONFIG_ROLLBACK_FINISHED"
  exit "$code"
}
trap rollback ERR

docker build --pull=false --provenance=false \
  --build-arg "BASE_IMAGE=$BASE_TAG" \
  --label "com.haksan.nginx-config-release=$NGINX_RELEASE_ID" \
  -f "$STAGE/deploy/Dockerfile.nginx-config-only" \
  -t haksan-nginx:latest \
  "$STAGE"

cd "$APP_ROOT"
NGINX_SWITCH_STARTED=true
docker compose --env-file .env up -d --no-deps --no-build --force-recreate nginx

for _ in $(seq 1 30); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$NGINX_CONTAINER" 2>/dev/null || true)"
  if [[ "$status" == "healthy" ]]; then
    break
  fi
  sleep 2
done
[[ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$NGINX_CONTAINER")" == "healthy" ]]
[[ "$(docker exec "$NGINX_CONTAINER" sha256sum /usr/share/nginx/html/index.html | awk '{print $1}')" == "$CURRENT_INDEX_SHA" ]]

set -a
# shellcheck disable=SC1091
source "$APP_ROOT/.env"
set +a
for endpoint in / /health /health/live /health/ready /health/dependencies /health/version; do
  curl -kfsS --resolve "${APP_DOMAIN}:443:127.0.0.1" "https://${APP_DOMAIN}${endpoint}" >/dev/null
done

trap - ERR
echo "NGINX_CONFIG_DEPLOY_SUCCEEDED release=$NGINX_RELEASE_ID index_sha=$CURRENT_INDEX_SHA rollback=$ROLLBACK_TAG"
