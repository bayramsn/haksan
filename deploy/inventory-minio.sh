#!/usr/bin/env bash

set -Eeuo pipefail

readonly APP_ROOT="${APP_ROOT:-/opt/haksan}"
readonly ENV_FILE="${ENV_FILE:-${APP_ROOT}/.env}"
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

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID is required}"
: "${S3_SECRET_ACCESS_KEY:?S3_SECRET_ACCESS_KEY is required}"

minio_ip="$(docker exec haksan-api-1 getent hosts minio | awk 'NR == 1 { print $1 }')"
if [[ -z "${minio_ip}" ]]; then
  echo "MinIO container address could not be resolved." >&2
  exit 1
fi

total_objects=0
total_bytes=0

for bucket in "${BUCKETS[@]}"; do
  if ! AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID}" \
    AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY}" \
    AWS_SESSION_TOKEN= \
      aws s3api head-bucket \
        --endpoint-url "http://${minio_ip}:9000" \
        --region us-east-1 \
        --bucket "${bucket}" >/dev/null 2>&1; then
    printf '[minio-inventory] bucket=%s objects=0 bytes=0 status=missing\n' "${bucket}"
    continue
  fi
  read -r object_count byte_count < <(
    AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID}" \
    AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY}" \
    AWS_SESSION_TOKEN= \
      aws s3api list-objects-v2 \
        --endpoint-url "http://${minio_ip}:9000" \
        --region us-east-1 \
        --bucket "${bucket}" \
        --query '[length(Contents || `[]`), sum(Contents[].Size || `[]`)]' \
        --output text
  )
  [[ "${object_count}" == "None" ]] && object_count=0
  [[ "${byte_count}" == "None" ]] && byte_count=0
  total_objects=$((total_objects + object_count))
  total_bytes=$((total_bytes + byte_count))
  printf '[minio-inventory] bucket=%s objects=%s bytes=%s\n' "${bucket}" "${object_count}" "${byte_count}"
done

printf '[minio-inventory] total_objects=%s total_bytes=%s\n' "${total_objects}" "${total_bytes}"
