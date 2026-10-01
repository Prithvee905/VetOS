# Gap analysis

Status date: 2026-09-30. Scope is this repository only.

## Current state

This repository started without a production application. The foundation milestone adds the documentation contract, a Spring Boot modular monolith, a Next.js application shell, Docker Compose, Flyway, tenant context, row-level security, an authentication cookie skeleton, health checks, CI, and one cross-tenant database test.

No clinical, financial, pharmacy, procurement, communication, file, export, offline, or AI workflow is implemented.

## Classification

| Area | Classification | Evidence |
| --- | --- | --- |
| Requirements and architecture docs | DESIGNED | `docs/` |
| Identity authentication skeleton | IMPLEMENTED | `apps/api` auth module, OpenAPI auth paths |
| Tenant context and RLS | IMPLEMENTED | Flyway `V1__foundation.sql`, `TenantTransactionSupport`, `CrossTenantIsolationTest` |
| Clinic, branch, user, role tables | IMPLEMENTED | `V1__foundation.sql` |
| Clinic and branch product workflows | PLANNED | Schema and requirements only |
| Clients, patients, appointments, queue | PLANNED | Column-level schema in `docs/database/schema.md`; no tables yet |
| Consultation, prescription, invoice, payment | PLANNED | Same |
| Pharmacy, inventory, procurement, vendors | PLANNED | Table groups only |
| Laboratory, surgery, IPD, grooming | PLANNED | Table groups only |
| WhatsApp, email, campaigns, reminders | PLANNED | Architecture only |
| Files, reports, owner export | PLANNED | Architecture only |
| Offline sync | PLANNED | Architecture only |
| AI assistance | PLANNED | Architecture only; voice and telephony are out of scope |
| AWS deployment and Terraform | PLANNED | Deployment docs only |
| Production readiness | NOT_STARTED | No production validation |

## Missing for the first vertical slice

The slice is login, tenant, owner, pet, appointment, queue, consultation, prescription, invoice, and payment. Foundation covers login, tenant resolution, and owner identity storage. Still missing:

- Pet registration API and UI, including size category `SMALL`, `MEDIUM`, `LARGE`
- Appointment conflict detection and explicit status transitions
- Queue transitions and audit
- Consultation with SOAP, differentials, and doctor remarks or notes
- Prescription lines: medicine, quantity, dosage, frequency, duration
- Invoice creation that snapshots prescription line price, tax, and discount
- Idempotent payment confirmation that does not trust the browser
- End-to-end and cross-tenant tests for those records

## Missing platform controls

- Statutory GST (CGST, SGST, IGST, HSN) is not designed as an engine. Invoice lines will snapshot a configured tax rate. A statutory GST engine needs an approved ADR.
- Platform administration is not a clinic role. It is not implemented.
- Rate limiting storage in Redis is not wired. Redis is present in Compose and is not a source of truth.
- Sentry, CloudWatch alarms, backup restore tests, and ECS deployment are not implemented.
- Refresh-token reuse detection and Argon2id hashing are part of the auth skeleton and still need broader security verification before `VERIFIED`.

## Conflicts

No approved architecture decision conflicts with the locked stack. Spring Boot `4.1.1` and Next.js `16.3.8` are the versions in use.
