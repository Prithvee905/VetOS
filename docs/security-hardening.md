# ClinicOS / VetOS — Security Hardening Guide

---

## 1. Operating System & Host Hardening (Ubuntu 24.04)

### SSH Configuration (`/etc/ssh/sshd_config`):
Enforce key-based authentication and disable root login:
```ini
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
```
Restart SSH: `sudo systemctl restart sshd`.

### Automatic Security Updates:
Enable `unattended-upgrades` to apply Linux kernel and package security patches automatically:
```bash
sudo apt-get update && sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### Host Firewall (UFW):
In addition to AWS Security Groups, configure UFW as defense-in-depth:
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 2. Network & Container Isolation

```text
               Public Internet (Ports 80 & 443 Only)
                                 │
                                 ▼
                     Caddy Container (:80, :443)
                                 │
   Docker Internal Bridge Network (172.x.x.x - No External IP)
       ├── web:3000      (Next.js Web)
       ├── api:8080      (Spring Boot API)
       ├── postgres:5432 (PostgreSQL 17 - Internal only)
       └── redis:6379    (Redis 7 - Internal only)
```

- **No Host Port Bindings:** In `docker-compose.prod.yml`, `postgres`, `redis`, `api`, and `web` do not declare `ports:`. They cannot be reached directly from the host's public IP address.
- **Actuator Endpoint Filtering:** Caddy explicitly permits `/actuator/health*` for health checks, while returning `403 Forbidden` for all sensitive actuator endpoints (`/actuator/env`, `/actuator/beans`, `/actuator/heapdump`, `/actuator/loggers`).

---

## 3. Database Security & Multi-Tenant RLS

### Least-Privilege Database Roles:
1. `postgres` (Superuser): Used **only** by Flyway during initial startup to run DDL migrations.
2. `vetos_app` (Application User): Used at runtime by Spring Boot. Granted `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`.

### Forced Row-Level Security (RLS):
PostgreSQL Row-Level Security is enabled and **FORCED** on all multi-tenant tables:
```sql
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;

CREATE POLICY patients_tenant ON patients
    USING (clinic_id = app.current_clinic_id())
    WITH CHECK (clinic_id = app.current_clinic_id());
```
Even if application code fails to filter by `clinic_id`, PostgreSQL blocks cross-tenant access at the storage layer.

---

## 4. Application & Cryptographic Hardening

1. **Password Hashing:** Passwords are encrypted using **Argon2id** (`Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8()`), resistant to GPU-based brute-force attacks.
2. **Session Cookies:** Tokens are written to secure HTTP-only cookies:
   - `HttpOnly = true` (Inaccessible to client-side JavaScript, prevents XSS token theft).
   - `Secure = true` (Transmitted strictly over HTTPS).
   - `SameSite = Strict` (Prevents CSRF attacks).
3. **JWT Secret:** Uses a cryptographically secure 256-bit random key (`VETOS_JWT_SECRET`).
4. **CORS:** Restricted to the exact clinic production origin (`https://clinic.petwell.com`).
5. **Payment Idempotency:** Financial payment collection requires an `idempotency_key` to prevent double charges on duplicate requests.

---

## 5. Secrets Management

- **File Permissions:** Protect `.env.production` on the server so only the `ubuntu` user can read it:
  ```bash
  chmod 600 .env.production
  ```
- **Git Hygiene:** `.env.production` is added to `.gitignore` and must never be committed.
- **Future Migration to AWS Secrets Manager:**
  The application reads standard environment variables (`SPRING_DATASOURCE_PASSWORD`, `VETOS_JWT_SECRET`). To migrate to AWS Secrets Manager, an AWS SSM agent or script fetches secrets at container launch without requiring application code changes.
