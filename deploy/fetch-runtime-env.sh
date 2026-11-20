#!/usr/bin/env bash

set -Eeuo pipefail

readonly AWS_REGION_NAME="${AWS_REGION:-eu-central-1}"
readonly RUNTIME_SECRET_ID="${HAKSAN_RUNTIME_SECRET_ID:-arn:aws:secretsmanager:eu-central-1:866490183348:secret:haksan/prod/runtime-env-2THjJn}"
readonly RUNTIME_DIRECTORY="/run/haksan"
readonly RUNTIME_ENV_FILE="${RUNTIME_DIRECTORY}/.env"

umask 077
install -d -m 0700 -o root -g root "${RUNTIME_DIRECTORY}"

temporary_file="$(mktemp "${RUNTIME_DIRECTORY}/.env.XXXXXX")"
cleanup() {
  rm -f -- "${temporary_file}"
}
trap cleanup EXIT

aws secretsmanager get-secret-value \
  --region "${AWS_REGION_NAME}" \
  --secret-id "${RUNTIME_SECRET_ID}" \
  --query SecretString \
  --output text >"${temporary_file}"

# The AWS CLI text formatter always appends one transport newline. Remove only
# that byte so the materialized file is identical to the stored SecretString.
if [[ "$(stat -c %s "${temporary_file}")" -lt 1 ]]; then
  echo "Secrets Manager returned an empty runtime environment." >&2
  exit 1
fi
truncate -s -1 "${temporary_file}"

if [[ ! -s "${temporary_file}" ]] || LC_ALL=C grep -qx 'None' "${temporary_file}"; then
  echo "Secrets Manager returned an empty runtime environment." >&2
  exit 1
fi

if ! LC_ALL=C grep -Iq . "${temporary_file}"; then
  echo "Runtime environment is not a plain-text file." >&2
  exit 1
fi

for required_key in APP_DOMAIN STORAGE_DOMAIN DATABASE_URL S3_PROVIDER; do
  if ! grep -Eq "^[[:space:]]*${required_key}=.+$" "${temporary_file}"; then
    echo "Runtime environment is missing required key: ${required_key}" >&2
    exit 1
  fi
done

chown root:root "${temporary_file}"
chmod 0600 "${temporary_file}"
mv -f -- "${temporary_file}" "${RUNTIME_ENV_FILE}"
trap - EXIT
