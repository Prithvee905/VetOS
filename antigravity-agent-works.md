# Antigravity Agent Work Log: VetOS Debugging

## Summary of Issue
The user was unable to run the VetOS application locally using `docker compose up --build`. The Next.js frontend (`web`) was throwing an `ECONNREFUSED` error, and the user reported a completely blank white screen when navigating to `localhost:3000`.

## Steps Taken & Fixes Applied

### 1. Fixed Docker Internal Networking
- **Problem:** The Next.js web application was configured to proxy API requests to `http://localhost:8080`. Inside Docker Compose, `localhost` refers to the `web` container itself, not the `api` container, leading to a connection refused error.
- **Action Taken:** Modified `docker-compose.yml`. Changed the environment variable for the `web` service from `NEXT_PUBLIC_API_URL` to `API_ORIGIN` and updated its value to `http://api:8080`.

### 2. Fixed Hibernate Schema Validation Crash (Attempt 1)
- **Problem:** The `api` container was silently crashing and failing to boot. Checking the Docker logs revealed a Hibernate schema validation mismatch: PostgreSQL had a `char(3)` column for `currency_code`, but Hibernate expected `varchar(3)` because the Java entity field was a `String`.
- **Action Taken:** Modified `ClinicEntity.java` to explicitly define the column as `char(3)` using `columnDefinition = "char(3)"`.

### 3. Diagnosed Docker/Windows Networking Hang
- **Problem:** When rebuilding the `api` container, the Maven dependency download froze indefinitely at `asm-9.9.1.pom`. 
- **Action Taken:** Diagnosed this as a known Docker Desktop on Windows bug where the network adapter fails to resolve IPv6/DNS during heavy downloads. Recommended restarting the Docker engine. To prevent it from happening again, I modified the `apps/api/Dockerfile` to include `-Djava.net.preferIPv4Stack=true` in the Maven command to force IPv4 routing.

### 4. Fixed Next.js Build-Time Environment Variable
- **Problem:** The frontend `ECONNREFUSED` error persisted even after fixing `docker-compose.yml`.
- **Action Taken:** Diagnosed that Next.js proxy rewrites in `next.config.ts` are evaluated at *build time*, not runtime. Since we didn't pass `API_ORIGIN` to the `web` Dockerfile during the build step, it fell back to `localhost`. Modified `apps/web/Dockerfile` to include `ARG API_ORIGIN` and `ENV API_ORIGIN=$API_ORIGIN` before running `npm run build`.

### 5. Configured and Pushed to GitHub
- **Problem:** The user requested to push the code to a new GitHub repository, but git was not initialized and no user config was set.
- **Action Taken:** Initialized git, added the files, configured the user email (`bodduprithvee@gmail.com`) and name (`Prithvee905`), committed the code, and pushed it to `https://github.com/Prithvee905/VetOS-petwellclinic.git`.

### 6. Fixed Hibernate Schema Validation Crash (Attempt 2)
- **Problem:** Hibernate 6's strict type checking still rejected the `columnDefinition` fix from step 2, throwing an error because it still fundamentally saw the Java field as a `String` mapping to a `CHAR` database column.
- **Action Taken:** Modified `ClinicEntity.java` to use the modern Hibernate 6 annotation: `@org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.CHAR)`. This properly instructs Hibernate to expect and handle a `CHAR` database type for the String variable.

### 7. Fixed Missing Bouncy Castle Dependency for Argon2 Password Encoder
- **Problem:** The API container crashed on startup with `java.lang.NoClassDefFoundError: org/bouncycastle/crypto/params/Argon2Parameters$Builder`. Spring Security's `Argon2PasswordEncoder` requires Bouncy Castle provider to execute password hashing, which was missing from the dependencies.
- **Action Taken:** Added `org.bouncycastle:bcprov-jdk18on:1.80` to `apps/api/pom.xml`.

### 8. Resolved Docker WSL2 Network Download Freeze
- **Problem:** Docker's internal NAT in WSL2 repeatedly froze during heavy dependency downloads (stuck at `asm-9.9.1.pom`).
- **Action Taken:** Built the artifact directly on the Windows host using `./mvnw.cmd package "-Dmaven.test.skip=true"` using native network throughput (~2.5 MB/s). Updated `apps/api/Dockerfile` to directly package the prebuilt JAR into the lightweight JRE runtime, and updated `.dockerignore` so Docker picks up the build artifact.

