#!/usr/bin/env bash
# ==============================================================================
# ClinicOS / VetOS — Single-Instance Production MVP Deployment Script
# Target: Ubuntu 22.04 / 24.04 (AWS EC2, Lightsail, or any Linux VPS)
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo "    ClinicOS / VetOS — Production MVP Automated Deploy   "
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# 0. Sync with remote main (production servers must match GitHub)
if git rev-parse --is-inside-work-tree &>/dev/null; then
  echo "[+] Syncing git with origin/main..."
  git fetch origin main 2>/dev/null || true
  if git rev-parse origin/main &>/dev/null; then
    LOCAL_SHA="$(git rev-parse HEAD)"
    REMOTE_SHA="$(git rev-parse origin/main)"
    if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
      echo "[!] Local $LOCAL_SHA is behind origin/main $REMOTE_SHA — updating..."
      git pull --ff-only origin main || {
        echo "[-] git pull failed. Fix conflicts or run: git reset --hard origin/main"
        exit 1
      }
    fi
  fi
  export GIT_COMMIT="$(git rev-parse --short HEAD)"
  echo "[+] Deploying commit: $GIT_COMMIT — $(git log -1 --pretty=%s)"
else
  export GIT_COMMIT="unknown"
fi

# 1. Check for .env.production
if [ ! -f .env.production ]; then
  echo "[-] ERROR: .env.production file not found!"
  echo "    Please copy .env.production.example to .env.production and configure your domain and passwords:"
  echo "    cp .env.production.example .env.production && nano .env.production"
  exit 1
fi

echo "[+] Verified .env.production configuration."

# 2. Check Docker and Docker Compose
if ! command -v docker &> /dev/null; then
  echo "[-] Docker is not installed. Installing Docker..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  sudo usermod -aG docker "$USER"
  rm get-docker.sh
  echo "[+] Docker installed successfully."
fi

# 3. Build Backend API Artifact
echo "[+] Building backend API artifact (Spring Boot)..."
if command -v mvn &> /dev/null; then
  mvn clean package -DskipTests -f apps/api/pom.xml
else
  echo "[+] Local maven not found. Building inside Eclipse Temurin container..."
  docker run --rm \
    -v "$PROJECT_ROOT/apps/api":/workspace \
    -w /workspace \
    maven:3.9-eclipse-temurin-21 \
    mvn clean package -DskipTests
fi

if [ ! -f "$PROJECT_ROOT/apps/api/target/vetos-api-0.0.1-SNAPSHOT.jar" ] && ! ls "$PROJECT_ROOT/apps/api/target"/vetos-api-*.jar 1> /dev/null 2>&1; then
  echo "[-] ERROR: Failed to build API jar artifact!"
  exit 1
fi
echo "[+] Backend jar artifact built successfully."

# 4. Make DB init script and management scripts executable
chmod +x "$PROJECT_ROOT/docker/postgres/01-init-role.sh" || true
chmod +x "$PROJECT_ROOT"/scripts/*.sh || true

# 5. Launch / Rebuild Production Stack (no cache on web/api so UI always matches git)
echo "[+] Rebuilding web and api images (GIT_COMMIT=$GIT_COMMIT)..."
docker compose -f docker-compose.prod.yml --env-file .env.production build --no-cache --pull web api
echo "[+] Launching production containers via docker-compose.prod.yml..."
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate --remove-orphans web api
docker compose -f docker-compose.prod.yml --env-file .env.production up -d caddy postgres redis

echo "[+] Waiting for services to become healthy..."
sleep 10

# 6. Check Container Statuses
docker compose -f docker-compose.prod.yml ps

echo "=========================================================="
echo "   🎉 ClinicOS is successfully deployed and running!     "
echo "=========================================================="
echo "Next Steps:"
echo "1. Ensure your Domain DNS A Record points to this server's public IP."
echo "2. Caddy will automatically provision SSL certificates on first request."
echo "3. Visit: https://$(grep DOMAIN_NAME .env.production | cut -d '=' -f2)"
echo "4. View logs anytime with: docker compose -f docker-compose.prod.yml logs -f"
echo "=========================================================="
