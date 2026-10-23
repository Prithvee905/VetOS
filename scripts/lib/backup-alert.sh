#!/usr/bin/env bash
# Shared helpers for the backup and restore-test scripts.
# Source after .env.production has been loaded.

# Runs the AWS CLI from the host, or from the official image when the host has none.
# --network host lets the container reach the EC2 instance role (IMDSv2) like the host does.
aws_cli() {
  if command -v aws > /dev/null 2>&1; then
    aws "$@"
  else
    docker run --rm --network host \
      -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN \
      -e AWS_REGION -e AWS_DEFAULT_REGION -e AWS_ENDPOINT_URL \
      -v "$PROJECT_ROOT/backups:$PROJECT_ROOT/backups" \
      amazon/aws-cli:2.17.0 "$@"
  fi
}

# Pings the dead-man's-switch URL (e.g. healthchecks.io) if configured: "" = success, "/start", "/fail".
healthcheck_ping() {
  local suffix="${1:-}"
  if [ -n "${BACKUP_HEALTHCHECK_URL:-}" ]; then
    curl -fsS -m 10 --retry 3 "${BACKUP_HEALTHCHECK_URL}${suffix}" > /dev/null 2>&1 || true
  fi
}

# Emails BACKUP_ALERT_EMAIL through the same email API the app uses (Resend-compatible).
send_backup_alert() {
  local subject="$1"
  local body="$2"
  healthcheck_ping "/fail"
  if [ -z "${BACKUP_ALERT_EMAIL:-}" ] || [ -z "${VETOS_EMAIL_API_KEY:-}" ] || [ -z "${VETOS_EMAIL_FROM_ADDRESS:-}" ]; then
    echo "[!] No alert email configured (BACKUP_ALERT_EMAIL, VETOS_EMAIL_API_KEY, VETOS_EMAIL_FROM_ADDRESS)."
    return 0
  fi
  local url="${VETOS_EMAIL_API_BASE_URL:-https://api.resend.com/emails}"
  local payload
  payload=$(printf '{"from":"%s","to":["%s"],"subject":"%s","text":"%s"}' \
    "$VETOS_EMAIL_FROM_ADDRESS" "$BACKUP_ALERT_EMAIL" "$(json_escape "$subject")" "$(json_escape "$body")")
  curl -fsS -m 20 -X POST "$url" \
    -H "Authorization: Bearer $VETOS_EMAIL_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$payload" > /dev/null 2>&1 || echo "[!] Could not send the alert email."
}

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk 'BEGIN { ORS = "\\n" } { print }' | sed 's/\\n$//'
}