### 9. All Services Verified Running & Healthy
- `vetos-postgres-1`: PostgreSQL 17 UP and healthy on port 5432
- `vetos-redis-1`: Redis 7 UP on port 6379
- `vetos-api-1`: Spring Boot 4.1.1 API UP on port 8080 (`/actuator/health` UP, dev owner seeded)
- `vetos-web-1`: Next.js 16 Web UP on port 3000

### 10. Diagnosed Login Redirect Loop / Bouncing Back to Sign-in
- **Problem:** When submitting the login credentials, the frontend returned to the sign-in page without showing the clinic profile dashboard.
- **Root Cause Identified:** The Next.js `SettingsShell` layout queries `/api/v1/auth/me` on mount. If that request fails, the shell executes `router.replace("/")` and kicks the user back to the sign-in form. Calling `/api/v1/auth/me` returned HTTP 500 (`INTERNAL_ERROR`).

### 11. Fixed Spring Security Principal Type Mismatch
- **Problem:** All protected controllers (`AuthController`, `ClinicController`, `UserController`) use `@AuthenticationPrincipal VetosAuthentication authentication`. However, `VetosAuthentication.getPrincipal()` was returning `userId` (a `UUID`). Spring Security could not map the `UUID` to `VetosAuthentication`, resulting in a `null` argument and throwing a `NullPointerException` on `authentication.userId()`.
- **Action Taken:** Modified `VetosAuthentication.java` so `getPrincipal()` returns `this`, allowing `@AuthenticationPrincipal` to properly inject the `VetosAuthentication` instance.

### 12. Added Comprehensive Logging to Global Exception Handler
- **Problem:** `ApiExceptionHandler.java` was returning generic 500 errors to clients while completely swallowing stack traces from console output, obscuring internal runtime errors.
- **Action Taken:** Integrated SLF4J logger in `ApiExceptionHandler.java` to print full stack traces for all unexpected exceptions.

### 13. Fixed Next.js Standalone Network Binding
- **Problem:** The Next.js standalone container only bound to the container hostname, refusing connections to `127.0.0.1` and `0.0.0.0`.
- **Action Taken:** Updated `apps/web/Dockerfile` with `ENV HOSTNAME="0.0.0.0"` and `ENV PORT=3000` per Next.js deployment standards.

### 14. Fixed 409 Conflict Bug on Clinic Profile Save (Optimistic Locking)
- **Problem:** When saving clinic details, subsequent saves or quick updates failed with HTTP 409 (`VERSION_CONFLICT`).
- **Root Cause Identified:** Both `clinics` and `users` use JPA `@Version` for concurrency control. `ClinicService.update` was calling `clinicRepository.save(clinic)` instead of `saveAndFlush(clinic)`. In Spring Data JPA, `save()` does not immediately execute the SQL update until transaction commit, so the returned DTO sent back the pre-incremented version number to the frontend. Subsequent client requests submitted the stale version, which PostgreSQL and Hibernate rejected with 409.
- **Action Taken:** Updated `ClinicService.java` and `UserAdminService.java` to use `saveAndFlush()`. This flushes the update immediately and ensures the response returns the newly incremented `@Version`.

### 15. Synchronized Frontend Draft State on Save/Conflict
- **Problem:** The frontend `ClinicSettingsPage` did not reset dirty draft input states on successful mutation, and didn't refetch on conflict errors.
- **Action Taken:** Updated `apps/web/src/app/settings/clinic/page.tsx` to clear draft form state on `onSuccess` and automatically invalidate/refetch queries via React Query on `onError`.
- **Verification:** Ran automated sequential PATCH requests (`v3 -> v4 -> v5`), confirming that multiple consecutive saves succeed with HTTP 200 without any conflict errors.

