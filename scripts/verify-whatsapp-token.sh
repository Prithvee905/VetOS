#!/usr/bin/env bash
# Verify META_WHATSAPP_TOKEN + PHONE_NUMBER_ID against Graph API (run on EC2 in repo root).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/.env.production"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[-] Missing .env.production at $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$ENV_FILE"
set +a

TOKEN="${META_WHATSAPP_TOKEN:-}"
PHONE_ID="${META_WHATSAPP_PHONE_NUMBER_ID:-}"

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
  echo "[-] Token is not valid for Graph API. Generate a new System User token for the ClinicOS app"
  echo "    with whatsapp_business_messaging + whatsapp_business_management."
  exit 1
fi

if [[ "$PHONE_CODE" != "200" ]]; then
  echo "[-] Token works but cannot read this phone number ID. Wrong ID or token lacks access to this WABA."
  echo "    Copy Phone number ID from developers.facebook.com → ClinicOS app → WhatsApp → API Setup."
  exit 1
fi

echo "[+] Token and phone number ID look valid. If outbox still fails, check template name and recipient allow-list."
