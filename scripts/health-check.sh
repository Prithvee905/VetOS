#!/usr/bin/env bash
# ==============================================================================
# ClinicOS / VetOS — Server health check (disk, memory, containers, site, backups)
# ==============================================================================
# Usage:
#   ./scripts/health-check.sh
# Installed every 5 minutes by ./scripts/install-health-cron.sh.
#
# Emails BACKUP_ALERT_EMAIL when something is wrong, again every 6 hours while it
# stays wrong, and once more when it is fixed. Silent when everything is fine.
# ==============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

DISK_MAX_PERCENT="${HEALTH_DISK_MAX_PERCENT:-80}"
MEM_MIN_MB="${HEALTH_MEM_MIN_MB:-100}"
BACKUP_MAX_AGE_HOURS="${HEALTH_BACKUP_MAX_AGE_HOURS:-30}"
REPEAT_SECONDS=$((6 * 3600))
STATE_DIR="$PROJECT_ROOT/backups"
STATE_FILE="$STATE_DIR/health-state"
LOG_FILE="$STATE_DIR/health.log"
mkdir -p "$STATE_DIR"

if [ -f "$PROJECT_ROOT/.env.production" ]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -v '^#' "$PROJECT_ROOT/.env.production" | grep -v '^$')
  set +a
fi
# shellcheck source=lib/backup-alert.sh
source "$SCRIPT_DIR/lib/backup-alert.sh"

problems=()

# 1. Disk
used=$(df --output=pcent / | tail -n 1 | tr -dc '0-9')
if [ -n "$used" ] && [ "$used" -ge "$DISK_MAX_PERCENT" ]; then
  problems+=("Disk is ${used}% full (limit ${DISK_MAX_PERCENT}%).")
fi

# 2. Memory (what is really available, not just "free")
avail=$(awk '/MemAvailable/ { printf "%d", $2 / 1024 }' /proc/meminfo)
if [ -n "$avail" ] && [ "$avail" -lt "$MEM_MIN_MB" ]; then
  problems+=("Only ${avail} MB of memory is available (limit ${MEM_MIN_MB} MB).")
fi

# 3. Containers: each must be running and not unhealthy
for service in postgres redis api web caddy; do
  if [ -z "$(docker ps -q --filter "label=com.docker.compose.service=$service" --filter status=running 2>/dev/null)" ]; then
    problems+=("The '$service' container is not running.")
  elif [ -n "$(docker ps -q --filter "label=com.docker.compose.service=$service" --filter health=unhealthy 2>/dev/null)" ]; then
    problems+=("The '$service' container is unhealthy.")
  fi
done

# 4. The public site answers
site="${HEALTH_SITE_URL:-${VETOS_PUBLIC_BASE_URL:-}}"
if [ -n "$site" ]; then
  code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$site" 2>/dev/null || true)
  case "$code" in
    2*|3*) ;;
    *) problems+=("$site did not answer properly (HTTP ${code:-none}).") ;;
  esac
fi

# 5. A recent backup exists (the backup script's own alert covers failures; this covers it never running)
newest=$(find "$PROJECT_ROOT/backups/postgres" -type f -name 'clinic-os-*.sql.gz' -printf '%T@\n' 2>/dev/null | sort -n | tail -n 1)
if [ -z "$newest" ]; then
  problems+=("No local database backup was found.")
else
  age_hours=$(( ($(date +%s) - ${newest%.*}) / 3600 ))
  if [ "$age_hours" -ge "$BACKUP_MAX_AGE_HOURS" ]; then
    problems+=("The newest local backup is ${age_hours} hours old (limit ${BACKUP_MAX_AGE_HOURS}).")
  fi
fi

now=$(date +%s)
summary=$(printf '%s\n' "${problems[@]+"${problems[@]}"}")
prev_summary=""
prev_sent=0
if [ -f "$STATE_FILE" ]; then
  prev_sent=$(head -n 1 "$STATE_FILE")
  prev_summary=$(tail -n +2 "$STATE_FILE")
fi

alert() {
  # Not a backup problem, so don't flip the backup dead-man's-switch.
  BACKUP_HEALTHCHECK_URL="" send_backup_alert "$1" "$2

Server: $(hostname)
Time (UTC): $(date -u +"%Y-%m-%d %H:%M:%S")"
}

if [ "${#problems[@]}" -eq 0 ]; then
  if [ -n "$prev_summary" ]; then
    echo "[$(date -u +%FT%TZ)] recovered" >> "$LOG_FILE"
    alert "VetOS server is healthy again" "Everything checks out now. Earlier problems:
$prev_summary"
    rm -f "$STATE_FILE"
  fi
  exit 0
fi

echo "[$(date -u +%FT%TZ)] $(printf '%s; ' "${problems[@]}")" >> "$LOG_FILE"
if [ "$summary" != "$prev_summary" ] || [ $((now - prev_sent)) -ge "$REPEAT_SECONDS" ]; then
  alert "VetOS server needs attention" "$summary"
  printf '%s\n%s\n' "$now" "$summary" > "$STATE_FILE"
fi
exit 1
