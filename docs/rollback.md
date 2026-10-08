# ClinicOS / VetOS — Rollback Runbook

---

## 1. Rollback Overview

Deployments may occasionally introduce regressions or unexpected bugs. A clean rollback procedure ensures service can be restored quickly without risking data corruption.

```text
               Regressed Deployment Detected
                             │
                             ▼
               Assess Migration Backward-Compatibility
               ┌─────────────┴─────────────┐
               ▼                           ▼
        Schema Compatible            Destructive Migration
               │                           │
        Revert Containers           Restore Pre-Deployment
        to Previous Tag/Commit      Database Backup Point
```

---

## 2. Fast Application Rollback (Non-Breaking Schema)

If a deployment introduced a frontend UI defect or API logic error, but database migrations were **backward compatible**:

### Step 1: Identify Previous Working Commit or Tag
```bash
git log -n 5 --oneline
```
Identify the previous stable commit SHA (e.g. `a1b2c3d`).

### Step 2: Checkout Previous Version & Rebuild
```bash
# Checkout previous commit
git checkout <PREVIOUS_COMMIT_SHA>

# Rebuild and relaunch containers
./scripts/deploy.sh
```

### Step 3: Verify Service Health
```bash
docker compose -f docker-compose.prod.yml ps
curl -k https://localhost/actuator/health
```

---

## 3. Database Migration Rollback Rules

1. **Backward-Compatible Migrations (Standard Rule):**
   - Adding a nullable column, new table, or index is backward compatible.
   - You can roll back the application code without rolling back the database.
2. **Destructive Migrations:**
   - Column renames or table drops must wait until the previous version is decommissioned.
   - If a destructive migration was applied and corrupted data, do not write ad-hoc SQL fixes. Restore the database from the pre-deployment snapshot created by `scripts/backup-postgres.sh`.

---

## 4. Emergency Database Rollback (Restoring Pre-Deployment State)

If a deployment caused database corruption:

1. **Stop Application Traffic:**
   ```bash
   docker compose -f docker-compose.prod.yml stop web api
   ```

2. **Locate Pre-Deployment Backup:**
   ```bash
   ls -la backups/postgres/$(date +%Y/%m/%d)/
   ```

3. **Restore Pre-Deployment Snapshot:**
   ```bash
   PRE_BACKUP=$(ls -t backups/postgres/$(date +%Y/%m/%d)/*.sql.gz | head -n 1)
   echo "Rolling back to: $PRE_BACKUP"

   docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS vetos;"
   docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -c "CREATE DATABASE vetos OWNER postgres;"

   gunzip -c "$PRE_BACKUP" | docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d vetos
   ```

4. **Deploy Previous Codebase:**
   ```bash
   git checkout <PREVIOUS_COMMIT_SHA>
   ./scripts/deploy.sh
   ```

5. **Verify Clinical Operations:**
   Log in as Owner and confirm active patients, queue, and billing are operational.
