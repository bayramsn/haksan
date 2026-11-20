#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${WEB_RELEASE_ID:?WEB_RELEASE_ID is required}"
: "${WEB_ARTIFACT_URI:?WEB_ARTIFACT_URI is required}"
: "${WEB_ARTIFACT_SHA256:?WEB_ARTIFACT_SHA256 is required}"
: "${WEB_ASSET_MARKER:?WEB_ASSET_MARKER is required}"

AWS_REGION="${AWS_REGION:-eu-central-1}"
APP_ROOT="${APP_ROOT:-/opt/haksan}"
NGINX_CONTAINER="${NGINX_CONTAINER:-haksan-nginx-1}"
SHORT="${WEB_RELEASE_ID:0:12}"
WORK_DIR="$(mktemp -d "/tmp/haksan-web-${SHORT}.XXXXXX")"
ARCHIVE="$WORK_DIR/web-dist.tar.gz"
STAGE="$WORK_DIR/stage"
ROLLBACK_TAG="haksan-nginx:web-rollback-${SHORT}"
BASE_TAG="haksan-nginx:web-base-${SHORT}"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

[[ -f "$APP_ROOT/.env" ]] || { echo "WEB_DEPLOY_ERROR production env missing" >&2; exit 1; }
if [[ -n "${WEB_ARTIFACT_LOCAL:-}" ]]; then
  [[ -f "$WEB_ARTIFACT_LOCAL" ]] || {
    echo "WEB_DEPLOY_ERROR local artifact missing" >&2
    exit 1
  }
  cp "$WEB_ARTIFACT_LOCAL" "$ARCHIVE"
else
  aws s3 cp "$WEB_ARTIFACT_URI" "$ARCHIVE" --region "$AWS_REGION" --only-show-errors
fi
printf '%s  %s\n' "$WEB_ARTIFACT_SHA256" "$ARCHIVE" | sha256sum -c -

mkdir -p "$STAGE"
tar -xzf "$ARCHIVE" -C "$STAGE"
[[ -f "$STAGE/dist/index.html" && -f "$STAGE/deploy/Dockerfile.web-only" ]] || {
  echo "WEB_DEPLOY_ERROR invalid artifact layout" >&2
  exit 1
}
[[ -f "$STAGE/dist/assets/$WEB_ASSET_MARKER" ]] || {
  echo "WEB_DEPLOY_ERROR expected asset missing" >&2
  exit 1
}

CURRENT_IMAGE="$(docker inspect -f '{{.Image}}' "$NGINX_CONTAINER")"
docker tag "$CURRENT_IMAGE" "$ROLLBACK_TAG"
docker tag "$CURRENT_IMAGE" "$BASE_TAG"

rollback() {
  local code=$?
  trap - ERR
  echo "WEB_ROLLBACK_START code=$code"
  docker tag "$ROLLBACK_TAG" haksan-nginx:latest || true
  cd "$APP_ROOT"
  docker compose --env-file .env up -d --no-deps --no-build --force-recreate nginx || true
  echo "WEB_ROLLBACK_FINISHED"
  exit "$code"
}
trap rollback ERR

docker build --pull=false --provenance=false \
  --build-arg "BASE_IMAGE=$BASE_TAG" \
  --label "com.haksan.web-release=$WEB_RELEASE_ID" \
  -f "$STAGE/deploy/Dockerfile.web-only" \
  -t haksan-nginx:latest \
  "$STAGE"

cd "$APP_ROOT"
docker compose --env-file .env up -d --no-deps --no-build --force-recreate nginx

for _ in $(seq 1 30); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$NGINX_CONTAINER" 2>/dev/null || true)"
  if [[ "$status" == "healthy" ]]; then
    break
  fi
  sleep 2
done
[[ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$NGINX_CONTAINER")" == "healthy" ]] || {
  echo "WEB_DEPLOY_ERROR nginx did not become healthy" >&2
  false
}

set -a
# shellcheck disable=SC1091
source "$APP_ROOT/.env"
set +a
curl -kfsS --resolve "${APP_DOMAIN}:443:127.0.0.1" "https://${APP_DOMAIN}/" | grep -Fq "$WEB_ASSET_MARKER"
curl -kfsS --resolve "${APP_DOMAIN}:443:127.0.0.1" "https://${APP_DOMAIN}/health" >/dev/null

trap - ERR
echo "WEB_DEPLOY_SUCCEEDED release=$WEB_RELEASE_ID asset=$WEB_ASSET_MARKER rollback=$ROLLBACK_TAG"