### 16. Fixed User Creation Foreign Key Constraint & Documented 409 Duplicate Email
- **Problem:** Attempting to create a user failed. Two scenarios were investigated:
  1. If creating a user with an already existing email (e.g. `owner@clinic.test`), the backend throws `ApiException.conflict("A user with that email already exists.")` resulting in HTTP 409 Conflict as intended by email uniqueness rules.
  2. For fresh users, the backend threw a PostgreSQL foreign key error: `insert into user_roles violates foreign key constraint "user_roles_user_fk"` because `userRepository.save(user)` had not flushed the new user record into PostgreSQL before raw JDBC executed `insert into user_roles`.
- **Action Taken:** Updated `UserAdminService.create` to use `userRepository.saveAndFlush(user)`. Recompiled the JAR and restarted the API container.
- **Verification:** Successfully created a new user with the `OWNER` role (`second.owner@clinic.test`) returning HTTP 201 Created and confirmed both owners appear in `/api/v1/users`.

### 17. Full Enterprise Platform Implementation (Sections 1–92 Specification)
- **Problem Statement:** The user asked whether the codebase matched the complete master specification and requested the full product to be built without hallucinations.
- **Audit Findings:** While database migrations V1–V4 had created tables for inventory batches, vendors, POs, expenses, labs, surgeries, admissions, deworming, and grooming, the application lacked backend REST controllers, business services, and frontend screens for these modules. The UI only offered a single linear clinic flow and a static placeholder for `/modules`.
- **Backend Services & REST Controllers Implemented (`apps/api`):**
  1. `InventoryService.java` & `InventoryControllers.java`: Product catalog search & creation, batch inventory with expiry tracking, stock movements ledger, manual stock reconciliation adjustments, and atomic pharmacy dispensing against doctor prescriptions.
  2. `ProcurementService.java` & `ProcurementControllers.java`: Vendor management, purchase orders lifecycle (`DRAFT` -> `ORDERED` -> `RECEIVED`), and goods receipt engine (atomically receiving PO lines, creating/incrementing batches, and logging stock movements).
  3. `SpecialtyService.java` & `SpecialtyControllers.java`: Parasite prevention (Deworming doses & next due date reminders), Diagnostic Pathology Labs (order creation & progress tracking), Operating Room Surgeries (procedure scheduling & completion), Hospitalization / IPD Admissions (ward check-in & discharge), and Spa Grooming Bookings.
  4. `FinanceService.java` & `FinanceControllers.java`: Operating expense ledger (categorization by rent, electricity, medical supplies, staff salaries) and Executive Financial Summary (total invoiced, cash collected, accounts receivable, total expenses, net operating profit, and category breakdowns).
  5. `DashboardService.java` & `DashboardControllers.java`: Command Center daily overview (today's appointment count, live waiting queue, today's collected revenue, active patient census, low stock alerts, hospitalized IPD count, due vaccination alerts, due deworming alerts) and Omni-Search (fuzzy search across pets, clients, and catalog items).
  6. `ClinicalWorkflowService.java` & `ClinicalControllers.java`: Added `getPatientTimeline()` aggregating consultations (SOAP notes + vitals), prescriptions, vaccinations, dewormings, labs, surgeries, admissions, and invoices into a unified chronological medical timeline.
  7. `RolePermissions.java`: Granted `INVENTORY_WRITE` to DOCTOR and RECEPTIONIST roles for seamless clinical and dispensing access.
  8. `ApiException.java`: Added `badRequest(String message)` utility method and removed duplicate springdoc dependency in `pom.xml`.
- **Frontend Modules & Modern UI Implemented (`apps/web`):**
  1. `components/app-shell.tsx`: Upgraded with top-level Omni-Search bar (with live instant dropdown results for pets, owners, and products), active status indicator, role badges, and responsive top-navigation across all modules.
  2. `app/dashboard/page.tsx`: Executive command center with real-time KPI cards, vaccination & deworming due alert cards, and operational shortcut buttons.
  3. `app/patients/page.tsx`: Comprehensive patient directory, owner registration modal, pet registration modal, and interactive chronological medical history timeline with quick-action buttons for deworming and diagnostic orders.
  4. `app/pharmacy/page.tsx`: Prescription dispensing station with batch selection, stock verification, and live batches overview.
  5. `app/inventory/page.tsx`: Product catalog master, stock batches with low-stock (&le; 5 units) and expiring-soon (&le; 30 days) filter toggles, stock adjustments modal, and movement audit ledger modal.
  6. `app/procurement/page.tsx`: Pharmaceutical vendor directory, purchase order creation with itemized lines, PO detail inspection, and goods receipt modal.
  7. `app/specialties/page.tsx`: Multi-tab interface for Diagnostic Labs, Surgeries, Hospitalization / IPD Ward (with instant discharge), and Grooming / Spa sessions.
  8. `app/analytics/page.tsx`: Financial ledger with revenue by clinical source, expense breakdown by category, expense voucher modal, and cashflow KPIs.
  9. `components/sign-in-panel.tsx`: Updated post-login redirect to land on `/dashboard`.
  10. `components/ui/button.tsx`: Added `size` variants (`sm`, `default`, `lg`) using `cva` for clean type safety.
  11. `lib/api.ts`: Added full TypeScript interfaces and API helper methods for all new platform endpoints.
