#!/usr/bin/env bash
# Quick checks on the server: git commit vs HTML served to users.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "=== Git on disk ==="
git log -1 --oneline 2>/dev/null || echo "(not a git repo)"

echo ""
echo "=== Docker web container ==="
docker compose -f docker-compose.prod.yml ps web 2>/dev/null || true

echo ""
echo "=== Strings in running web image (should NOT contain dev login hints) ==="
WEB_CID="$(docker compose -f docker-compose.prod.yml ps -q web 2>/dev/null || true)"
if [ -n "$WEB_CID" ]; then
  if docker exec "$WEB_CID" sh -c "grep -r 'owner@clinic.test' /app 2>/dev/null | head -1"; then
    echo "FOUND old dev login text in container — rebuild with ./scripts/deploy.sh"
  else
    echo "OK: no owner@clinic.test in /app"
  fi
  if docker exec "$WEB_CID" sh -c "grep -r 'docker compose up' /app 2>/dev/null | head -1"; then
    echo "FOUND docker compose hint in container — rebuild needed"
  else
    echo "OK: no docker compose hint in /app"
  fi
else
  echo "web container not running"
fi

DOMAIN="$(grep -E '^DOMAIN_NAME=' .env.production 2>/dev/null | cut -d= -f2- || echo app.vetosclinic.com)"
echo ""
echo "=== Live site login HTML (first 2KB) ==="
curl -fsSL "https://${DOMAIN}/" 2>/dev/null | head -c 2000 || curl -fsSL "http://localhost/" | head -c 2000 || echo "Could not fetch homepage"

echo ""
echo "Done. Login page should show 'Build <git-sha>' after latest deploy."
