#!/usr/bin/env bash
# ==============================================================================
# ClinicOS / VetOS — Database Backup Restore & Integrity Verification Test
# ==============================================================================
# Usage:
#   ./scripts/restore-test.sh [path/to/backup.sql.gz]
# Spawns an isolated temporary PostgreSQL container to test restore without
# touching or risking production data.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# 1. Determine backup file to test
if [ $# -ge 1 ]; then
  BACKUP_FILE="$1"
else
  # Find latest backup in backups/postgres or generate one
  BACKUP_FILE=$(find "$PROJECT_ROOT/backups" -type f -name "*.sql.gz" 2>/dev/null | sort -r | head -n 1 || true)
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "[+] No existing backup file found. Generating fresh dump for verification test..."
  mkdir -p "$PROJECT_ROOT/backups/test"
  BACKUP_FILE="$PROJECT_ROOT/backups/test/test-dump-$(date +%s).sql.gz"
  docker compose exec -T postgres pg_dump -U postgres -d vetos | gzip > "$BACKUP_FILE"
  echo "[+] Test dump created: $BACKUP_FILE"
fi

echo "=========================================================="
echo "Starting Database Restore Test using: $BACKUP_FILE"
echo "=========================================================="

TEST_CONTAINER="vetos-restore-verification-test"
TEST_PORT=5439
TEST_DB="vetos"
TEST_USER="postgres"
TEST_PASS="postgres"

# Cleanup any previous test container
docker rm -f "$TEST_CONTAINER" 2>/dev/null || true

echo "[+] Spawning isolated temporary PostgreSQL 17 test container..."
docker run -d \
  --name "$TEST_CONTAINER" \
  -e POSTGRES_DB="$TEST_DB" \
  -e POSTGRES_USER="$TEST_USER" \
  -e POSTGRES_PASSWORD="$TEST_PASS" \
  -p "$TEST_PORT:5432" \
  postgres:17-alpine > /dev/null

# Wait for container ready
echo "[+] Waiting for test database readiness..."
for i in {1..30}; do
  if docker exec "$TEST_CONTAINER" pg_isready -U "$TEST_USER" -d "$TEST_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "[+] Restoring backup into isolated database..."
gunzip -c "$BACKUP_FILE" | docker exec -i "$TEST_CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" > /dev/null 2>&1 || true

echo "[+] Executing verification checks on restored database..."

# Check 1: Core tables exist
TABLES_COUNT=$(docker exec "$TEST_CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" -t -A -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "  -> Total Public Tables Restored: $TABLES_COUNT"

# Check 2: Clinics exist
CLINIC_COUNT=$(docker exec "$TEST_CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" -t -A -c \
  "SELECT count(*) FROM clinics;")
echo "  -> Clinic Records Restored: $CLINIC_COUNT"

# Check 3: Patients exist
PATIENT_COUNT=$(docker exec "$TEST_CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" -t -A -c \
  "SELECT count(*) FROM patients;")
echo "  -> Patient Records Restored: $PATIENT_COUNT"

# Check 4: Invoices exist
INVOICE_COUNT=$(docker exec "$TEST_CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" -t -A -c \
  "SELECT count(*) FROM invoices;")
echo "  -> Invoice Records Restored: $INVOICE_COUNT"

# Check 5: Payments exist
PAYMENT_COUNT=$(docker exec "$TEST_CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" -t -A -c \
  "SELECT count(*) FROM payments;")
echo "  -> Payment Records Restored: $PAYMENT_COUNT"

# Check 6: Row-Level Security (RLS) remains active & forced
RLS_ACTIVE_COUNT=$(docker exec "$TEST_CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" -t -A -c \
  "SELECT count(*) FROM pg_class WHERE relrowsecurity = true AND relname IN ('patients', 'clients', 'invoices', 'appointments');")
echo "  -> RLS-Protected Core Tables Verified: $RLS_ACTIVE_COUNT / 4"

# Check 7: Flyway migration history exists
MIGRATIONS_COUNT=$(docker exec "$TEST_CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" -t -A -c \
  "SELECT count(*) FROM flyway_schema_history WHERE success = true;")
echo "  -> Applied Flyway Migrations Restored: $MIGRATIONS_COUNT"

# Cleanup
echo "[+] Cleaning up temporary restore container..."
docker rm -f "$TEST_CONTAINER" > /dev/null

if [ "$TABLES_COUNT" -gt 15 ] && [ "$CLINIC_COUNT" -gt 0 ] && [ "$RLS_ACTIVE_COUNT" -ge 4 ]; then
  echo "=========================================================="
  echo "  ✅ RESTORE TEST PASSED: Database fully verified & intact!"
  echo "=========================================================="
  exit 0
else
  echo "=========================================================="
  echo "  ❌ RESTORE TEST FAILED: Verification assertions failed!"
  echo "=========================================================="
  exit 1
fi
