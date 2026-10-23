#!/usr/bin/env bash
# ==============================================================================
# ClinicOS / VetOS — Database Backup Restore & Integrity Verification Test
# ==============================================================================
# Usage:
#   ./scripts/restore-test.sh                 # latest local backup
#   ./scripts/restore-test.sh --from-s3       # latest backup in S3_BACKUP_BUCKET
#   ./scripts/restore-test.sh path/to/backup.sql.gz
# Restores into an isolated, temporary PostgreSQL container; production is never touched.
# Installed weekly (with --from-s3) by ./scripts/install-backup-cron.sh. Failures alert
# BACKUP_ALERT_EMAIL like the nightly backup does.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

if [ -f "$PROJECT_ROOT/.env.production" ]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -v '^#' "$PROJECT_ROOT/.env.production" | grep -v '^$')
  set +a
fi
# shellcheck source=lib/backup-alert.sh
source "$SCRIPT_DIR/lib/backup-alert.sh"

TEST_CONTAINER="vetos-restore-verification-test"
TEST_DB="vetos"
TEST_USER="postgres"
DOWNLOADED=""

cleanup() {
  docker rm -f "$TEST_CONTAINER" > /dev/null 2>&1 || true
  if [ -n "$DOWNLOADED" ]; then rm -f "$DOWNLOADED"; fi
}
trap cleanup EXIT

fail() {
  echo "=========================================================="
  echo "  ❌ RESTORE TEST FAILED: $1"
  echo "=========================================================="
  send_backup_alert "VetOS restore test FAILED on $(hostname)" \
    "The backup restore test failed: $1

Backup tested: ${BACKUP_FILE:-none}
Time (UTC): $(date -u +"%Y-%m-%d %H:%M:%S")

A backup that cannot be restored is not a backup. Check the nightly backup log in backups/backup.log."
  exit 1
}

# 1. Determine backup file to test
BACKUP_FILE=""
if [ "${1:-}" = "--from-s3" ]; then
  [ -n "${S3_BACKUP_BUCKET:-}" ] || fail "S3_BACKUP_BUCKET is not set in .env.production."
  LATEST_KEY=$(aws_cli s3api list-objects-v2 --bucket "$S3_BACKUP_BUCKET" --prefix "postgres/" \
    --query 'sort_by(Contents, &LastModified)[-1].Key' --output text 2>/dev/null || true)
  if [ -z "$LATEST_KEY" ] || [ "$LATEST_KEY" = "None" ]; then
    fail "No backups found in s3://${S3_BACKUP_BUCKET}/postgres/."
  fi
  mkdir -p "$PROJECT_ROOT/backups/restore-test"
  DOWNLOADED="$PROJECT_ROOT/backups/restore-test/$(basename "$LATEST_KEY")"
  echo "[+] Downloading s3://${S3_BACKUP_BUCKET}/${LATEST_KEY}..."
  aws_cli s3 cp "s3://${S3_BACKUP_BUCKET}/${LATEST_KEY}" "$DOWNLOADED" --only-show-errors || fail "Could not download $LATEST_KEY from S3."
  BACKUP_FILE="$DOWNLOADED"
