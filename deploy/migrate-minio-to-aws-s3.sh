#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

readonly APP_ROOT="${APP_ROOT:-/opt/haksan}"
readonly ENV_FILE="${ENV_FILE:-${APP_ROOT}/.env}"
readonly AWS_REGION_NAME="${AWS_REGION:-eu-central-1}"
readonly TARGET_BUCKET="${TARGET_BUCKET:?TARGET_BUCKET is required}"
readonly WORK_DIRECTORY="$(mktemp -d /tmp/haksan-storage-migration.XXXXXX)"
readonly SOURCE_DIRECTORY="${WORK_DIRECTORY}/source"
readonly VERIFY_DIRECTORY="${WORK_DIRECTORY}/verify"
readonly BUCKETS=(
  erp-product-images
  erp-company-logos
  erp-brand-logos
  erp-product-documents
  erp-quote-documents
  erp-proforma-documents
  erp-contract-documents
  erp-invoice-documents
  erp-stock-documents
  erp-service-documents
  erp-import-raw
)

cleanup() {
  rm -rf -- "${WORK_DIRECTORY}"
}
trap cleanup EXIT

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID is required for the MinIO source}"
: "${S3_SECRET_ACCESS_KEY:?S3_SECRET_ACCESS_KEY is required for the MinIO source}"

minio_ip="$(docker exec haksan-api-1 getent hosts minio | awk 'NR == 1 { print $1 }')"
if [[ -z "${minio_ip}" ]]; then
  echo "MinIO container address could not be resolved." >&2
  exit 1
fi

install -d -m 0700 "${SOURCE_DIRECTORY}" "${VERIFY_DIRECTORY}"
total_objects=0
total_bytes=0

for logical_bucket in "${BUCKETS[@]}"; do
  if ! AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID}" \
    AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY}" \
    AWS_SESSION_TOKEN= \
      aws s3api head-bucket \
        --endpoint-url "http://${minio_ip}:9000" \
        --region us-east-1 \
        --bucket "${logical_bucket}" >/dev/null 2>&1; then
    printf '[storage-migration] bucket=%s status=missing-source skipped=true\n' "${logical_bucket}"
    continue
  fi

  source_path="${SOURCE_DIRECTORY}/${logical_bucket}"
  verify_path="${VERIFY_DIRECTORY}/${logical_bucket}"
  install -d -m 0700 "${source_path}" "${verify_path}"

  AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID}" \
  AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY}" \
  AWS_SESSION_TOKEN= \
    aws s3 sync "s3://${logical_bucket}/" "${source_path}/" \
      --endpoint-url "http://${minio_ip}:9000" \
      --region us-east-1 \
      --only-show-errors \
      --no-progress

  aws s3 sync "${source_path}/" "s3://${TARGET_BUCKET}/${logical_bucket}/" \
    --region "${AWS_REGION_NAME}" \
    --sse AES256 \
    --only-show-errors \
    --no-progress

  aws s3 sync "s3://${TARGET_BUCKET}/${logical_bucket}/" "${verify_path}/" \
    --region "${AWS_REGION_NAME}" \
    --only-show-errors \
    --no-progress

  diff -qr "${source_path}" "${verify_path}" >/dev/null

  object_count="$(find "${source_path}" -type f | wc -l | tr -d ' ')"
  byte_count="$(find "${source_path}" -type f -exec stat -c %s {} + | awk '{ total += $1 } END { print total + 0 }')"
  total_objects=$((total_objects + object_count))
  total_bytes=$((total_bytes + byte_count))
  printf '[storage-migration] bucket=%s objects=%s bytes=%s verified=byte-for-byte\n' \
    "${logical_bucket}" "${object_count}" "${byte_count}"
done

printf '[storage-migration] target=s3://%s total_objects=%s total_bytes=%s source_deleted=false\n' \
  "${TARGET_BUCKET}" "${total_objects}" "${total_bytes}"
