#!/usr/bin/env bash
# ==============================================================================
# ClinicOS / VetOS — Production PostgreSQL Backup & S3 Archive Script
# ==============================================================================
# Usage:
#   ./scripts/backup-postgres.sh
# Installed nightly by ./scripts/install-backup-cron.sh.
#
# Every failure emails BACKUP_ALERT_EMAIL and pings BACKUP_HEALTHCHECK_URL/fail,
# so a broken backup never goes unnoticed.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

LOG_FILE="$PROJECT_ROOT/backups/backup.log"
mkdir -p "$PROJECT_ROOT/backups"

log() {
  local msg="[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $1"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
}

log "=========================================================="
log "Starting PostgreSQL backup procedure..."

# 1. Load production environment
if [ -f "$PROJECT_ROOT/.env.production" ]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -v '^#' "$PROJECT_ROOT/.env.production" | grep -v '^$')
  set +a
else
  log "[-] ERROR: .env.production file not found!"
  exit 1
fi

# shellcheck source=lib/backup-alert.sh
source "$SCRIPT_DIR/lib/backup-alert.sh"

fail() {
  local code="$1"
  local reason="$2"
  log "[-] CRITICAL: $reason"
  send_backup_alert "VetOS backup FAILED on $(hostname)" \
    "The nightly database backup failed: $reason

Time (UTC): $(date -u +"%Y-%m-%d %H:%M:%S")
Server: $(hostname)
Log: $LOG_FILE

Last 20 log lines:
$(tail -n 20 "$LOG_FILE" 2>/dev/null)"
  exit "$code"
}

# Anything unexpected (set -e) still raises an alert.
trap 'fail 99 "unexpected error on line $LINENO"' ERR

healthcheck_ping "/start"

DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-vetos}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
S3_BUCKET="${S3_BACKUP_BUCKET:-}"

DATE_YEAR="$(date -u +"%Y")"
DATE_MONTH="$(date -u +"%m")"
DATE_DAY="$(date -u +"%d")"
TIMESTAMP="$(date -u +"%Y-%m-%d-%H%M%S")"

LOCAL_DIR="$PROJECT_ROOT/backups/postgres/$DATE_YEAR/$DATE_MONTH/$DATE_DAY"
mkdir -p "$LOCAL_DIR"

BACKUP_FILENAME="clinic-os-${TIMESTAMP}.sql.gz"
LOCAL_FILEPATH="$LOCAL_DIR/$BACKUP_FILENAME"

# Detect if sudo is required for docker
if [ "$EUID" -ne 0 ] && ! docker ps > /dev/null 2>&1; then
  COMPOSE_CMD="sudo docker compose -f docker-compose.prod.yml --env-file $PROJECT_ROOT/.env.production"
else
  COMPOSE_CMD="docker compose -f docker-compose.prod.yml --env-file $PROJECT_ROOT/.env.production"
fi

# 2. Check PostgreSQL Readiness
log "[+] Verifying PostgreSQL connectivity in container..."
if ! $COMPOSE_CMD exec -T postgres pg_isready -U "$DB_USER" -d "$DB_NAME"; then
  fail 2 "PostgreSQL is not accepting connections."
fi

# 3. Create Compressed pg_dump Backup
log "[+] Dumping database '$DB_NAME' to $LOCAL_FILEPATH..."
if ! $COMPOSE_CMD exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip -9 > "$LOCAL_FILEPATH"; then
  rm -f "$LOCAL_FILEPATH"
  fail 3 "pg_dump failed during execution."
fi

# 4. Verify Backup Integrity
log "[+] Verifying gzip archive integrity..."
if ! gzip -t "$LOCAL_FILEPATH" 2>/dev/null; then
  rm -f "$LOCAL_FILEPATH"
  fail 4 "Backup file is corrupted or incomplete."
fi
# A real dump always ends with this marker; a truncated one does not.
DUMP_TAIL="$(gunzip -c "$LOCAL_FILEPATH" | tail -n 5)"
if ! grep -q "PostgreSQL database dump complete" <<< "$DUMP_TAIL"; then
  fail 4 "Backup file is missing the end-of-dump marker (truncated dump)."
fi

FILE_SIZE=$(du -h "$LOCAL_FILEPATH" | cut -f1)
LOCAL_BYTES=$(wc -c < "$LOCAL_FILEPATH" | tr -d ' ')
log "[+] Backup successfully created ($FILE_SIZE)."

# 5. Offsite S3 Upload
if [ -n "$S3_BUCKET" ]; then
  S3_KEY="postgres/${DATE_YEAR}/${DATE_MONTH}/${DATE_DAY}/${BACKUP_FILENAME}"
  log "[+] Uploading backup to s3://${S3_BUCKET}/${S3_KEY} (AES256 server-side encryption)..."
  if ! aws_cli s3 cp "$LOCAL_FILEPATH" "s3://${S3_BUCKET}/${S3_KEY}" --sse AES256 --only-show-errors >> "$LOG_FILE" 2>&1; then
    fail 5 "S3 upload failed. Check the EC2 instance role (s3:PutObject on ${S3_BUCKET}) and network access."
  fi
  REMOTE_BYTES=$(aws_cli s3api head-object --bucket "$S3_BUCKET" --key "$S3_KEY" --query ContentLength --output text 2>> "$LOG_FILE" || echo "0")
  if [ "$REMOTE_BYTES" != "$LOCAL_BYTES" ]; then
    fail 6 "S3 copy size ($REMOTE_BYTES bytes) does not match the local backup ($LOCAL_BYTES bytes)."
  fi
  log "[+] S3 upload verified ($REMOTE_BYTES bytes)."
else
  log "[!] S3_BACKUP_BUCKET not set. Retaining backup on local EBS storage only."
fi

# 6. Retention Rotation (Purge local files older than RETENTION_DAYS; S3 retention is a bucket lifecycle rule)
log "[+] Rotating local backups older than $RETENTION_DAYS days..."
find "$PROJECT_ROOT/backups/postgres" -type f -name "clinic-os-*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
find "$PROJECT_ROOT/backups/postgres" -type d -empty -delete || true

date -u +"%Y-%m-%dT%H:%M:%SZ $BACKUP_FILENAME $LOCAL_BYTES" > "$PROJECT_ROOT/backups/last-success"
healthcheck_ping ""

log "[+] Backup procedure completed successfully."
log "=========================================================="
exit 0
