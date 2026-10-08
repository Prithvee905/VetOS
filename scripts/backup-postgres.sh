#!/usr/bin/env bash
# ==============================================================================
# ClinicOS / VetOS — Production PostgreSQL Backup & S3 Archive Script
# ==============================================================================
# Usage:
#   ./scripts/backup-postgres.sh
# Scheduled via crontab on EC2:
#   0 2 * * * /home/ubuntu/VetOS/scripts/backup-postgres.sh >> /home/ubuntu/VetOS/backups/backup.log 2>&1
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
  # Export non-comment lines
  set -a
  source <(grep -v '^#' "$PROJECT_ROOT/.env.production" | grep -v '^$')
  set +a
else
  log "[-] ERROR: .env.production file not found!"
  exit 1
fi

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

# 2. Check PostgreSQL Readiness
log "[+] Verifying PostgreSQL connectivity in container..."
if ! docker compose -f docker-compose.prod.yml exec -T postgres pg_isready -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; then
  log "[-] CRITICAL: PostgreSQL is not accepting connections!"
  exit 2
fi

# 3. Create Compressed pg_dump Backup
log "[+] Dumping database '$DB_NAME' to $LOCAL_FILEPATH..."
if ! docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip -9 > "$LOCAL_FILEPATH"; then
  log "[-] CRITICAL: pg_dump failed during execution!"
  rm -f "$LOCAL_FILEPATH"
  exit 3
fi

# 4. Verify Backup Integrity
log "[+] Verifying gzip archive integrity..."
if ! gzip -t "$LOCAL_FILEPATH" 2>/dev/null; then
  log "[-] CRITICAL: Backup file is corrupted or incomplete!"
  rm -f "$LOCAL_FILEPATH"
  exit 4
fi

FILE_SIZE=$(du -h "$LOCAL_FILEPATH" | cut -f1)
log "[+] Backup successfully created ($FILE_SIZE)."

# 5. Offsite S3 Upload (If S3_BACKUP_BUCKET configured)
if [ -n "$S3_BUCKET" ]; then
  S3_PATH="s3://${S3_BUCKET}/postgres/${DATE_YEAR}/${DATE_MONTH}/${DATE_DAY}/${BACKUP_FILENAME}"
  log "[+] Uploading backup to S3: $S3_PATH with AES256 server-side encryption..."

  if command -v aws &> /dev/null; then
    if aws s3 cp "$LOCAL_FILEPATH" "$S3_PATH" --sse AES256 >> "$LOG_FILE" 2>&1; then
      log "[+] S3 upload verified successfully."
    else
      log "[-] WARNING: S3 upload failed! (Check IAM role or network access)"
      exit 5
    fi
  else
    log "[-] WARNING: AWS CLI not found. Retaining local backup only."
  fi
else
  log "[!] S3_BACKUP_BUCKET not set. Retaining backup on local EBS storage only."
fi

# 6. Retention Rotation (Purge local files older than RETENTION_DAYS)
log "[+] Rotating local backups older than $RETENTION_DAYS days..."
find "$PROJECT_ROOT/backups/postgres" -type f -name "clinic-os-*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
# Clean empty directories
find "$PROJECT_ROOT/backups/postgres" -type d -empty -delete || true

log "[+] Backup procedure completed successfully."
log "=========================================================="
exit 0
