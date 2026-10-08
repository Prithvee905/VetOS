#!/usr/bin/env bash
# ==============================================================================
# ClinicOS / VetOS — Database Automated Backup Script
# Can be run manually or configured via crontab:
# 0 2 * * * /path/to/VetOS/scripts/backup-db.sh > /dev/null 2>&1
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_ROOT/backups"
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
BACKUP_FILE="$BACKUP_DIR/vetos_backup_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[+] Starting PostgreSQL backup for ClinicOS..."

if [ -f "$PROJECT_ROOT/.env.production" ]; then
  # Load env vars safely
  export $(grep -v '^#' "$PROJECT_ROOT/.env.production" | xargs)
fi

DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-vetos}"

docker compose -f "$PROJECT_ROOT/docker-compose.prod.yml" exec -T postgres \
  pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip > "$BACKUP_FILE"

echo "[+] Database backup created successfully: $BACKUP_FILE"
echo "[+] Size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Keep last 14 daily backups, delete older
find "$BACKUP_DIR" -type f -name "vetos_backup_*.sql.gz" -mtime +14 -delete
echo "[+] Old backups rotated (retaining 14 days)."
