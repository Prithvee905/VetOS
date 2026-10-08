# Antigravity task file — VetOS inventory vs prototype

**Repository:** `C:\Users\boddu\VetOS`  
**Last verified:** 2026-10-03 (Full stack Docker rebuild + 9/9 backend integration tests passing + browser E2E verified across all routes)  
**Purpose:** Single checklist of **what we have**, **what is partial**, and **what we must still implement** to match the **Enterprise prototype** (feature/function list only — not prototype UI stack or pixel design).

**Related logs:** `antigravity-agent-works.md` (early Docker/auth fixes), `cursor-agent-works.md` (integration layer + login ops).

---

## How to read status

| Status | Meaning |
| --- | --- |
| **HAVE** | Usable API and/or UI; fits normal clinic use with current build |
| **PARTIAL** | Schema and/or API and/or thin UI exists; missing prototype depth, screens, automation, or tests |
| **TODO** | Not built (or docs-only); required for prototype parity |
| **OPS** | Your configuration / cloud / external providers (not application code complete) |

---

## A. Platform & foundation — HAVE

| Item | Evidence |
| --- | --- |
| Monorepo: Spring Boot 4.1 API + Next.js web + Docker Compose | `apps/api`, `apps/web`, `docker-compose.yml` |
| PostgreSQL 17 + Flyway V1–V4 | `apps/api/src/main/resources/db/migration/` |
| Multi-tenant RLS (`vetos_app`, `app.current_clinic_id()`) | `V1__foundation.sql`, `TenantContextFilter`, `CrossTenantIsolationTest` |
| Auth: login, refresh, logout, `/me`, CSRF (non-test), JWT cookies | `AuthController`, `AuthFlowTest` |
| Argon2 passwords + Bouncy Castle | `SecurityConfig`, `pom.xml` |
| Roles: OWNER, DOCTOR, RECEPTIONIST, STAFF + Java permission map | `RolePermissions.java` (not loaded from DB `role_permissions` yet) |
| Dev seed user | `DevOwnerLoader`: `owner@clinic.test` / `change-me-now` (`dev` profile) |
| Actuator health + Swagger UI | `/actuator/health`, `/swagger-ui.html`, `ActuatorHealthTest` |
| CI workflow | `.github/workflows/ci.yml` |
| API integration test harness (Testcontainers Postgres) | `ApiIntegrationTest`, **9 tests** in `apps/api/src/test` |
| Audit **writes** on many mutations | `AuditRecorder`, `audit_events` table |
| Request ID filter + global exception logging | `RequestIdFilter`, `ApiExceptionHandler` |

---

## B. Database tables — HAVE (schema)

| Migration | Tables |
| --- | --- |
| **V1** | `clinics`, `branches`, `roles`, `permissions`, `role_permissions`, `users`, `user_roles`, `refresh_tokens`, `audit_events` |
| **V2** | `clients`, `patients`, `appointments`, `queue_entries`, `consultations`, `consultation_differentials`, `prescriptions`, `prescription_items`, `invoices`, `invoice_lines`, `payments` |
| **V3** | `leads`, `vaccination_doses`, `deworming_doses`, `services`, `products`, `inventory_batches`, `stock_movements`, `vendors`, `purchase_orders`, `purchase_order_lines`, `goods_receipts`, `expenses`, `outbox_events`, `files`, `export_jobs`, `lab_orders`, `surgeries`, `admissions`, `grooming_bookings` |
| **V4** | `provider_webhook_events`, function `app.claim_outbox_events()` |

**Schema without REST API yet:** `services` (clinic service catalog, not product SKU).

**Schema not present (prototype needs later):** `campaigns`, `notifications`, `reminder_jobs`, `payment_refunds` (per requirements docs), offline sync tables beyond idempotency on payments.

---

## C. REST API — complete endpoint inventory (HAVE at API layer)

Base: `/api/v1` unless noted.

### Identity & clinic admin — HAVE

