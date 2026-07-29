#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

run_verified_offsite_backup() {
  local app_root="${APP_ROOT:-/opt/haksan}"
  local aws_region="${AWS_REGION:-eu-central-1}"
  local backup_bucket="${AWS_BACKUP_BUCKET:-haksan-prod-backups-866490183348-eu-central-1}"
  local instance_id="${INSTANCE_ID:-i-0fac9a4d4eca0cf13}"
  local backup_dir="${LOCAL_BACKUP_DIR:-$app_root/backups/postgres}"
  local latest checksum object_key remote_checksum

  report_backup_metric() {
    local exit_code=$? success=0
    [[ "$exit_code" -eq 0 ]] && success=1
    aws cloudwatch put-metric-data \
      --region "$aws_region" \
      --namespace Haksan/Production \
      --metric-data "MetricName=DatabaseBackupSuccess,Dimensions=[{Name=InstanceId,Value=$instance_id}],Value=$success,Unit=Count" \
      >/dev/null 2>&1 || true
    exit "$exit_code"
  }
  trap report_backup_metric EXIT

  [[ -x "$app_root/deploy/backup-postgres.sh" ]] || {
    echo "[aws-backup] local backup runner missing or not executable." >&2
    return 1
  }
  cd "$app_root"
  "$app_root/deploy/backup-postgres.sh"

  latest="$(find "$backup_dir" -maxdepth 1 -type f -name 'haksan_*.sql.gz' -print | sort | tail -1)"
  [[ -n "$latest" && -f "$latest" ]] || {
    printf '[aws-backup] verified local backup not found in %s\n' "$backup_dir" >&2
    return 1
  }

  gzip -t "$latest"
  checksum="$(sha256sum "$latest" | awk '{ print $1 }')"
  object_key="postgres/$(basename "$latest")"
  aws s3 cp "$latest" "s3://$backup_bucket/$object_key" \
    --region "$aws_region" \
    --only-show-errors \
    --sse AES256 \
    --metadata "sha256=$checksum"

  remote_checksum="$(aws s3api head-object \
    --region "$aws_region" \
    --bucket "$backup_bucket" \
    --key "$object_key" \
    --query 'Metadata.sha256' \
    --output text)"
  [[ "$remote_checksum" == "$checksum" ]] || {
    printf '[aws-backup] checksum mismatch for s3://%s/%s\n' "$backup_bucket" "$object_key" >&2
    return 1
  }

  printf '[aws-backup] verified s3://%s/%s sha256=%s\n' "$backup_bucket" "$object_key" "$checksum"
}

if [[ "$(basename -- "$0")" == "aws-backup-postgres.sh" || "${1:-}" == "--backup-only" ]]; then
  run_verified_offsite_backup
  exit
fi

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
managed_runner="$APP_ROOT/deploy/deploy-ecr-release.sh"
backup_script="$APP_ROOT/deploy/aws-backup-postgres.sh"
[[ -x "$APP_ROOT/deploy/backup-postgres.sh" ]]
install -m 0750 "$0" "$managed_runner"
ln -sfn "$(basename "$managed_runner")" "$backup_script"
bash -n "$managed_runner"
if ! systemctl start haksan-aws-backup.service; then
  echo "ECR_DEPLOY_BACKUP_FAILED" >&2
  systemctl --no-pager --full status haksan-aws-backup.service >&2 || true
  journalctl --no-pager -u haksan-aws-backup.service -n 100 >&2 || true
  false
fi
backup_result="$(systemctl show haksan-aws-backup.service -p Result --value)"
if [[ "$backup_result" != "success" ]]; then
  echo "ECR_DEPLOY_BACKUP_FAILED result=$backup_result" >&2
  systemctl --no-pager --full status haksan-aws-backup.service >&2 || true
  journalctl --no-pager -u haksan-aws-backup.service -n 100 >&2 || true
  false
fi

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
