#!/usr/bin/env bash
# ==============================================================================
# ClinicOS / VetOS — Install the nightly backup and weekly restore-test cron jobs
# ==============================================================================
# Usage (on the EC2 host, from the repo root):
#   ./scripts/install-backup-cron.sh
# Safe to run again; it replaces its own entries and leaves other cron jobs alone.
#
#   Nightly 02:00 IST (20:30 UTC): backup-postgres.sh -> S3
#   Sunday  03:00 IST (21:30 UTC Saturday): restore-test.sh --from-s3
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MARKER="# vetos-backup"

chmod +x "$SCRIPT_DIR/backup-postgres.sh" "$SCRIPT_DIR/restore-test.sh"
mkdir -p "$PROJECT_ROOT/backups"

read_env() {
  grep -E "^$1=" "$PROJECT_ROOT/.env.production" 2>/dev/null | tail -n 1 | cut -d= -f2- || true
}
if [ -z "$(read_env S3_BACKUP_BUCKET)" ]; then
  echo "[!] S3_BACKUP_BUCKET is not set in .env.production; backups will stay on this server only."
fi
if [ -z "$(read_env BACKUP_ALERT_EMAIL)" ]; then
  echo "[!] BACKUP_ALERT_EMAIL is not set in .env.production; failures will only be written to backups/backup.log."
fi

NEW_ENTRIES="30 20 * * * $SCRIPT_DIR/backup-postgres.sh >> $PROJECT_ROOT/backups/cron.log 2>&1 $MARKER
30 21 * * 6 $SCRIPT_DIR/restore-test.sh --from-s3 >> $PROJECT_ROOT/backups/restore-test.log 2>&1 $MARKER"

{ crontab -l 2>/dev/null | grep -v "$MARKER" || true; echo "$NEW_ENTRIES"; } | crontab -

echo "[+] Installed backup cron jobs:"
crontab -l | grep "$MARKER"
