# Progress

Last updated: 2026-10-01.

## Foundation (phase 0 and 1)

| Area | Status | Evidence |
| --- | --- | --- |
| Documentation contract | Done | `docs/README.md` and linked architecture and requirements |
| API and web scaffold | Done | `apps/api`, `apps/web`, `docker-compose.yml`, `.github/workflows/ci.yml` |
| Auth, CSRF, refresh rotation | Done | `AuthFlowTest` |
| Tenant context and RLS | Done | `V1__foundation.sql`, `CrossTenantIsolationTest` |
| Actuator health | Done | `ActuatorHealthTest` |

## First vertical slice (phase 2)

| Step | Status | Notes |
| --- | --- | --- |
| Owner clinic and user management | Done | `ClinicUserAdminTest`, `/settings/clinic`, `/settings/users` |
| Client and pet registration | Not started | |
| Appointment booking | Not started | |
| Queue check-in | Not started | |
| Consultation | Not started | |
| Prescription lines | Not started | |
| Invoice snapshot | Not started | |
| Idempotent payment | Not started | |
| Tenant isolation tests per slice table | Not started | Foundation RLS test exists |

## How to verify locally

```bash
docker compose up --build
```

Sign in at `http://localhost:3000` with `owner@clinic.test` / `change-me-now` when the `dev` profile is active. Owners can edit the clinic profile and create users under **Settings**.

API tests require Docker for Testcontainers:

```bash
cd apps/api
./mvnw test
```
