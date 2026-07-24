#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_ROOT"

ENV_FILE="${ENV_FILE:-.env}"
CERT_DIR="$APP_ROOT/deploy/certbot/conf"
WEBROOT_DIR="$APP_ROOT/deploy/certbot/www"
COMPOSE_CMD=()

usage() {
  cat <<'EOF'
Usage:
  ./deploy.sh              Build, migrate, and start/update the Docker Compose stack
  ./deploy.sh --init-ssl   Request/replace Let's Encrypt certificates via webroot
  ./deploy.sh --renew-ssl  Renew certificates and reload nginx

Required:
  cp .env.example .env
  Edit .env before running this script.
EOF
}

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

detect_compose() {
  if [[ -n "${COMPOSE:-}" ]]; then
    # shellcheck disable=SC2206
    COMPOSE_CMD=($COMPOSE)
  elif docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
  elif docker-compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
  else
    die "Docker Compose not found. Install docker-compose-plugin or docker-compose."
  fi
}

compose() {
  "${COMPOSE_CMD[@]}" "$@"
}

load_env() {
  [[ -f "$ENV_FILE" ]] || die "$ENV_FILE missing. Copy .env.example to .env and fill it."
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || die "$name is required in $ENV_FILE"
}

reject_placeholder() {
  local name="$1"
  local value="${!name:-}"
  [[ "$value" != *example.com* && "$value" != CHANGE_ME* ]] || die "$name still contains a placeholder"
}

