# ClinicOS / VetOS — Production Deployment Guide
## Single-Instance AWS EC2 Architecture (Pilot Phase: 1–10 Clinics)

---

## 1. Production Architecture Overview

ClinicOS is deployed as a hardened, containerized **Production Modular Monolith** on a single cloud virtual machine. The design intentionally avoids early Kubernetes/ECS/RDS complexity, while maintaining strict container and network boundaries that make future migration to managed AWS services seamless.

```text
                                  INTERNET
                                     │
                          HTTPS (443) / HTTP (80)
                                     ▼
                    ┌─────────────────────────────────┐
                    │       AWS EC2 Virtual Machine   │
                    │       Ubuntu 24.04 LTS          │
                    │       2 vCPU / 8 GB RAM         │
                    │    (t4g.large* or t3.large)     │
                    └────────────────┬────────────────┘
                                     │
                             Caddy Reverse Proxy
                         (Auto TLS / Let's Encrypt)
                                     │
        ┌────────────────────────────┴────────────────────────────┐
        │                                                         │
   Route: /*                                            Route: /api/*, /actuator/health
        ▼                                                         ▼
┌───────────────┐                                         ┌───────────────┐
│ Next.js Web   │                                         │ Spring Boot   │
│ Port 3000     │                                         │ Port 8080     │
└───────────────┘                                         └───────┬───────┘
                                                                  │
                                            ┌─────────────────────┴─────────────────────┐
                                            ▼                                           ▼
                                 ┌─────────────────────┐                     ┌─────────────────────┐
                                 │ PostgreSQL 17       │                     │ Redis 7             │
                                 │ Forced Tenant RLS   │                     │ Queue & Sessions    │
                                 │ Port 5432 (Internal)│                     │ Port 6379 (Internal)│
                                 └──────────┬──────────┘                     └─────────────────────┘
                                            │
                                            ▼
                                 ┌─────────────────────┐
                                 │ Encrypted EBS Volume│
                                 │ (postgres_data)     │
                                 └──────────┬──────────┘
                                            │
                                  Nightly Automated Dump
                                            │
                                            ▼
                                 ┌─────────────────────┐
                                 │ Offsite S3 Bucket   │
                                 │ (AES256 Encrypted)  │
                                 └─────────────────────┘
```

> `*` **CPU Architecture:** `t4g.large` (AWS Graviton ARM64) is supported across all container base images (Eclipse Temurin 21, Node 22 Alpine, PostgreSQL 17 Alpine, Redis 7 Alpine, and Caddy 2). If deploying on Intel/AMD hardware, use `t3.large`.

---

## 2. Infrastructure Sizing & Specifications

| Component | Specification | Rationale |
|---|---|---|
| **Instance Type** | `t4g.large` (ARM64) or `t3.large` (x86_64) | 2 vCPU, 8 GB RAM handles Next.js SSR, Spring Boot JVM (2GB heap), Postgres buffer cache, and Redis with ample headroom |
| **Operating System** | Ubuntu 24.04 LTS (Noble Numbat) | Modern kernel, long-term security maintenance, native Docker 27+ |
| **Storage (Root/Data)** | 40 GB GP3 EBS Volume (Encrypted) | 3000 IOPS, 125 MB/s baseline throughput; supports OS, container images, and 2+ years of clinic database growth |
| **Firewall (Security Group)**| Inbound: `80`, `443` (Public); `22` (Admin IP only) | All backend and database ports (`3000`, `8080`, `5432`, `6379`) are strictly bound to Docker internal network |

---

## 3. Step-by-Step Provisioning Procedure

### Step 1: Launch EC2 Instance & Configure Security Group
1. In the AWS Management Console (`ap-south-1` or your clinic region), launch an EC2 instance:
   - **AMI:** Ubuntu Server 24.04 LTS.
   - **Instance Type:** `t4g.large` (or `t3.large`).
   - **Storage:** 40 GB GP3, check **Encrypt this volume** (using default AWS KMS `aws/ebs` key).
2. Configure the Security Group:
   - **HTTP (80):** `0.0.0.0/0`
   - **HTTPS (443):** `0.0.0.0/0`
   - **SSH (22):** `<YOUR_ADMIN_IP>/32` (Never leave `0.0.0.0/0`)

### Step 2: Configure Public DNS A Record
In your domain registrar (Route 53, Cloudflare, GoDaddy):
- Create an **A Record** pointing your domain (e.g. `clinic.petwell.com`) to the EC2 Public IPv4 address.
- TTL: `300` seconds.

### Step 3: Server Access & Repository Setup
SSH into your instance:
```bash
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>

# Clone repository
git clone https://github.com/Prithvee905/VetOS-petwellclinic.git VetOS
cd VetOS
```

### Step 4: Configure Production Environment Variables
Create `.env.production` from the template:
```bash
cp .env.production.example .env.production
nano .env.production
```

Configure the following production parameters:
```env
APP_DOMAIN=clinic.petwell.com
DOMAIN_NAME=clinic.petwell.com

POSTGRES_DB=vetos
POSTGRES_USER=postgres
POSTGRES_PASSWORD=generate_with_openssl_rand_hex_16
APP_DB_USER=vetos_app
APP_DB_PASSWORD=generate_with_openssl_rand_hex_16

SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/vetos
SPRING_DATASOURCE_USERNAME=vetos_app
SPRING_DATASOURCE_PASSWORD=same_as_APP_DB_PASSWORD
SPRING_FLYWAY_URL=jdbc:postgresql://postgres:5432/vetos
SPRING_FLYWAY_USER=postgres
SPRING_FLYWAY_PASSWORD=same_as_POSTGRES_PASSWORD

VETOS_JWT_SECRET=generate_with_openssl_rand_hex_32
VETOS_CORS_ALLOWED_ORIGIN=https://clinic.petwell.com
NEXT_PUBLIC_API_URL=https://clinic.petwell.com/api/v1
API_ORIGIN=http://api:8080

# S3 Automated Backup Bucket (Optional offsite backup)
S3_BACKUP_BUCKET=vetos-clinic-backups-ap-south-1
```

### Step 5: Execute Automated Deployment
```bash
chmod +x scripts/deploy.sh scripts/backup-postgres.sh scripts/restore-test.sh
./scripts/deploy.sh
```

The script will:
1. Verify system prerequisites and install Docker if required.
2. Build the Spring Boot production jar inside a containerized build environment.
3. Launch all 5 containers in proper dependency order.
4. Apply Flyway migrations `V1`–`V5`.
5. Caddy will negotiate a free TLS certificate with Let's Encrypt / ZeroSSL.
6. Display container health statuses.

---

## 4. Verification & Health Monitoring

To verify service health from the host:
```bash
# Check Docker container health
docker compose -f docker-compose.prod.yml ps

# Check Spring Boot Actuator Health (via Caddy)
curl -k https://localhost/actuator/health

# Verify external access to sensitive endpoints is forbidden (HTTP 403)
curl -k -I https://localhost/actuator/env
```

Expected output for `/actuator/health`:
```json
{"status":"UP"}
```
Expected output for `/actuator/env`:
```
HTTP/2 403
Access Denied: Sensitive actuator endpoints are private.
```
