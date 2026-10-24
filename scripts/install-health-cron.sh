#!/usr/bin/env bash
# ==============================================================================
# ClinicOS / VetOS — Install the 5-minute server health check cron job
# ==============================================================================
# Usage (on the EC2 host, from the repo root):
#   ./scripts/install-health-cron.sh
# Safe to run again; it replaces its own entry and leaves other cron jobs alone.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MARKER="# vetos-health"

chmod +x "$SCRIPT_DIR/health-check.sh"
mkdir -p "$PROJECT_ROOT/backups"

if ! grep -qE '^BACKUP_ALERT_EMAIL=.+' "$PROJECT_ROOT/.env.production" 2>/dev/null; then
  echo "[!] BACKUP_ALERT_EMAIL is not set in .env.production; problems will only be written to backups/health.log."
fi

ENTRY="*/5 * * * * $SCRIPT_DIR/health-check.sh >> $PROJECT_ROOT/backups/health-cron.log 2>&1 $MARKER"
{ crontab -l 2>/dev/null | grep -v "$MARKER" || true; echo "$ENTRY"; } | crontab -

echo "[+] Installed health check cron job:"
crontab -l | grep "$MARKER"