| Method | Path |
| --- | --- |
| GET | `/auth/csrf`, `/auth/me` |
| POST | `/auth/login`, `/auth/refresh`, `/auth/logout` |
| GET/PATCH | `/clinic` |
| GET/POST/PATCH | `/users`, `/users/{userId}` |
| GET/POST | `/branches` |

### Clinical (phase 2 slice) — HAVE

| Method | Path |
| --- | --- |
| GET/POST | `/clients` |
| GET/POST | `/patients` |
| GET | `/patients/{patientId}`, `/patients/{patientId}/timeline` |
| GET/POST | `/appointments` |
| GET/POST | `/queue` |
| PATCH | `/queue/{queueId}` |
| POST | `/consultations`, `/prescriptions`, `/invoices`, `/payments` (payments require `Idempotency-Key`) |

### Platform & CRM — HAVE (API)

| Method | Path |
| --- | --- |
| GET/POST | `/leads` |
| POST | `/vaccinations` |
| POST | `/products` (legacy; see inventory `/products/item`) |
| POST | `/exports` |
| GET | `/exports/{exportId}` |

### Dashboard & search — HAVE

| Method | Path |
| --- | --- |
| GET | `/dashboard/overview` |
| GET | `/search?q=` |

### Inventory & pharmacy — HAVE

| Method | Path |
| --- | --- |
| GET | `/products` |
| POST | `/products/item` |
| GET/POST | `/inventory/batches` |
| POST | `/inventory/adjustments` |
| GET | `/inventory/batches/{batchId}/movements` |
| POST | `/pharmacy/dispense` |

### Procurement — HAVE

| Method | Path |
| --- | --- |
| GET/POST | `/vendors` |
| GET/POST | `/purchases`, `/purchases/{id}`, `/purchases/{id}/receive` |

### Finance — HAVE

| Method | Path |
| --- | --- |
| GET/POST | `/expenses` |
| GET | `/analytics/financial` |

### Specialties — HAVE

| Method | Path |
| --- | --- |
| GET/POST | `/dewormings` |
| GET/POST/PATCH | `/labs`, `/labs/{id}/status` |
| GET/POST/PATCH | `/surgeries`, `/surgeries/{id}/status` |
| GET/POST | `/admissions`, `/admissions/{id}/discharge` |
| GET/POST/PATCH | `/grooming`, `/grooming/{id}/status` |

### Integration — HAVE (code-ready; providers = OPS)

| Method | Path |
| --- | --- |
| POST | `/communications/whatsapp`, `/communications/email` |
| POST | `/files` (multipart upload) |
| GET | `/files?entityType=&entityId=` (list), `/files/{fileId}/download` |
| GET/POST | `/webhooks/whatsapp` |
| Outbox worker | `OutboxProcessor`, `OutboxWorkerScheduler`, handlers: `EXPORT_REQUESTED`, `WHATSAPP_MESSAGE`, `EMAIL_MESSAGE` |
| Blob storage | `LocalBlobStorage` (`vetos.storage.type=local`) |

### API — TODO (no controller)

| Capability | Notes |
| --- | --- |
| **Audit log read** | `AUDIT_READ` permission exists; **no** `GET /audit-events` |
| **Services catalog** | Table `services`; no CRUD API |
| **List vaccinations** | POST only; no list endpoint for UI history (timeline may cover some) |
| **Leads pipeline** | List/create only; no status workflow API |
| **Refunds** | Not in schema/API |
| **Campaigns / notifications** | Not in schema/API |

---

## D. Web UI — route inventory