- **Verification & Testing Results:**
  - Maven compile: `BUILD SUCCESS` (68 source files compiled with Java 21).
  - Next.js Turbopack build: All 14 routes compiled and statically optimized without errors.
  - Docker containers: Rebuilt `vetos-api` and `vetos-web`, all running healthy.
  - End-to-End Automated Test: 16-step integration script verified login, overview metrics, branches, product creation, batch creation, stock adjustment, vendor creation, PO creation, goods receipt, patient registration, specialties (deworming, lab, surgery, IPD admission, grooming), expense recording, financial analytics, omni-search, and chronological patient timeline. All passed with 100% success.

## Educational Explanations Provided
- Explained what Docker does (creates isolated containers for DB, Cache, API, and Web and links them via a virtual network).
- Explained why a Python virtual environment is not needed (the stack is Java/Node.js).
- Explained why there is no "Sign Up" page (B2B multi-tenant security relies on an admin-invite workflow).
- Explained why Swagger UI is missing (the AI opted for a static `openapi.yaml` file instead of runtime Springdoc generation).
- Evaluated overall codebase architecture (sound Postgres RLS and security models, but scaffolded with subtle AI integration bugs).

### 18. Prototype Parity Implementation (P0, P1, P2 Backlog from `antigravity-tasks.md`)
- **P0: Clinical Station Overhaul (`/clinic`):**
  1. **Live Queue Triage Board:** Real-time polling queue board displaying token numbers, patient ID, attending doctor, priority badges (`NORMAL` vs `EMERGENCY` with pulse animation), status workflow (`WAITING`, `IN_CONSULTATION`, `COMPLETED`, `NO_SHOW`, `CANCELLED`), and 1-click consultation launcher.
  2. **Appointments & Doctor Roster:** Full daily schedule list with doctor filtering, check-in to queue button, and appointment booking form.
  3. **SOAP Consultation Station:** Complete clinical station capturing:
     - **S (Subjective):** Chief complaint, history of illness, and owner observations.
     - **O (Objective):** Physical exam findings and vitals (Temperature, Heart Rate, Respiratory Rate, Mucous membranes, Hydration).
     - **A (Assessment):** Primary diagnosis and ranked differential diagnoses list.
     - **P (Plan):** Treatment plan, discharge notes, and follow-up date picker.
     - **Digital Prescription Writer:** Multi-line prescription composer (Drug name, quantity, dosage, frequency, duration, route, instructions) generating prescriptions and auto-forwarding to billing.
  4. **Unified Invoice Basket & POS:** Multi-line billing basket supporting:
     - Doctor prescriptions
     - Standard catalog clinical services (`listServices()`)
     - OTC retail inventory products (`listProducts()`)
     - Instant payment capture (UPI, Card, Cash) with idempotency key generation.
  5. **Quick Walk-In Registration:** 10-second client + pet registration that automatically books an appointment and checks into the queue with a token.

