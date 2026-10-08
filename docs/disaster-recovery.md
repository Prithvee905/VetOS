# ClinicOS / VetOS — Disaster Recovery Runbook

---

## 1. Objectives & Metrics

- **RTO (Recovery Time Objective):** `< 30 minutes` (Time to provision new EC2 VM and restore full clinic operations).
- **RPO (Recovery Point Objective):** `< 24 hours` (Maximum acceptable data age using daily S3 backups; reduced to `< 1 hour` if automated AWS EBS snapshots are enabled).

---

## 2. Disaster Scenarios & Recovery Strategy

| Scenario | Impact | Recovery Path |
|---|---|---|
| **Container Crash / Panic** | Single service unavailable | Handled automatically by Docker `restart: unless-stopped`. |
| **Corrupted Database Container** | Postgres offline or corrupt | Stop app, run `scripts/restore-test.sh` to verify backup, restore into Postgres volume, restart stack. |
| **Total EC2 Loss / Termination** | Server permanently gone | Provision new EC2 instance, pull code, download latest S3 backup, restore database, point DNS. |
| **AWS Region Outage (`ap-south-1`)** | Entire region unavailable | Provision EC2 instance in alternate region (`ap-southeast-1`), restore from cross-region S3 replica, update Route 53. |

---

## 3. Total Host Recovery Runbook (Step-by-Step)

If the primary EC2 virtual machine is terminated or lost:

### Phase 1: Provision Replacement VM (5 Minutes)
1. Launch an EC2 instance in AWS Console:
   - **AMI:** Ubuntu Server 24.04 LTS.
   - **Instance Type:** `t4g.large` (ARM64) or `t3.large` (x86_64).
   - **Storage:** 40 GB GP3 encrypted EBS volume.
   - **IAM Role:** Role with read access to `vetos-clinic-backups-*` S3 bucket.
   - **Security Group:** Inbound 80, 443 (All), 22 (Admin IP).
2. Note the new **Public IPv4 Address**.

### Phase 2: Update DNS A-Record (2 Minutes)
1. In DNS management (Route 53 / Cloudflare), update the `A` record for your domain:
   - Target: `<NEW_EC2_PUBLIC_IP>`.
   - TTL: `300`.

### Phase 3: Bootstrap Stack on New VM (10 Minutes)
SSH into the new instance:
```bash
ssh -i your-key.pem ubuntu@<NEW_EC2_PUBLIC_IP>

# 1. Clone repository
git clone https://github.com/Prithvee905/VetOS-petwellclinic.git VetOS
cd VetOS

# 2. Configure .env.production
# (Retrieve production passwords from AWS Secrets Manager or secure vault)
cp .env.production.example .env.production
nano .env.production
```

### Phase 4: Download & Restore Database from S3 (5 Minutes)
```bash
# 1. Identify and download latest backup from S3
LATEST_BACKUP=$(aws s3 ls s3://vetos-clinic-backups-ap-south-1/postgres/ --recursive | sort | tail -n 1 | awk '{print $4}')
echo "Restoring from: $LATEST_BACKUP"
aws s3 cp "s3://vetos-clinic-backups-ap-south-1/$LATEST_BACKUP" ./latest-recovery-point.sql.gz

# 2. Start PostgreSQL container in background
docker compose -f docker-compose.prod.yml up -d postgres
sleep 10

# 3. Restore data dump into clean database
gunzip -c latest-recovery-point.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d vetos
```

### Phase 5: Launch Application & Verify (5 Minutes)
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

Caddy will negotiate a new TLS certificate automatically for the existing domain name.

### Phase 6: Post-Recovery Smoke Verification
Verify the following workflows immediately:
1. Navigate to `https://clinic.petwell.com/login`.
2. Login as Clinic Owner (`owner@clinic.test` or clinic owner credentials).
3. Verify live queue shows existing patients.
4. Verify historical medical timeline and previous invoices.
5. Create a test walk-in queue token to verify read/write database consistency.
