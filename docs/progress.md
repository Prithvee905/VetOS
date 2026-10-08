# Progress

Last updated: 2026-10-02.

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
| Client and pet registration | Done | `V2__first_vertical_slice.sql`, `/api/v1/clients`, `/api/v1/patients`, `/clinic` |
| Appointment booking | Done | Overlap exclusion, `/api/v1/appointments` |
| Queue check-in | Done | `/api/v1/queue` |
| Consultation | Done | SOAP fields, differentials, `/api/v1/consultations` |
| Prescription lines | Done | `/api/v1/prescriptions` |
| Invoice snapshot | Done | `/api/v1/invoices` from prescription lines |
| Idempotent payment | Done | `Idempotency-Key` header, `/api/v1/payments` |
| Tenant isolation tests per slice table | Done | `CrossTenantIsolationTest` (clients), `VerticalSliceFlowTest` |

## Platform expansion (phases 3–11, partial)

| Area | Status | Evidence |
| --- | --- | --- |
| Extended schema (leads, catalog, inventory, vendors, clinical add-ons) | Done | `V3__platform_expansion.sql` |
| Leads, vaccinations, products, exports API | Done | `PlatformControllers`, `PlatformSmokeTest` |
| Branch create | Done | `POST /api/v1/branches` |
| Swagger UI | Done | `/swagger-ui.html` |
| Async comms / S3 / full UI per module | Not done | `docs/product-scope.md` |

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
