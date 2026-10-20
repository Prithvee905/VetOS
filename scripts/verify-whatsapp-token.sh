#!/usr/bin/env bash
# Verify META_WHATSAPP_TOKEN + PHONE_NUMBER_ID against Graph API (run on EC2 in repo root).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/lib/read-env-var.sh
source "$ROOT/scripts/lib/read-env-var.sh"

ENV_FILE="${ROOT}/.env.production"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[-] Missing .env.production at $ENV_FILE"
  exit 1
fi

TOKEN="$(read_env_var META_WHATSAPP_TOKEN "$ENV_FILE" || true)"
PHONE_ID="$(read_env_var META_WHATSAPP_PHONE_NUMBER_ID "$ENV_FILE" || true)"

if [[ -z "$TOKEN" ]]; then
  echo "[-] META_WHATSAPP_TOKEN is empty in .env.production"
  exit 1
fi
if [[ -z "$PHONE_ID" ]]; then
  echo "[-] META_WHATSAPP_PHONE_NUMBER_ID is empty in .env.production"
  exit 1
fi

echo "[+] Token length: ${#TOKEN} characters"
echo "[+] Phone number ID: $PHONE_ID"

if [[ "$TOKEN" == *$'\n'* ]] || [[ "$TOKEN" == *$'\r'* ]]; then
  echo "[-] Token contains a line break. Put the entire token on ONE line in .env.production."
  exit 1
fi
if [[ "$TOKEN" == *" "* ]]; then
  echo "[-] Token contains spaces. Paste only the EAA… string (no 'Bearer ' prefix)."
  exit 1
fi
if [[ ! "$TOKEN" =~ ^EAA[A-Za-z0-9_-]+$ ]]; then
  echo "[!] Token does not look like a Meta user token (expected to start with EAA). Check copy/paste."
fi
echo ""

echo "=== Token in running API container (length only) ==="
if docker compose -f "$ROOT/docker-compose.prod.yml" --env-file "$ENV_FILE" ps api 2>/dev/null | grep -q Up; then
  CONTAINER_LEN="$(docker compose -f "$ROOT/docker-compose.prod.yml" --env-file "$ENV_FILE" exec -T api sh -c 'printf %s "$META_WHATSAPP_TOKEN" | wc -c' | tr -d ' \r')"
  echo "[+] api container META_WHATSAPP_TOKEN length: ${CONTAINER_LEN}"
  if [[ "$CONTAINER_LEN" != "${#TOKEN}" ]]; then
    echo "[!] File token length (${#TOKEN}) != container length (${CONTAINER_LEN}). Recreate api after fixing .env:"
    echo "    docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api"
  fi
else
  echo "[!] api container not running; skip container check."
fi
echo ""

echo "=== 1) Token identity (GET /me) ==="
ME_JSON="$(curl -sS -w "\nHTTP_CODE:%{http_code}" -H "Authorization: Bearer ${TOKEN}" \
  "https://graph.facebook.com/v23.0/me?fields=id,name")"
echo "$ME_JSON" | sed '$d'
ME_CODE="$(echo "$ME_JSON" | tail -1 | sed 's/HTTP_CODE://')"
echo "HTTP $ME_CODE"
echo ""

echo "=== 2) Phone number object (GET /{phone-number-id}) ==="
PHONE_JSON="$(curl -sS -w "\nHTTP_CODE:%{http_code}" -H "Authorization: Bearer ${TOKEN}" \
  "https://graph.facebook.com/v23.0/${PHONE_ID}?fields=id,display_phone_number,verified_name")"
echo "$PHONE_JSON" | sed '$d'
PHONE_CODE="$(echo "$PHONE_JSON" | tail -1 | sed 's/HTTP_CODE://')"
echo "HTTP $PHONE_CODE"
echo ""

if [[ "$ME_CODE" != "200" ]]; then
  echo "[-] Graph rejected the token (often OAuth 190 = malformed copy in .env)."
  echo "    Fix: developers.facebook.com → ClinicOS → WhatsApp → API Setup → Generate access token."
  echo "    In nano, one line only: META_WHATSAPP_TOKEN=EAApaste_here"
  echo "    No quotes, no 'Bearer ', no line breaks. Then recreate api container."
  exit 1
fi

if [[ "$PHONE_CODE" != "200" ]]; then
  echo "[-] Token works but cannot read this phone number ID. Use the ID shown under API Setup → From."
  exit 1
fi

echo "[+] Token and phone number ID look valid. Send hello_world from Communications and Process queue now."