is_true() {
  case "${1,,}" in
    true|1|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

ensure_env_ready() {
  load_env
  for key in APP_DOMAIN STORAGE_DOMAIN CERTBOT_EMAIL POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD DATABASE_URL DATABASE_SSL DATABASE_SSL_REJECT_UNAUTHORIZED DATABASE_ALLOW_PLAINTEXT JWT_ACCESS_SECRET JWT_REFRESH_SECRET COOKIE_SECRET CALL_WEBHOOK_SECRET MINIO_ROOT_USER MINIO_ROOT_PASSWORD S3_PROVIDER S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_REGION S3_BUCKET_PREFIX CORS_ORIGINS COOKIE_DOMAIN S3_ENDPOINT APP_PUBLIC_URL SMTP_HOST SMTP_SECURE SMTP_FROM METRICS_TOKEN DB_BACKUP_ENABLED DB_BACKUP_REQUIRED DB_BACKUP_TIMEOUT_SECONDS; do
    require_env "$key"
    reject_placeholder "$key"
  done
  if [[ "$S3_PROVIDER" == "s3" ]]; then
    require_env S3_BUCKET_NAME
    reject_placeholder S3_BUCKET_NAME
  fi
  if ! is_true "$DATABASE_SSL" && ! is_true "$DATABASE_ALLOW_PLAINTEXT"; then
    die "DATABASE_SSL=true is required unless DATABASE_ALLOW_PLAINTEXT=true is explicitly set for a private network"
  fi
  if is_true "$DB_BACKUP_ENABLED"; then
    require_env S3_BACKUP_BUCKET
    reject_placeholder S3_BACKUP_BUCKET
    is_true "$DB_BACKUP_REQUIRED" || die "DB_BACKUP_REQUIRED must be true when DB_BACKUP_ENABLED=true"
  fi
  [[ "$MINIO_ROOT_USER" != "minioadmin" && "$MINIO_ROOT_PASSWORD" != "minioadmin" ]] || die "MinIO default root credentials are forbidden"
  [[ "$MINIO_ROOT_USER" != "$S3_ACCESS_KEY_ID" && "$MINIO_ROOT_PASSWORD" != "$S3_SECRET_ACCESS_KEY" ]] || die "S3 application credentials must be distinct from MinIO root credentials"
  [[ -z "${SMTP_USER:-}" && -z "${SMTP_PASSWORD:-}" ]] || [[ -n "${SMTP_USER:-}" && -n "${SMTP_PASSWORD:-}" ]] || die "SMTP_USER and SMTP_PASSWORD must be configured together"
}

ensure_dummy_cert() {
  mkdir -p "$CERT_DIR/live/$APP_DOMAIN" "$WEBROOT_DIR"
  if [[ -f "$CERT_DIR/live/$APP_DOMAIN/fullchain.pem" && -f "$CERT_DIR/live/$APP_DOMAIN/privkey.pem" ]]; then
    return
  fi
  log "creating temporary self-signed certificate for nginx bootstrap"
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "$CERT_DIR/live/$APP_DOMAIN/privkey.pem" \
    -out "$CERT_DIR/live/$APP_DOMAIN/fullchain.pem" \
    -subj "/CN=$APP_DOMAIN" >/dev/null 2>&1
}

build_and_start() {
  detect_compose
  ensure_env_ready
  ensure_dummy_cert

  local release_id="${API_RELEASE_ID:-}"
  if [[ -z "$release_id" ]]; then
    release_id="$(git rev-parse --short HEAD 2>/dev/null || printf 'workspace')-$(date -u +%Y%m%dT%H%M%SZ)"
  fi
  local build_time
  build_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  log "building api and nginx images"
  compose --env-file "$ENV_FILE" build --provenance=false \
    --build-arg "VITE_API_BASE_URL=${VITE_API_BASE_URL:-/api/v1}" \
    --build-arg "API_RELEASE_ID=$release_id" \
    --build-arg "BUILD_TIME=$build_time" \
    api nginx

  log "starting postgres, minio, and bucket setup"
  compose --env-file "$ENV_FILE" up -d postgres minio minio-init

  log "creating and verifying PostgreSQL backup before migrations"
  ENV_FILE="$ENV_FILE" "$APP_ROOT/deploy/backup-postgres.sh"

  if is_true "$DB_BACKUP_ENABLED"; then
    log "creating offsite PostgreSQL backup before migrations"
    # Offsite backup is best-effort: a local verified backup already ran above.
    # The S3 uploader still fails on some endpoints (chunked Transfer-Encoding →
    # NotImplemented), so a failed offsite upload must not abort the deploy.
    compose --env-file "$ENV_FILE" run --rm api npm --workspace @haksan/api run db:backup:prod \
      || log "WARN offsite backup failed (WIP S3 upload bug) — continuing; local backup already taken"
  fi

  log "running schema migrations"
  compose --env-file "$ENV_FILE" run --rm api npm --workspace @haksan/api run db:migrate:prod

  log "running data migrations"
  compose --env-file "$ENV_FILE" run --rm api npm --workspace @haksan/api run db:data-migrate:prod

  log "starting api and nginx"
  compose --env-file "$ENV_FILE" up -d api nginx

  log "local health check"
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1/health" >/dev/null; then
      log "stack is healthy"
      return
    fi
    sleep 2
  done
  die "health check failed. Inspect with: docker compose logs --tail=200 api nginx"
}

init_ssl() {
  detect_compose
  ensure_env_ready
  ensure_dummy_cert

  log "starting nginx for ACME webroot challenge"
  compose --env-file "$ENV_FILE" up -d nginx

  log "removing temporary certificate before certbot request"
  rm -rf "$CERT_DIR/live/$APP_DOMAIN" "$CERT_DIR/archive/$APP_DOMAIN" "$CERT_DIR/renewal/$APP_DOMAIN.conf"

  log "requesting Let's Encrypt certificate for $APP_DOMAIN and $STORAGE_DOMAIN"
  certbot_args=(
    certonly
    --webroot
    --webroot-path /var/www/certbot
    --agree-tos
    --no-eff-email
    --force-renewal
    -d "$APP_DOMAIN"
    -d "$STORAGE_DOMAIN"
  )
  if [[ "${CERTBOT_EMAIL:-}" == "none" ]]; then
    certbot_args+=(--register-unsafely-without-email)
  else
    certbot_args+=(--email "$CERTBOT_EMAIL")
  fi

  compose --env-file "$ENV_FILE" run --rm certbot "${certbot_args[@]}"

  log "reloading nginx"
  compose --env-file "$ENV_FILE" exec nginx nginx -s reload
}

renew_ssl() {
  detect_compose
  ensure_env_ready
  compose --env-file "$ENV_FILE" run --rm certbot renew --webroot --webroot-path /var/www/certbot
  compose --env-file "$ENV_FILE" exec nginx nginx -s reload
}

case "${1:-deploy}" in
  deploy) build_and_start ;;
  --init-ssl) init_ssl ;;
  --renew-ssl) renew_ssl ;;
  -h|--help) usage ;;
  *) usage; exit 1 ;;
esac
