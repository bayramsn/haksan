#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

readonly AWS_REGION_NAME="${AWS_REGION:-eu-central-1}"
readonly AWS_BACKUP_BUCKET_NAME="${AWS_BACKUP_BUCKET:-haksan-prod-backups-866490183348-eu-central-1}"
readonly INSTANCE_ID_VALUE="${INSTANCE_ID:-}"
readonly RESTORE_IMAGE="${RESTORE_IMAGE:-postgres:16-alpine}"
readonly EXPECTED_MIGRATIONS="${EXPECTED_MIGRATIONS:-81}"
readonly RESTORE_CONTAINER="haksan-postgres-restore-test-$$"
readonly WORK_DIRECTORY="$(mktemp -d /tmp/haksan-postgres-restore.XXXXXX)"
readonly BACKUP_ARCHIVE="${WORK_DIRECTORY}/backup.sql.gz"
BACKUP_URI_VALUE="${BACKUP_URI:-}"

cleanup() {
  local exit_code=$? success=0
  trap - EXIT
  [[ "${exit_code}" -eq 0 ]] && success=1
  docker rm -f "${RESTORE_CONTAINER}" >/dev/null 2>&1 || true
  rm -rf -- "${WORK_DIRECTORY}"
  if [[ -n "${INSTANCE_ID_VALUE}" ]]; then
    aws cloudwatch put-metric-data \
      --region "${AWS_REGION_NAME}" \
      --namespace Haksan/Production \
      --metric-data "MetricName=DatabaseRestoreTestSuccess,Dimensions=[{Name=InstanceId,Value=${INSTANCE_ID_VALUE}}],Value=${success},Unit=Count" \
      >/dev/null 2>&1 || true
  fi
  exit "${exit_code}"
}
trap cleanup EXIT

if [[ -z "${BACKUP_URI_VALUE}" ]]; then
  latest_backup_key="$(aws s3api list-objects-v2 \
    --region "${AWS_REGION_NAME}" \
    --bucket "${AWS_BACKUP_BUCKET_NAME}" \
    --prefix postgres/ \
    --query 'reverse(sort_by(Contents,&LastModified))[0].Key' \
    --output text)"
  if [[ -z "${latest_backup_key}" ]] || [[ "${latest_backup_key}" == "None" ]]; then
    echo "No PostgreSQL backup object was found." >&2
    exit 1
  fi
  BACKUP_URI_VALUE="s3://${AWS_BACKUP_BUCKET_NAME}/${latest_backup_key}"
fi

if [[ "${BACKUP_URI_VALUE}" != s3://*/* ]]; then
  echo "BACKUP_URI must be an S3 object URI." >&2
  exit 1
fi

s3_path="${BACKUP_URI_VALUE#s3://}"
backup_bucket="${s3_path%%/*}"
backup_key="${s3_path#*/}"

aws s3 cp "${BACKUP_URI_VALUE}" "${BACKUP_ARCHIVE}" \
  --region "${AWS_REGION_NAME}" \
  --only-show-errors

gzip -t "${BACKUP_ARCHIVE}"
local_checksum="$(sha256sum "${BACKUP_ARCHIVE}" | awk '{ print $1 }')"
remote_checksum="$(aws s3api head-object \
  --region "${AWS_REGION_NAME}" \
  --bucket "${backup_bucket}" \
  --key "${backup_key}" \
  --query Metadata.sha256 \
  --output text)"

if [[ -z "${remote_checksum}" ]] || [[ "${remote_checksum}" == "None" ]] || [[ "${local_checksum}" != "${remote_checksum}" ]]; then
  echo "Backup checksum verification failed." >&2
  exit 1
fi

docker run -d \
  --name "${RESTORE_CONTAINER}" \
  --network none \
  --security-opt no-new-privileges:true \
  -e POSTGRES_PASSWORD=haksan_restore_test_only \
  -e POSTGRES_DB=haksan_restore \
  "${RESTORE_IMAGE}" >/dev/null

ready=0
for _ in $(seq 1 60); do
  ready_events="$(docker logs "${RESTORE_CONTAINER}" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "${ready_events}" -ge 2 ]] && \
    docker exec "${RESTORE_CONTAINER}" pg_isready -U postgres -d haksan_restore >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "${ready}" -ne 1 ]]; then
  echo "Temporary PostgreSQL restore target did not become ready." >&2
  exit 1
fi

gzip -dc "${BACKUP_ARCHIVE}" | docker exec -i "${RESTORE_CONTAINER}" \
  psql -v ON_ERROR_STOP=1 -U postgres -d haksan_restore >/dev/null

table_count="$(docker exec "${RESTORE_CONTAINER}" psql -At -U postgres -d haksan_restore \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")"
migration_count="$(docker exec "${RESTORE_CONTAINER}" psql -At -U postgres -d haksan_restore \
  -c "SELECT count(*) FROM drizzle.__drizzle_migrations;")"

if [[ ! "${table_count}" =~ ^[0-9]+$ ]] || [[ "${table_count}" -lt 1 ]]; then
  echo "Restored database contains no public tables." >&2
  exit 1
fi

if [[ "${migration_count}" != "${EXPECTED_MIGRATIONS}" ]]; then
  echo "Restored migration count mismatch: expected ${EXPECTED_MIGRATIONS}, got ${migration_count}." >&2
  exit 1
fi

printf '[restore-test] verified %s checksum=%s tables=%s migrations=%s\n' \
  "${BACKUP_URI_VALUE}" "${local_checksum}" "${table_count}" "${migration_count}"