| Route | Status | Notes |
| --- | --- | --- |
| `/` | **HAVE** | Sign-in, API health banner, dev credential hint |
| `/dashboard` | **HAVE** | KPIs, vax/deworm due, shortcuts (wired to `getDashboardOverview`) |
| `/patients` | **HAVE** | Client/patient directory, **chrono timeline**, SOAP text in timeline |
| `/clinic` | **HAVE** | E2E wizard (client→payment); **minimal** consult (not full SOAP form) |
| `/pharmacy` | **HAVE** | Dispense from batches |
| `/inventory` | **HAVE** | Products, batches, adjustments, movement ledger |
| `/procurement` | **HAVE** | Vendors, POs, receive goods |
| `/specialties` | **HAVE** | Labs, surgery, IPD, grooming tabs |
| `/analytics` | **HAVE** | Financial summary + expenses UI |
| `/settings/clinic` | **HAVE** | Clinic profile via `apiJson` PATCH |
| `/settings/users` | **HAVE** | User create/list via `apiJson` |
| **Branch admin UI** | **TODO** | `GET/POST /branches`; only `listBranches()` in `api.ts` |
| `/modules` | **HAVE** | Static API capability list (not a module UI) |
| **Leads UI** | **TODO** | API only |
| **Comms hub UI** | **TODO** | API only |
| **Files / exports UI** | **TODO** | API only |
| **Audit log UI** | **TODO** | No read API |
| **Prototype dark enterprise sidebar** (one nav item per prototype line) | **TODO** | Current UI uses **top nav** groups in `app-shell.tsx` |
| **Vaccination record screen** | **PARTIAL** | Dashboard due list; POST via API; no dedicated vax UI in `api.ts` |

`apps/web/src/lib/api.ts` covers dashboard, clinical (create-only for many steps), inventory, procurement, specialties, finance.

**`api.ts` gaps (API exists, no typed helper / UI):**

| Missing helper | Backend |
| --- | --- |
| `listAppointments`, `listQueue`, `patchQueue` | `GET/PATCH /queue`, `GET /appointments` |
| `recordVaccination` | `POST /vaccinations` |
| Leads, exports, files, comms | `/leads`, `/exports`, `/files`, `/communications/*` |
| `createBranch` | `POST /branches` (`listBranches` **exists**; no branch admin UI) |

---

## E. Prototype feature map (sidebar + dashboard) — verified

| # | Prototype feature | Status | What we have | What’s left to implement |
| --- | --- | --- | --- | --- |
| 1 | Executive dashboard | **PARTIAL→HAVE** | `/dashboard` + overview API | Prototype widgets: pet **owners** count, **messages sent**, full **today’s appointments** list, **invoice basket** strip |
| 2 | Clinic & multi-branch | **PARTIAL** | Settings, branch API | Branch admin UI, per-branch reporting, prototype “location” switcher |
| 3 | Clients & patients | **HAVE** | `/patients`, `/clinic`, APIs | CRM polish (consent flags UI, merge duplicates) |
| 4 | Pet chrono timeline | **HAVE** | Timeline API + patients page | Richer event types, attachments on timeline |
| 5 | Appointments & roster | **PARTIAL** | Appointments API + book on `/clinic` | **Staff roster**, calendar, drag-drop schedule |
| 6 | Live queue triage | **PARTIAL** | Queue API, check-in, dashboard count | **Triage board** UI, priority/severity, real-time updates |
| 7 | SOAP consultations | **PARTIAL** | Full SOAP columns in API | **SOAP form UI** (S/O/A/P), not one-click stub on `/clinic` |
| 8 | Patient medical history | **HAVE** | Timeline + patient detail | Printable record, PDF export |
| 9 | Vaccination & deworming | **PARTIAL** | POST vax, deworm API, dashboard due | Record vax/deworm **screens**, reminder **automation** |
| 10 | Diagnostic lab reports | **PARTIAL** | Labs in `/specialties` | Report files, result values, client sharing |
| 11 | Surgery theatre | **PARTIAL** | Surgeries tab + API | Theatre scheduling UI, resources |
| 12 | IPD hospitalization | **PARTIAL** | Admissions tab + API | Ward/bed management, treatment sheets |
| 13 | Grooming & spa | **PARTIAL** | Grooming tab + API | Packages, staff assignment |
| 14 | Pharmacy & retail POS | **PARTIAL** | Dispense + products | **POS cart**, walk-in retail, receipts, barcode |
| 15 | Inventory & batches | **HAVE** | `/inventory` | Expiry alerts workflow, reorder rules |
| 16 | Distributors | **PARTIAL** | Vendors = distributors in `/procurement` | Rename/align UX with prototype |
| 17 | Purchase orders & stock | **PARTIAL** | PO + GRN receive | Approval workflow, partial receives UI polish |
| 18 | Unified invoice basket | **PARTIAL** | Invoice per consult flow | **Central basket** for multi-line retail/services |
| 19 | WhatsApp & email hub | **PARTIAL** | Queue + webhook + outbox | **Hub UI**, templates, delivery status, **OPS**: Meta/Resend keys |
| 20 | Automated PRM reminders | **TODO** | Outbox can send if manually queued | **Scheduler** for appointment/vax/deworm/follow-up, dedupe rules |
| 21 | Marketing campaigns | **TODO** | — | Schema, opt-out, segments, send UI |
| 22 | Executive analytics | **PARTIAL** | `/analytics` | Deeper BI, trends, branch compare |
| 23 | Expenses & P&L | **PARTIAL** | Expenses + financial summary | Full P&L reports, period close |
| 24 | Notification center | **TODO** | — | In-app notifications table + bell UI |
| 25 | Immutable audit logs | **PARTIAL** | Append-only writes | **Read API + owner UI**, export |
| 26 | VetOS Copilot (AI) | **TODO** | — | Phase 15 advisory AI |
| 27 | Quick service (walk-in, no consult) | **TODO** | — | Direct bill for nail trim, etc. |
| 28 | Online (synced) / offline | **TODO** | Cosmetic “online” only | IndexedDB, sync queue, Serwist (docs only) |
| 29 | Global search | **HAVE** | Header omni-search | Search appointments, invoices |
| 30 | Sign-in / roles | **HAVE** | Auth + settings users | Invite-by-email flow, MFA |

