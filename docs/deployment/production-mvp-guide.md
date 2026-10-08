# ClinicOS / VetOS — Single-Instance Production MVP Deployment Guide

This guide walks through deploying ClinicOS / VetOS to a single cloud virtual machine (AWS Lightsail, AWS EC2, or any Linux VPS) using **Docker Compose** and **Caddy** for automatic HTTPS.

---

## 1. Cloud Instance Sizing

### Recommended Options:
- **AWS Lightsail (Recommended for simplicity & cost):**
  - OS: **Ubuntu 24.04 LTS** or **22.04 LTS**
  - Plan: **$20/month** (2 vCPU, 4 GB RAM, 80 GB SSD) or **$40/month** (2 vCPU, 8 GB RAM, 160 GB SSD)
  - Region: **ap-south-1 (Mumbai)** or your target clinic market.
- **AWS EC2:**
  - Instance Type: **t4g.large** (2 vCPU Graviton, 8 GB RAM) or **t3.large** (2 vCPU Intel/AMD, 8 GB RAM).
  - Storage: **40 GB GP3 EBS volume**.

### Firewall / Security Group Rules:
Open only these 3 ports in your cloud firewall:

| Port | Protocol | Source | Purpose |
| :--- | :---: | :---: | :--- |
| **22** | TCP | Your IP (or `0.0.0.0/0`) | SSH Administration |
| **80** | TCP | `0.0.0.0/0` | HTTP (Caddy redirects to HTTPS & ACME challenge) |
| **443** | TCP | `0.0.0.0/0` | HTTPS (Encrypted clinic traffic) |

> [!IMPORTANT]
> Do NOT open port 5432 (Postgres), 6379 (Redis), 8080 (API), or 3000 (Web). In `docker-compose.prod.yml`, these ports are isolated on Docker's private bridge network. Only Caddy faces the internet.

---

## 2. Domain & DNS Configuration

1. Choose your domain or subdomain (e.g., `clinic.yourdomain.com`).
2. In your DNS registrar (GoDaddy, Cloudflare, Namecheap, Route53), add an **A Record**:
   - **Type:** `A`
   - **Name:** `clinic` (or `@` for apex domain)
   - **Value:** `<Your-Server-Public-IP>`
   - **TTL:** `300` (5 minutes)

---

## 3. Server Deployment (3 Simple Steps)

### Step 1: Connect to Server & Clone Repo
```bash
ssh ubuntu@<your-server-ip>

# Clone repository
git clone https://github.com/Prithvee905/VetOS-petwellclinic.git VetOS
cd VetOS
```

### Step 2: Configure Production Environment
```bash
cp .env.production.example .env.production
nano .env.production
```
Update the following values in `.env.production`:
1. `DOMAIN_NAME`: Set to your domain (e.g. `clinic.yourdomain.com`).
2. `POSTGRES_PASSWORD`: Generate random string (`openssl rand -hex 16`).
3. `APP_DB_PASSWORD`: Generate random string (`openssl rand -hex 16`).
4. `VETOS_JWT_SECRET`: Generate random 64-character secret (`openssl rand -hex 32`).
5. `NEXT_PUBLIC_API_URL`: `https://<your-domain>/api/v1`.

### Step 3: Run Automated Deployment Script
```bash
chmod +x scripts/deploy.sh scripts/backup-db.sh
./scripts/deploy.sh
```

The script will:
- Install Docker if not already present.
- Build the Spring Boot API jar inside a Maven container.
- Launch Postgres 17, Redis 7, Spring Boot API, Next.js Web, and Caddy.
- Automatically provision Let's Encrypt SSL.

Once completed, open `https://<your-domain>` in your browser.

---

## 4. Maintenance & Operations

### View Live Logs:
```bash
# View all container logs
docker compose -f docker-compose.prod.yml logs -f

# View only API logs
docker compose -f docker-compose.prod.yml logs -f api

# View only Caddy access / SSL logs
docker compose -f docker-compose.prod.yml logs -f caddy
```

### Restart Services:
```bash
docker compose -f docker-compose.prod.yml restart
```

### Update to New Code Version:
```bash
git pull origin main
./scripts/deploy.sh
```

### Automated Nightly Database Backups:
Add a cron job to run `scripts/backup-db.sh` every night at 2:00 AM:
```bash
crontab -e
```
Add line:
```cron
0 2 * * * /home/ubuntu/VetOS/scripts/backup-db.sh >> /home/ubuntu/VetOS/backups/backup.log 2>&1
```

### Restore Database from Backup:
```bash
gunzip < backups/vetos_backup_20261008_XXXXXX.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d vetos
```
