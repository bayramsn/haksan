#!/usr/bin/env bash
set -euo pipefail
umask 077

APP_ROOT="${APP_ROOT:-/opt/haksan}"
AWS_REGION="${AWS_REGION:-eu-central-1}"
AWS_BACKUP_BUCKET="${AWS_BACKUP_BUCKET:?AWS_BACKUP_BUCKET is required}"
INSTANCE_ID="${INSTANCE_ID:?INSTANCE_ID is required}"
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-$APP_ROOT/backups/postgres}"

report_backup_metric() {
  local exit_code=$? success=0
  [[ "$exit_code" -eq 0 ]] && success=1
  aws cloudwatch put-metric-data \
    --region "$AWS_REGION" \
    --namespace Haksan/Production \
    --metric-data "MetricName=DatabaseBackupSuccess,Dimensions=[{Name=InstanceId,Value=$INSTANCE_ID}],Value=$success,Unit=Count" \
    >/dev/null 2>&1 || true
  exit "$exit_code"
}
trap report_backup_metric EXIT

cd "$APP_ROOT"
"$APP_ROOT/deploy/backup-postgres.sh"

latest="$(find "$LOCAL_BACKUP_DIR" -maxdepth 1 -type f -name 'haksan_*.sql.gz' -print | sort | tail -1)"
[[ -n "$latest" && -f "$latest" ]] || {
  printf '[aws-backup] verified local backup not found in %s\n' "$LOCAL_BACKUP_DIR" >&2
  exit 1
}

gzip -t "$latest"
checksum="$(sha256sum "$latest" | awk '{ print $1 }')"
object_key="postgres/$(basename "$latest")"

aws s3 cp "$latest" "s3://$AWS_BACKUP_BUCKET/$object_key" \
  --region "$AWS_REGION" \
  --only-show-errors \
  --sse AES256 \
  --metadata "sha256=$checksum"

remote_checksum="$(aws s3api head-object \
  --region "$AWS_REGION" \
  --bucket "$AWS_BACKUP_BUCKET" \
  --key "$object_key" \
  --query 'Metadata.sha256' \
  --output text)"

[[ "$remote_checksum" == "$checksum" ]] || {
  printf '[aws-backup] checksum mismatch for s3://%s/%s\n' "$AWS_BACKUP_BUCKET" "$object_key" >&2
  exit 1
}

printf '[aws-backup] verified s3://%s/%s sha256=%s\n' "$AWS_BACKUP_BUCKET" "$object_key" "$checksum"
