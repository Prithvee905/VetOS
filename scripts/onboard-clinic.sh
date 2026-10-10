#!/usr/bin/env bash
# ==============================================================================
# ClinicOS / VetOS — Super-Admin Clinic Onboarding Script
# ==============================================================================
# Usage:
#   ./scripts/onboard-clinic.sh "<Clinic Name>" "<Owner Email>" "<Password>" ["<Display Name>"] ["<Branch Name>"]
# Example:
#   ./scripts/onboard-clinic.sh "City Pet Hospital" "dr.sharma@citypet.com" "SecretPass@123" "Dr. Sharma" "Main"
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

if [ $# -lt 3 ]; then
  echo "[-] Usage: $0 \"<Clinic Name>\" \"<Owner Email>\" \"<Password>\" [\"<Display Name>\"] [\"<Branch Name>\"]"
  echo "    Example: $0 \"City Pet Hospital\" \"dr.sharma@citypet.com\" \"SecretPass@123\""
  exit 1
fi

CLINIC_NAME="$1"
EMAIL="$2"
PASSWORD="$3"
DISPLAY_NAME="${4:-Clinic Owner}"
BRANCH_NAME="${5:-Main}"

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
  "clinicName": "$CLINIC_NAME",
  "email": "$EMAIL",
  "password": "$PASSWORD",
  "displayName": "$DISPLAY_NAME",
  "branchName": "$BRANCH_NAME"
}
EOF
)

echo "[+] Contacting internal platform-admin API to onboard clinic..."
RESPONSE=$($COMPOSE_CMD exec -T api curl -s -w "\n%{http_code}" -X POST http://localhost:8080/api/v1/platform-admin/onboard-clinic \
  -H "Content-Type: application/json" \
  -H "X-Platform-Admin-Secret: $SECRET" \
  -d "$JSON_PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 201 ]; then
  echo "=========================================================="
  echo "  🎉 Clinic Successfully Onboarded!"
  echo "=========================================================="
  echo "  Clinic Name:   $CLINIC_NAME"
  echo "  Branch:        $BRANCH_NAME"
  echo "  Owner Name:    $DISPLAY_NAME"
  echo "  Login Email:   $EMAIL"
  echo "  Password:      $PASSWORD"
  echo "=========================================================="
  echo "You can now hand these login credentials directly to your client."
else
  echo "[-] ERROR ($HTTP_CODE): Failed to onboard clinic."
  echo "$BODY"
  exit 1
fi
