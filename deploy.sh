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

ensure_env_ready() {
  load_env
  for key in APP_DOMAIN STORAGE_DOMAIN CERTBOT_EMAIL POSTGRES_PASSWORD DATABASE_URL JWT_ACCESS_SECRET JWT_REFRESH_SECRET COOKIE_SECRET CALL_WEBHOOK_SECRET MINIO_ROOT_USER MINIO_ROOT_PASSWORD S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY CORS_ORIGINS COOKIE_DOMAIN S3_ENDPOINT; do
    require_env "$key"
    reject_placeholder "$key"
  done
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

  log "building api and nginx images"
  compose --env-file "$ENV_FILE" build \
    --build-arg "VITE_API_BASE_URL=${VITE_API_BASE_URL:-/api/v1}" \
    api nginx

  log "starting postgres, minio, and bucket setup"
  compose --env-file "$ENV_FILE" up -d postgres minio minio-init

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
