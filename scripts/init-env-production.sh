#!/usr/bin/env bash
# Generate or update .env.production on the server (never commit that file).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DOMAIN="${1:-app.vetosclinic.com}"
ENV_FILE="$ROOT/.env.production"

read_var() {
  local key="$1" file="$2" default="${3:-}"
  if [[ -f "$file" ]] && grep -q "^${key}=" "$file"; then
    grep "^${key}=" "$file" | tail -1 | cut -d= -f2-
  else
    echo "$default"
  fi
}

if [[ -f "$ENV_FILE" ]]; then
  cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
  echo "Backed up existing .env.production"
fi

OLD="$ENV_FILE"
[[ -f "$ENV_FILE" ]] || OLD=""

if [[ -n "$OLD" ]] && ! grep -q 'replace_with_' "$OLD" 2>/dev/null; then
  echo "Keeping existing DB/JWT secrets."
  POSTGRES_PASSWORD="$(read_var POSTGRES_PASSWORD "$OLD")"
  APP_DB_PASSWORD="$(read_var APP_DB_PASSWORD "$OLD")"
  VETOS_JWT_SECRET="$(read_var VETOS_JWT_SECRET "$OLD")"
  VETOS_PLATFORM_ADMIN_SECRET="$(read_var VETOS_PLATFORM_ADMIN_SECRET "$OLD")"
  META_TOKEN="$(read_var META_WHATSAPP_TOKEN "$OLD")"
else
  echo "Generating new database and JWT secrets (first-time setup)."
  POSTGRES_PASSWORD="$(openssl rand -hex 16)"
  APP_DB_PASSWORD="$(openssl rand -hex 16)"
  VETOS_JWT_SECRET="$(openssl rand -hex 32)"
  VETOS_PLATFORM_ADMIN_SECRET="$(openssl rand -hex 32)"
  META_TOKEN=""
fi

META_PHONE="${META_WHATSAPP_PHONE_NUMBER_ID:-1201808123018828}"
META_WABA="${META_WHATSAPP_BUSINESS_ACCOUNT_ID:-1389805823073189}"
VERIFY_TOKEN="${VETOS_WHATSAPP_VERIFY_TOKEN:-vetos-clinicos-verify-2026-xK9m}"

cat > "$ENV_FILE" <<EOF
# Generated/updated by scripts/init-env-production.sh — do not commit
DOMAIN_NAME=$DOMAIN
APP_DOMAIN=$DOMAIN

POSTGRES_DB=vetos
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
APP_DB_USER=vetos_app
APP_DB_PASSWORD=$APP_DB_PASSWORD

SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/vetos
SPRING_DATASOURCE_USERNAME=vetos_app
SPRING_DATASOURCE_PASSWORD=$APP_DB_PASSWORD

SPRING_FLYWAY_URL=jdbc:postgresql://postgres:5432/vetos
SPRING_FLYWAY_USER=postgres
SPRING_FLYWAY_PASSWORD=$POSTGRES_PASSWORD

SPRING_DATA_REDIS_HOST=redis
SPRING_DATA_REDIS_PORT=6379

VETOS_JWT_SECRET=$VETOS_JWT_SECRET
VETOS_PLATFORM_ADMIN_SECRET=$VETOS_PLATFORM_ADMIN_SECRET
SPRING_PROFILES_ACTIVE=prod

VETOS_REDIS_ENABLED=true
# Set to true after appointment/vax Meta templates are Active (see docs/whatsapp-meta-templates.md)
VETOS_REMINDERS_DAILY_ENABLED=false
VETOS_SECURITY_COOKIE_SECURE=true
VETOS_CORS_ALLOWED_ORIGIN=https://$DOMAIN

API_ORIGIN=http://api:8080
NEXT_PUBLIC_API_URL=https://$DOMAIN/api/v1

META_WHATSAPP_TOKEN=$META_TOKEN
META_WHATSAPP_PHONE_NUMBER_ID=$META_PHONE
META_WHATSAPP_BUSINESS_ACCOUNT_ID=$META_WABA
VETOS_WHATSAPP_VERIFY_TOKEN=$VERIFY_TOKEN
EOF

chmod 600 "$ENV_FILE"
echo "Wrote $ENV_FILE for domain $DOMAIN"
echo "Add META_WHATSAPP_TOKEN in nano if empty, then run: ./scripts/deploy.sh"