elif [ $# -ge 1 ]; then
  BACKUP_FILE="$1"
else
  BACKUP_FILE=$(find "$PROJECT_ROOT/backups/postgres" -type f -name "clinic-os-*.sql.gz" 2>/dev/null | sort -r | head -n 1 || true)
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  fail "No backup file found to test. Run ./scripts/backup-postgres.sh first."
fi
gzip -t "$BACKUP_FILE" 2>/dev/null || fail "Backup file is not a valid gzip archive."

echo "=========================================================="
echo "Starting Database Restore Test using: $BACKUP_FILE"
echo "=========================================================="

docker rm -f "$TEST_CONTAINER" > /dev/null 2>&1 || true

echo "[+] Spawning isolated temporary PostgreSQL 17 test container..."
docker run -d --name "$TEST_CONTAINER" \
  -e POSTGRES_DB="$TEST_DB" -e POSTGRES_USER="$TEST_USER" -e POSTGRES_PASSWORD="restore-test-only" \
  postgres:17-alpine > /dev/null

echo "[+] Waiting for test database readiness..."
for _ in $(seq 1 60); do
  if docker exec "$TEST_CONTAINER" pg_isready -U "$TEST_USER" -d "$TEST_DB" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$TEST_CONTAINER" pg_isready -U "$TEST_USER" -d "$TEST_DB" > /dev/null 2>&1 || fail "Test database did not start."

# The dump grants privileges to the app role, so create it first (as production's init script does).
docker exec "$TEST_CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" -q -c \
  "CREATE ROLE ${APP_DB_USER:-vetos_app} LOGIN PASSWORD 'restore-test-only' NOSUPERUSER NOBYPASSRLS;" > /dev/null

echo "[+] Restoring backup into isolated database..."
RESTORE_LOG="$(mktemp)"
gunzip -c "$BACKUP_FILE" | docker exec -i "$TEST_CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" -q -v ON_ERROR_STOP=0 > /dev/null 2> "$RESTORE_LOG" || true
RESTORE_ERRORS=$(grep -c "ERROR" "$RESTORE_LOG" || true)
echo "  -> Restore errors: $RESTORE_ERRORS"
if [ "$RESTORE_ERRORS" -gt 0 ]; then
  head -n 10 "$RESTORE_LOG"
fi
rm -f "$RESTORE_LOG"

q() {
  docker exec "$TEST_CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" -t -A -c "$1" 2>/dev/null || echo "0"
}

echo "[+] Executing verification checks on restored database..."
TABLES_COUNT=$(q "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
CLINIC_COUNT=$(q "SELECT count(*) FROM clinics;")
PATIENT_COUNT=$(q "SELECT count(*) FROM patients;")
INVOICE_COUNT=$(q "SELECT count(*) FROM invoices;")
PAYMENT_COUNT=$(q "SELECT count(*) FROM payments;")
RLS_ACTIVE_COUNT=$(q "SELECT count(*) FROM pg_class WHERE relrowsecurity = true AND relname IN ('patients', 'clients', 'invoices', 'appointments');")
MIGRATIONS_COUNT=$(q "SELECT count(*) FROM flyway_schema_history WHERE success = true;")

echo "  -> Public tables:        $TABLES_COUNT"
echo "  -> Clinics:              $CLINIC_COUNT"
echo "  -> Patients:             $PATIENT_COUNT"
echo "  -> Invoices:             $INVOICE_COUNT"
echo "  -> Payments:             $PAYMENT_COUNT"
echo "  -> RLS core tables:      $RLS_ACTIVE_COUNT / 4"
echo "  -> Flyway migrations:    $MIGRATIONS_COUNT"

[ "$RESTORE_ERRORS" -eq 0 ] || fail "$RESTORE_ERRORS SQL errors while restoring."
[ "$TABLES_COUNT" -gt 15 ] || fail "Only $TABLES_COUNT tables restored."
[ "$CLINIC_COUNT" -gt 0 ] || fail "No clinics in the restored database."
[ "$RLS_ACTIVE_COUNT" -ge 4 ] || fail "Row-level security missing on core tables."
[ "$MIGRATIONS_COUNT" -gt 0 ] || fail "Flyway history missing."

echo "=========================================================="
echo "  ✅ RESTORE TEST PASSED: Database fully verified & intact!"
echo "=========================================================="
date -u +"%Y-%m-%dT%H:%M:%SZ $(basename "$BACKUP_FILE") clinics=$CLINIC_COUNT patients=$PATIENT_COUNT invoices=$INVOICE_COUNT" \
  > "$PROJECT_ROOT/backups/last-restore-test" 2>/dev/null || true
exit 0