- **P1: Communications, Reminders, and CRM:**
  1. **Communications & PRM Hub (`/communications`):**
     - Direct WhatsApp message composer (with templates like `CLINIC_UPDATE`, `APPOINTMENT_REMINDER`).
     - Direct Email message composer.
     - **PRM Automated Reminder Engine:** `ReminderService.java` and `POST /api/v1/reminders/trigger` scanning appointments (next 24h), vaccines (due in 7d), and deworming (due in 7d) with automatic deduplication into `outbox_events`.
     - **Live Outbox Monitor:** Real-time table of outbox delivery events, worker status, payload previews, and retry tracking.
  2. **Leads CRM Pipeline (`/leads`):**
     - Lead intake form (Name, phone, email, acquisition source, notes).
     - Leads pipeline table with status progression (`NEW`, `CONTACTED`, `QUALIFIED`, `CONVERTED`, `LOST`).
     - 1-click "Convert to Client" button turning prospects into active clinic clients.
  3. **Patient Vaccination Recording (`/patients`):**
     - Added dedicated `+ Record Vaccine` modal capturing vaccine name, administration date, next booster date, batch number, and administration site notes.
     - Exposed `GET /api/v1/vaccinations` in `PlatformControllers.java` and `PlatformExpansionService.java`.

- **P2: Operations & Audit Trail:**
  1. **Services Catalog (`/settings/services`):**
     - `ServiceCatalogService.java` & `ServiceCatalogController.java` (`GET /api/v1/services`, `POST /api/v1/services`, `PATCH /api/v1/services/{id}/status`).
     - UI to create and manage standard clinic service codes and default pricing.
  2. **Immutable Audit Trail (`/settings/audit`):**
     - `AuditQueryService.java` & `AuditController.java` (`GET /api/v1/audit-events`).
     - Paginated compliance table displaying timestamp, actor, action, entity type, entity ID, and distributed request IDs.

- **Verification Results:**
  - Java API: Clean compilation (`74 source files`), JAR repackaged, all 9/9 Spring Boot + Testcontainers integration tests passing (`BUILD SUCCESS`).
  - Next.js Web: Turbopack production build compiled all 18 routes without errors (`Exit code 0`).
  - Docker Compose: Containers `vetos-postgres-1`, `vetos-redis-1`, `vetos-api-1`, and `vetos-web-1` running healthy.
  - Browser Subagent: Automated browser run verified login, dashboard KPIs, all 5 `/clinic` tabs, `/communications` message dispatch and PRM reminder run, `/leads` CRM, `/settings/services`, and `/settings/audit` compliance logs.

---

## 15. Comprehensive QA Auditing & Critical Defect Fixes (Pass 1 → Pass 3)

### Defect 1: Standalone POS Invoicing Decoupled from Doctor Consultations
- **Problem:** Clinicians and front-desk receptionists were unable to bill OTC products (shampoos, leashes, OTC flea meds) or direct clinic services without first attaching a formal medical consultation ID.
- **Action Taken:** Decoupled consultation validation in `ClinicalWorkflowService.java` and `apps/web/src/app/clinic/page.tsx`. Enabled receptionists and cashiers to generate standalone point-of-sale invoices with direct payment capture.

### Defect 2: Walk-In Calendar Schedule Collision
- **Problem:** When emergency or walk-in patients were checked into the queue, the system scheduled them for an appointment time overlapping existing booked slots, triggering unique constraint violations in the database.
- **Action Taken:** Created Flyway migration `V5__walkin_appointment_overlap.sql` and updated the Java booking service to allocate dedicated emergency/walk-in slot offsets without colliding with pre-booked appointments.

### Defect 3: Reactive Multi-Branch Switcher Dropdown
- **Problem:** Users with multi-branch access had no visual mechanism in the web shell to toggle their active working branch.
- **Action Taken:** Built an active branch switcher dropdown in `apps/web/src/app/clinic/page.tsx` with instant reactive `localStorage` persistence and automatic tenant transaction context updates.

### Defect 4: Staff Creation Role Lifecycle & Form Accessibility
- **Problem:** When creating staff accounts (Receptionist, Doctor, Staff) under `/settings/users`, missing HTML form IDs and loose validation caused silent UI failures.
- **Action Taken:** Added explicit IDs (`#email`, `#password`, `#displayName`, role checkboxes) and verified complete lifecycle in `apps/web/src/app/settings/users/page.tsx`.

### Defect 5: Patient Modal Accessibility & Receptionist Access
- **Problem:** Receptionist role was blocked from accessing patient registration and timeline modals due to missing role permission mappings.
- **Action Taken:** Added `PATIENT_WRITE` to Receptionist permissions, added explicit modal accessibility attributes in `apps/web/src/app/patients/page.tsx`, and verified 7/7 QA test suite pass in `qa3-results.json` and `CLINICOS_QA_PASS_3_REPORT.md`.

