#!/usr/bin/env bash
# ==============================================================================
# ClinicOS / VetOS — Super-Admin Password Reset Script
# ==============================================================================
# Usage:
#   ./scripts/reset-password.sh "<User Email>" "<New Password>"
# Example:
#   ./scripts/reset-password.sh "dr.sharma@citypet.com" "NewSecretPass@456"
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

if [ $# -lt 2 ]; then
  echo "[-] Usage: $0 \"<User Email>\" \"<New Password>\""
  echo "    Example: $0 \"dr.sharma@citypet.com\" \"NewSecretPass@456\""
  exit 1
fi

EMAIL="$1"
NEW_PASSWORD="$2"

# Load platform secret from .env.production if present
SECRET="vetos-platform-admin-secret-change-me"
if [ -f "$PROJECT_ROOT/.env.production" ]; then
  VAL=$(grep "^VETOS_PLATFORM_ADMIN_SECRET=" "$PROJECT_ROOT/.env.production" | cut -d'=' -f2- || true)
  if [ -n "$VAL" ]; then
    SECRET="$VAL"
  fi
fi

# Determine compose command
if [ "$EUID" -ne 0 ] && ! docker ps > /dev/null 2>&1; then
  COMPOSE_CMD="sudo docker compose -f docker-compose.prod.yml --env-file $PROJECT_ROOT/.env.production"
else
  COMPOSE_CMD="docker compose -f docker-compose.prod.yml --env-file $PROJECT_ROOT/.env.production"
fi

JSON_PAYLOAD=$(cat <<EOF
{
  "email": "$EMAIL",
  "newPassword": "$NEW_PASSWORD"
}
EOF
)

echo "[+] Contacting internal platform-admin API to reset password..."
RESPONSE=$($COMPOSE_CMD exec -T api curl -s -w "\n%{http_code}" -X POST http://localhost:8080/api/v1/platform-admin/reset-password \
  -H "Content-Type: application/json" \
  -H "X-Platform-Admin-Secret: $SECRET" \
  -d "$JSON_PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "=========================================================="
  echo "  🔑 Password Successfully Reset!"
  echo "=========================================================="
  echo "  User Email:    $EMAIL"
  echo "  New Password:  $NEW_PASSWORD"
  echo "=========================================================="
  echo "The client account is updated. You can provide them their new password."
else
  echo "[-] ERROR ($HTTP_CODE): Failed to reset password."
  echo "$BODY"
  exit 1
fi
