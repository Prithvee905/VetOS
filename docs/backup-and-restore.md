# ClinicOS / VetOS — Backup & Restore Procedure

## Quick setup (EC2 + S3)

1. **Create the bucket** (S3 console, region ap-south-1): block all public access, enable versioning, default encryption SSE-S3. Add a lifecycle rule on prefix `postgres/`: move to Glacier Instant Retrieval after 30 days, expire after 365 days.
2. **Give the server access**: IAM role attached to the EC2 instance with `s3:PutObject`, `s3:GetObject` on `arn:aws:s3:::<bucket>/postgres/*` and `s3:ListBucket` on `arn:aws:s3:::<bucket>`. No access keys go on the server.
3. **Configure** `.env.production`: `S3_BACKUP_BUCKET`, `AWS_REGION`, `BACKUP_ALERT_EMAIL` (and optionally `BACKUP_HEALTHCHECK_URL`).
4. **Install the jobs**: `./scripts/install-backup-cron.sh`
5. **Prove it**: `./scripts/backup-postgres.sh && ./scripts/restore-test.sh --from-s3`

The host needs no AWS CLI; the scripts fall back to the official `amazon/aws-cli` image.
Failures (dump, integrity, upload, size mismatch, restore) email `BACKUP_ALERT_EMAIL`.
`backups/last-success` and `backups/last-restore-test` record the latest good runs.

---

---

## 1. Backup Strategy Overview

In veterinary clinic operations, patient medical records, active prescriptions, appointments, and fiscal transactions are legally binding records. A robust backup policy must protect against hardware failure, operator error, and container corruption.

```text
               PostgreSQL 17 Container (:5432)
                             │
                             ▼
               pg_dump (Consistent Snapshot)
                             │
                             ▼
               gzip -9 Compression & Integrity Check
                             │
                             ▼
         Local Encrypted EBS Storage (14-Day Retention)
         Path: backups/postgres/YYYY/MM/DD/clinic-os-*.sql.gz
                             │
                             ▼
              AWS S3 Bucket (AES256 Server-Side Encryption)
              Path: s3://<BUCKET>/postgres/YYYY/MM/DD/clinic-os-*.sql.gz
```

---

## 2. Automated Scheduling via Cron

The backup script is decoupled from the application lifecycle and managed directly by the host operating system's cron daemon.

### Scheduling Configuration:
1. Open crontab on the EC2 host:
   ```bash
   crontab -e
   ```
2. Add the daily backup entry to execute at 02:00 AM UTC (low clinic traffic):
   ```cron
   0 2 * * * /home/ubuntu/VetOS/scripts/backup-postgres.sh >> /home/ubuntu/VetOS/backups/backup.log 2>&1
   ```

---

## 3. S3 Bucket Security & IAM Configuration

### S3 Bucket Setup:
1. Bucket Name: `vetos-clinic-backups-<region>`
2. **Block Public Access:** All 4 settings enabled (**ON**).
3. **Encryption:** Server-side encryption with Amazon S3-managed keys (`SSE-S3 / AES256`).
4. **Lifecycle Rule:**
   - Transition objects to **S3 Standard-IA** after 30 days.
   - Transition objects to **S3 Glacier Flexible Retrieval** after 90 days.
   - Expire/delete backups after 365 days.

### EC2 IAM Instance Profile:
Attach an IAM role to the EC2 instance with the following minimal policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::vetos-clinic-backups-*",
        "arn:aws:s3:::vetos-clinic-backups-*/*"
      ]
    }
  ]
}
```

---

## 4. Manual Backup Execution

To execute an immediate backup before applying system updates:
```bash
cd /home/ubuntu/VetOS
./scripts/backup-postgres.sh
```

### Inspect Backup Logs:
```bash
tail -n 20 backups/backup.log
```

---

## 5. Database Restore Procedure

### A. Non-Destructive Restore Verification Test
Always test restores using the automated verification tool, which runs inside an isolated throwaway container without touching production data:
```bash
./scripts/restore-test.sh [optional_path_to_backup.sql.gz]
```
The test verifies:
- All 41+ domain tables exist.
- Clinic, patient, appointment, invoice, and payment rows match expectations.
- PostgreSQL Row-Level Security (RLS) is active and forced (`relforcerowsecurity = true`).
- Flyway migration history is intact.

### B. Production Recovery (Full Database Restore)
If production database recovery is required due to corruption or host replacement:

1. **Stop Application Services (Keep Postgres running):**
   ```bash
   docker compose -f docker-compose.prod.yml stop web api
   ```

2. **Download Backup from S3 (if restoring on a new host):**
   ```bash
   aws s3 cp s3://<BUCKET>/postgres/2026/10/08/clinic-os-2026-10-08-020000.sql.gz ./restore-point.sql.gz
   ```

3. **Restore Database:**
   ```bash
   # Recreate clean database
   docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS vetos;"
   docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -c "CREATE DATABASE vetos OWNER postgres;"

   # Restore schema and data
   gunzip -c restore-point.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d vetos
   ```

4. **Restart Application Services:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d web api
   ```

5. **Verify Clinical Station Access:**
   Navigate to `https://clinic.petwell.com/clinic` and verify active patients, appointments, and live queue.