---

## 16. Production Infrastructure & Security Hardening

To support production pilot deployments without unnecessary cloud complexity (avoiding early Kubernetes/RDS/ECS overhead), built a hardened **Single-Instance Production Modular Monolith**:

### 1. Multi-Container Production Compose (`docker-compose.prod.yml`)
- **Containers:** Next.js (port 3000), Spring Boot 4.1.1 (port 8080), PostgreSQL 17 (port 5432), Redis 7 (port 6379), and Caddy 2 (ports 80 & 443).
- **Hardening:**
  - Database (5432) and Redis (6379) ports are strictly internal to the Docker bridge network; not exposed to host or internet.
  - Health checks on all containers using netcat socket inspection (`nc -z`).
  - Automatic container log rotation (`max-size: 20m`, `max-file: 5`).
  - Container restart policies set to `unless-stopped`.
  - Persistent EBS volumes for database, Redis, local blobs, and TLS certificates.

### 2. Caddy Reverse Proxy & Automatic Let's Encrypt TLS (`docker/caddy/Caddyfile`)
- Automatic HTTPS certificate provisioning via Let's Encrypt and ZeroSSL.
- Path-based routing:
  - `/*` → Proxied to Next.js (`web:3000`)
  - `/api/*` → Proxied to Spring Boot (`api:8080`)
- Security blocks:
  - `/actuator/*` → Returns `403 Forbidden` (only `/actuator/health*` permitted).
  - `/api/v1/platform-admin/*` → Returns `403 Forbidden` from public internet.
- Standard HTTP security headers applied (HSTS, nosniff, SAMEORIGIN, Referrer-Policy, Permissions-Policy).

### 3. Database Role Hardening & Disaster Recovery
- Created unprivileged application role initializer: `docker/postgres/01-init-role.sh`.
- Created automated backup script: `scripts/backup-postgres.sh` (compressed `pg_dump` with gzip, optional S3 upload with AES256, and 14-day rotation).
- Created non-destructive recovery test script: `scripts/restore-test.sh` (verified: 41 tables restored, all records and forced RLS intact).
- Full production documentation added in `docs/` (`production-deployment.md`, `backup-and-restore.md`, `disaster-recovery.md`, `security-hardening.md`, `rollback.md`).

---

## 17. AWS EC2 Cloud Provisioning & Live Launch

- **Target Machine:** AWS EC2 `t4g.small` (ARM64 Graviton, Ubuntu 24.04 LTS, 30GB GP3 encrypted EBS) in `ap-south-1` (Mumbai).
- **Swap Space:** Configured 2GB swap file to prevent memory pressure during builds.
- **Production Config:** Generated `.env.production` with secure credentials and active profile `SPRING_PROFILES_ACTIVE=prod,dev`.
- **First Launch:** Cloned repository to `~/VetOS/VetOS`, executed `./scripts/deploy.sh`.
- **Domain:** Successfully live and serving over HTTPS with valid SSL padlock at `https://13.207.205.10.nip.io` (and dynamic IP `https://13.202.89.217.nip.io`).
- **Automated Backup Schedule:** Configured daily 2:00 AM UTC cron job (`scripts/backup-postgres.sh`).

---

## 18. Critical Production Bugs Diagnosed & Resolved

### 1. Caddy Crash Loop (`Exit Code 1`)
- **Problem:** Caddy repeatedly crashed and restarted every 60 seconds on initial deployment.
- **Root Cause:** In `docker/caddy/Caddyfile`, line 6 used nested variable syntax `{$APP_DOMAIN:{$DOMAIN_NAME:localhost}}`. Caddy's parser left a trailing curly brace (`}`), resulting in the host `13.207.205.10.nip.io}`, which failed hostname validation (`subject does not qualify for certificate`).
- **Action Taken:** Fixed line 6 to `{$APP_DOMAIN:localhost} {`. Caddy validated cleanly and started serving HTTPS immediately.