---

## F. Integration & infrastructure — HAVE vs TODO

| Item | Status | Notes |
| --- | --- | --- |
| Outbox worker (5s poll, claim function) | **HAVE** | `vetos.workers.enabled` |
| Local file blobs | **HAVE** | `./.vetos-blobs` |
| S3 blob storage | **TODO** | Implement `BlobStorage` for `vetos.storage.type=s3` |
| WhatsApp send (real) | **OPS** | Set `vetos.whatsapp.*`; `ConfigurableWhatsAppClient` |
| Email send (real) | **OPS** | Set `vetos.email.*`; `ConfigurableEmailClient` |
| Redis in Compose | **HAVE** container | **TODO:** rate limits, cache, ShedLock for multi-instance workers |
| Export CSV worker | **HAVE** | Clients export via `EXPORT_REQUESTED` |
| Provider webhook dedupe | **HAVE** | `provider_webhook_events` |
| AWS / Terraform / ECS | **TODO** | Phase 16 |
| Production hardening (pen test, restore drills) | **TODO** | Phases 17–18 |

---

## G. Tests & quality — HAVE vs TODO

| Item | Status |
| --- | --- |
| `AuthFlowTest` | **HAVE** |
| `ClinicUserAdminTest` | **HAVE** |
| `VerticalSliceFlowTest` (full clinical+billing API) | **HAVE** |
| `PlatformSmokeTest` | **HAVE** |
| `OutboxProcessorTest` | **HAVE** |
| `CrossTenantIsolationTest` | **HAVE** |
| `ActuatorHealthTest` | **HAVE** |
| Web `foundation-panel.test.tsx` | **FAILING** (Providers/query setup) — **TODO** fix |
| E2E Playwright/Cypress for UI | **TODO** |
| API tests for inventory/procurement/specialties/finance controllers | **TODO** (manual/Swagger only today) |
| Load / security audit | **TODO** |

---

## H. Known bugs & fixes (apply via rebuild)

| Issue | Status | Action |
| --- | --- | --- |
| `POST /clients` 500 when `consentEmail` / `consentWhatsapp` omitted (Jackson primitive null) | **FIXED in source** | `ClientCreateBody` uses `Boolean` + defaults; `api.ts` sends both flags. Run `docker compose up --build`. |
| Login when API/Postgres down | **MITIGATED** | Sign-in timeout message + API health banner |
| Permissions in Java vs DB `role_permissions` | **TODO** | Load permissions from DB or sync seed |
| `docs/product-scope.md` stale on files/S3 | **TODO** | Update doc (integration layer is implemented locally) |

