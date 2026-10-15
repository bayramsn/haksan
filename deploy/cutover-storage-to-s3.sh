#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${TARGET_BUCKET:?TARGET_BUCKET is required}"
: "${EXPECTED_FILE_ID:?EXPECTED_FILE_ID is required}"
: "${EXPECTED_FILE_SHA256:?EXPECTED_FILE_SHA256 is required}"
: "${EXPECTED_FILE_BYTES:?EXPECTED_FILE_BYTES is required}"

APP_ROOT="${APP_ROOT:-/opt/haksan}"
AWS_REGION_NAME="${AWS_REGION:-eu-central-1}"
API_CONTAINER="${API_CONTAINER:-haksan-api-1}"
APP_DOMAIN_NAME="${APP_DOMAIN_NAME:-crm.52-28-67-148.sslip.io}"
BACKUP_BUCKET="${BACKUP_BUCKET:-haksan-prod-backups-866490183348-eu-central-1}"
RUNTIME_DIR="${RUNTIME_DIR:-/run/haksan}"
CANDIDATE_ENV="${RUNTIME_DIR}/.env.s3-candidate"
VERIFY_FILE="$(mktemp /tmp/haksan-s3-cutover-verify.XXXXXX)"
PREVIOUS_ENV_TARGET=""
API_SWITCH_STARTED=false
CUTOVER_SUCCEEDED=false

cleanup() {
  rm -f "$VERIFY_FILE"
  if [[ "$CUTOVER_SUCCEEDED" != "true" ]]; then
    rm -f "$CANDIDATE_ENV"
  fi
}
trap cleanup EXIT

[[ -L "$APP_ROOT/.env" ]] || {
  echo "S3_CUTOVER_ERROR expected $APP_ROOT/.env to be a managed symlink" >&2
  exit 1
}
PREVIOUS_ENV_TARGET="$(readlink -f "$APP_ROOT/.env")"
[[ -f "$PREVIOUS_ENV_TARGET" ]] || {
  echo "S3_CUTOVER_ERROR previous runtime env target is missing" >&2
  exit 1
}

rollback() {
  local code=$?
  trap - ERR
  echo "S3_CUTOVER_ROLLBACK_START code=$code"
  ln -sfn "$PREVIOUS_ENV_TARGET" "$APP_ROOT/.env.rollback"
  mv -Tf "$APP_ROOT/.env.rollback" "$APP_ROOT/.env"
  if [[ "$API_SWITCH_STARTED" == "true" ]]; then
    cd "$APP_ROOT"
    docker compose --env-file .env up -d --no-deps --no-build --force-recreate api || true
  fi
  echo "S3_CUTOVER_ROLLBACK_FINISHED"
  exit "$code"
}
trap rollback ERR

install -d -m 0700 "$RUNTIME_DIR"
install -m 0600 "$PREVIOUS_ENV_TARGET" "$CANDIDATE_ENV"

set_env_value() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$CANDIDATE_ENV"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$CANDIDATE_ENV"
  else
    printf '%s=%s\n' "$key" "$value" >> "$CANDIDATE_ENV"
  fi
}

set_env_value S3_PROVIDER s3
set_env_value S3_BUCKET_NAME "$TARGET_BUCKET"
set_env_value S3_REGION "$AWS_REGION_NAME"
set_env_value S3_FORCE_PATH_STYLE false
set_env_value S3_BACKUP_BUCKET "$BACKUP_BUCKET"

grep -Fxq 'S3_PROVIDER=s3' "$CANDIDATE_ENV"
grep -Fxq "S3_BUCKET_NAME=${TARGET_BUCKET}" "$CANDIDATE_ENV"
grep -Fxq 'S3_FORCE_PATH_STYLE=false' "$CANDIDATE_ENV"
[[ "$(stat -c '%a:%U:%G' "$CANDIDATE_ENV")" == "600:root:root" ]]

cd "$APP_ROOT"
docker compose --env-file "$CANDIDATE_ENV" config --quiet

ln -sfn "$CANDIDATE_ENV" "$APP_ROOT/.env.next"
mv -Tf "$APP_ROOT/.env.next" "$APP_ROOT/.env"
API_SWITCH_STARTED=true
docker compose --env-file .env up -d --no-deps --no-build --force-recreate api

for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$API_CONTAINER" 2>/dev/null || true)"
  if [[ "$status" == "healthy" ]]; then
    break
  fi
  sleep 2
done
[[ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$API_CONTAINER")" == "healthy" ]]

docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$API_CONTAINER" | grep -Fxq 'S3_PROVIDER=s3'
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$API_CONTAINER" | grep -Fxq "S3_BUCKET_NAME=${TARGET_BUCKET}"

curl -kfsS --resolve "${APP_DOMAIN_NAME}:443:127.0.0.1" "https://${APP_DOMAIN_NAME}/health" >/dev/null
curl -kfsS --resolve "${APP_DOMAIN_NAME}:443:127.0.0.1" "https://${APP_DOMAIN_NAME}/health/ready" >/dev/null
curl -kfsS --resolve "${APP_DOMAIN_NAME}:443:127.0.0.1" \
  "https://${APP_DOMAIN_NAME}/api/v1/products/media/${EXPECTED_FILE_ID}" \
  -o "$VERIFY_FILE"

printf '%s  %s\n' "$EXPECTED_FILE_SHA256" "$VERIFY_FILE" | sha256sum -c -
[[ "$(stat -c %s "$VERIFY_FILE")" == "$EXPECTED_FILE_BYTES" ]]

CUTOVER_SUCCEEDED=true
trap - ERR
echo "S3_CUTOVER_SUCCEEDED provider=s3 bucket=$TARGET_BUCKET candidate=$CANDIDATE_ENV source_minio_deleted=false"