### 2. Flaky Container Healthchecks
- **Problem:** BusyBox `wget --spider` inside alpine containers failed on HTTP 308 redirects and Next.js SSR paths, marking containers as `(unhealthy)`.
- **Action Taken:** Replaced `wget` healthchecks in `docker-compose.prod.yml` with netcat socket checks (`nc -z 127.0.0.1 3000` and `nc -z 127.0.0.1 80 || nc -z 127.0.0.1 443`).

### 3. Production Bootstrap Owner Seeding
- **Problem:** When signing in on production, the API returned `Authentication failed` because `DevOwnerLoader` was annotated with `@Profile("dev")`, while production ran only `prod`.
- **Action Taken:** Updated `SPRING_PROFILES_ACTIVE` to `prod,dev` in `docker-compose.prod.yml` and `.env.production`. When `api` booted, it seeded `owner@clinic.test` / `change-me-now` with `OWNER` role, allowing immediate login.

---

## 19. SaaS Super-Admin Clinic Onboarding & Password Governance (Option A)

Built a secure, centralized administrative toolset allowing the SaaS founder to onboard client clinics and manage passwords with zero public internet attack surface:

### 1. Internal Platform Admin API (`PlatformAdminController.java`)
- **`POST /api/v1/platform-admin/onboard-clinic`**:
  - Validates `X-Platform-Admin-Secret` header.
  - Generates UUIDv7 for Clinic, Branch, and Owner User.
  - Encodes client password using Argon2 (`Argon2PasswordEncoder`).
  - Creates the new tenant under forced PostgreSQL Row-Level Security (RLS) and assigns the `OWNER` role.
- **`POST /api/v1/platform-admin/reset-password`**:
  - Validates `X-Platform-Admin-Secret` header.
  - Queries user across all tenants via `app.find_login(email)`.
  - Re-encodes new password with Argon2, resets failed login counters, unlocks the account, and updates the record.
- **Security Guard:**
  - Caddy reverses any public HTTP/HTTPS request to `/api/v1/platform-admin/*` with **`403 Forbidden`**.
  - Spring Security permits internal execution only with valid `VETOS_PLATFORM_ADMIN_SECRET`.

### 2. Administrator CLI Scripts
- **Linux/AWS EC2 (Bash):**
  - `./scripts/onboard-clinic.sh "<Clinic Name>" "<Owner Email>" "<Password>" ["<Display Name>"] ["<Branch Name>"]`
  - `./scripts/reset-password.sh "<User Email>" "<New Password>"`
- **Windows (PowerShell):**
  - `.\scripts\onboard-clinic.ps1 -ClinicName "<Clinic>" -Email "<Email>" -Password "<Pass>"`
  - `.\scripts\reset-password.ps1 -Email "<Email>" -NewPassword "<Pass>"`
- **Verification:** Both scripts tested and verified successfully locally and in production.

---

## 20. CI/CD & GitHub Actions Fixes

- **Problem:** GitHub Actions failed on commit `6a911fb` with `CI / api Failed in 4 seconds` and frontend test failures.
- **Root Causes:**
  1. `apps/api/mvnw` was tracked in Git without executable permission (mode `100644`), throwing `Permission denied` on Ubuntu GitHub runners.
  2. `foundation-panel.test.tsx` rendered `<SignInPanel />` without `<QueryClientProvider>`.
- **Action Taken:**
  1. Ran `git update-index --chmod=+x apps/api/mvnw` (mode changed to `100755`) and added `chmod +x apps/api/mvnw` step in `.github/workflows/ci.yml`.
  2. Wrapped test in `QueryClientProvider` (vitest passed 1/1, `npm run build` compiled 18/18 routes cleanly).
  3. Pushed commit `4092bf9`, bringing CI back to green.

---

## 21. AWS Security Group & IP Management

- **SSH Port 22 Locking:**
  - Identified that browser-based EC2 Instance Connect originates from AWS's Mumbai CIDR (`13.233.177.0/29`), allowing Port 22 to be locked to AWS and the administrator's personal IP while blocking all public internet scanners.
- **Dynamic IP Management:**
  - Documented that stopping and restarting an EC2 instance reassigns a new public IP (`13.202.89.217`).
  - Updated deployment instructions and `.env.production` sync commands accordingly.


