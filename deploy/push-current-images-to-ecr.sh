#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${AWS_ACCOUNT_ID:?AWS_ACCOUNT_ID is required}"
: "${AWS_REGION:?AWS_REGION is required}"
: "${API_IMAGE_TAG:?API_IMAGE_TAG is required}"
: "${WEB_IMAGE_TAG:?WEB_IMAGE_TAG is required}"

registry="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
api_image="${registry}/haksan/api:${API_IMAGE_TAG}"
web_image="${registry}/haksan/web:${WEB_IMAGE_TAG}"

cleanup() {
  docker logout "$registry" >/dev/null 2>&1 || true
  docker image rm "$api_image" "$web_image" >/dev/null 2>&1 || true
}
trap cleanup EXIT

aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "$registry"

docker tag haksan-api:latest "$api_image"
docker tag haksan-nginx:latest "$web_image"
docker push "$api_image"
docker push "$web_image"

echo "ECR_PUSH_SUCCEEDED api=$api_image web=$web_image"