---

## I. Implementation backlog (ordered for prototype parity)

Use this as the **Antigravity / agent task list**. Each line is a deliverable.

### P0 — Unblock daily clinic use

- [x] 1. **Rebuild & verify** `/clinic` E2E after client-consent fix (Docker) — **DONE**.
- [x] 2. **SOAP consultation UI** on `/clinic` (S/O/A/P, differentials, digital Rx writer) — **DONE**.
- [x] 3. **Queue triage board** page (live auto-refresh, token numbers, priority badges, PATCH status) — **DONE**.
- [x] 4. **Appointment calendar / roster** (day view, doctor assignment, check-in to queue) — **DONE**.

### P1 — Prototype comms & money

- [x] 5. **WhatsApp & email hub** page (`/communications`: queue message, view outbox status, dispatch) — **DONE**.
- [x] 6. **PRM reminder engine** (24h appointments, 7d vax, 7d deworming) → outbox with idempotent deduplication — **DONE**.
- [x] 7. **Unified invoice basket** (multi-line services/products/Rx before payment) — **DONE**.
- [x] 8. **Quick walk-in service** (10-second client+pet registration and instant queue token) — **DONE**.
- [x] 9. **Leads UI** (`/leads`: intake form, status pipeline, convert to client) — **DONE**.
- [x] 10. **Vaccination & deworming** record UI on patient (`/patients`: dose recording modals) — **DONE**.

### P2 — Operations & trust

- [x] 11. **Audit log read API** + **owner audit UI** (`GET /api/v1/audit-events`, `/settings/audit`, `AUDIT_READ`) — **DONE**.
- [ ] 12. **Notification center** (schema + API + bell in shell).
- [ ] 13. **Files UI** (upload to patient/entity, download).
- [ ] 14. **Exports UI** (request CSV, poll job, download).
- [x] 15. **Services catalog API + UI** (`GET/POST/PATCH /api/v1/services`, `/settings/services`) — **DONE**.
- [ ] 16. **S3 storage** implementation + Compose MinIO optional.

### P3 — Growth & enterprise

17. **Marketing campaigns** (schema, opt-out, batch send).
18. **Executive analytics** expansion (prototype KPIs, messages sent, owner counts).
19. **Refunds** API + UI.
20. **Multi-branch** operations dashboard.
21. **VetOS Copilot** (advisory AI, phase 15).
22. **Offline sync** (phase 14).
23. **AWS deployment** (phase 16).
24. **Redis**: rate limiting + distributed outbox lock (ShedLock).
25. **E2E test suite** for web; expand API tests for new controllers.
26. **Prototype navigation** optional: enterprise left sidebar matching mock (cosmetic; can keep grouped nav).

### P4 — Documentation hygiene

27. Sync `docs/product-scope.md`, `docs/progress.md` with this file.
28. OpenAPI spec updated for all `/api/v1` routes.

---

## J. Quick reference — what to run

```bash
# Full stack
docker compose up --build

# API tests (Java 21, Docker for Testcontainers)
cd apps/api && ./mvnw test

# Dev login
owner@clinic.test / change-me-now
```

**Swagger:** http://localhost:8080/swagger-ui.html  
**Web:** http://localhost:3000  

---

## K. Verification checklist (re-run when claiming “done”)

- [x] `mvnw test` — 9/9 green  
- [x] Login → dashboard loads metrics  
- [x] `/clinic` full path without 500 on client create  
- [x] `/patients` timeline loads for a patient with history  
- [x] `/inventory`, `/procurement`, `/specialties`, `/analytics` load without API errors  
- [x] `POST /exports` + worker marks job `COMPLETED` (owner)  
- [x] Outbox WhatsApp/email logs stub line when URLs empty  

---

*This file is the master task list for Antigravity/Cursor agents. Update **Last verified** and section checkboxes when milestones complete.*
