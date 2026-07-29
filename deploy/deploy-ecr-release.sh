#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${RELEASE_ID:?RELEASE_ID is required}"
: "${API_IMAGE_URI:?API_IMAGE_URI is required}"
: "${WEB_IMAGE_URI:?WEB_IMAGE_URI is required}"

AWS_REGION="${AWS_REGION:-eu-central-1}"
APP_ROOT="${APP_ROOT:-/opt/haksan}"
API_CONTAINER="${API_CONTAINER:-haksan-api-1}"
NGINX_CONTAINER="${NGINX_CONTAINER:-haksan-nginx-1}"
SHORT="${RELEASE_ID:0:12}"
REGISTRY="${API_IMAGE_URI%%/*}"
API_ROLLBACK_TAG="haksan-api:ecr-rollback-${SHORT}"
NGINX_ROLLBACK_TAG="haksan-nginx:ecr-rollback-${SHORT}"
SWITCH_STARTED=false

cleanup() {
  docker logout "$REGISTRY" >/dev/null 2>&1 || true
}
trap cleanup EXIT

[[ -f "$APP_ROOT/.env" ]] || { echo "ECR_DEPLOY_ERROR production env missing" >&2; exit 1; }
[[ -f "$APP_ROOT/docker-compose.yml" ]] || { echo "ECR_DEPLOY_ERROR compose file missing" >&2; exit 1; }

CURRENT_API_IMAGE="$(docker inspect -f '{{.Image}}' "$API_CONTAINER")"
CURRENT_NGINX_IMAGE="$(docker inspect -f '{{.Image}}' "$NGINX_CONTAINER")"
docker tag "$CURRENT_API_IMAGE" "$API_ROLLBACK_TAG"
docker tag "$CURRENT_NGINX_IMAGE" "$NGINX_ROLLBACK_TAG"

rollback() {
  local code=$?
  trap - ERR
  echo "ECR_DEPLOY_ROLLBACK_START code=$code"
  docker tag "$API_ROLLBACK_TAG" haksan-api:latest || true
  docker tag "$NGINX_ROLLBACK_TAG" haksan-nginx:latest || true
  if [[ "$SWITCH_STARTED" == "true" ]]; then
    cd "$APP_ROOT"
    docker compose --env-file .env up -d --no-deps --no-build --force-recreate api nginx || true
  fi
  echo "ECR_DEPLOY_ROLLBACK_FINISHED"
  exit "$code"
}
trap rollback ERR

aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "$REGISTRY"
docker pull "$API_IMAGE_URI"
docker pull "$WEB_IMAGE_URI"
docker tag "$API_IMAGE_URI" haksan-api:latest
docker tag "$WEB_IMAGE_URI" haksan-nginx:latest

[[ "$(docker image inspect -f '{{.Architecture}}' haksan-api:latest)" == "amd64" ]]
[[ "$(docker image inspect -f '{{.Architecture}}' haksan-nginx:latest)" == "amd64" ]]

# A verified offsite backup is mandatory immediately before migrations.
systemctl start haksan-aws-backup.service
[[ "$(systemctl show haksan-aws-backup.service -p Result --value)" == "success" ]]

cd "$APP_ROOT"
docker compose --env-file .env config --quiet
docker compose --env-file .env run --rm --no-deps api npm --workspace @haksan/api run db:migrate:prod
docker compose --env-file .env run --rm --no-deps api npm --workspace @haksan/api run db:data-migrate:prod

SWITCH_STARTED=true
docker compose --env-file .env up -d --no-deps --no-build --force-recreate api
for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$API_CONTAINER" 2>/dev/null || true)"
  [[ "$status" == "healthy" ]] && break
  sleep 2
done
[[ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$API_CONTAINER")" == "healthy" ]]
docker exec "$API_CONTAINER" node -e \
  "Promise.all(['/health/live','/health/ready','/health/dependencies','/health/version'].map(async (path) => { const response = await fetch('http://127.0.0.1:3000' + path); if (!response.ok) throw new Error(path + ':' + response.status); })).catch((error) => { console.error(error); process.exit(1); })"

docker compose --env-file .env up -d --no-deps --no-build --force-recreate nginx
for _ in $(seq 1 30); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$NGINX_CONTAINER" 2>/dev/null || true)"
  [[ "$status" == "healthy" ]] && break
  sleep 2
done
[[ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$NGINX_CONTAINER")" == "healthy" ]]

set -a
# shellcheck disable=SC1091
source "$APP_ROOT/.env"
set +a
for endpoint in / /health /health/live /health/ready /health/dependencies /health/version; do
  curl -kfsS --resolve "${APP_DOMAIN}:443:127.0.0.1" "https://${APP_DOMAIN}${endpoint}" >/dev/null
done

trap - ERR
echo "ECR_DEPLOY_SUCCEEDED release=$RELEASE_ID api=$API_IMAGE_URI web=$WEB_IMAGE_URI rollback_api=$API_ROLLBACK_TAG rollback_web=$NGINX_ROLLBACK_TAG"
