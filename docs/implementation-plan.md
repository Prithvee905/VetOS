# Implementation plan

## Phase 0 and 1 — foundation

Status: in progress in this milestone.

- Documentation contract
- Modular monolith scaffold, Next.js shell, Compose, CI
- Authentication cookies, CSRF, Argon2id, refresh rotation
- Tenant context, RLS, cross-tenant test
- Actuator health

## Phase 2 and the first slice

Status: **done** (see `docs/progress.md`, `VerticalSliceFlowTest`).

## Phases 3–11 (in-repo)

Status: **partial** — schema + APIs in `V3__platform_expansion.sql` and platform controllers; full UI per module and workers not done. See `docs/product-scope.md`.

## Later phases

| Phase | Scope | Status |
| --- | --- | --- |
| 3 | Clinic, branch, users, roles, permissions enforcement | PARTIAL (branch create, permissions seeded) |
| 4 | Clients, leads, pets, timeline | PARTIAL (clients/pets phase 2; leads API) |
| 5 | Appointments, schedule, queue, triage | DONE (phase 2) |
| 6 | Consultation | DONE (phase 2) |
| 7 | Prescriptions, vaccinations, deworming | PARTIAL (Rx phase 2; vaccination API + tables) |
| 8 | Pharmacy and inventory | PARTIAL (products, batches, movements tables) |
| 9 | Vendors and procurement | PARTIAL (PO/GRN tables) |
| 10 | Billing, payments, expenses | PARTIAL (billing phase 2; expenses table) |
| 11 | Laboratory, surgery, IPD, grooming | PARTIAL (record tables + RLS) |
| 12 | WhatsApp, email, reminders, campaigns | **CODE READY** (outbox worker, stub/real HTTP clients, webhook ingest, queue APIs) |
| 13 | Files, reports, owner export | **CODE READY** (local blob storage, upload/download, export worker + status API) |
| 14 | Offline sync for approved mutations | NOT_STARTED |
| 15 | Advisory AI | NOT_STARTED |
| 16 | AWS infrastructure | NOT_STARTED |
| 17 | Security, performance, and restore validation | NOT_STARTED |
| 18 | Production readiness review | NOT_STARTED |

Voice and telephony stay out of every phase until a requirement adds them.

## Definition of done for a feature

Requirement and acceptance criteria exist, migration and constraints exist, API matches OpenAPI, authorization and RLS are tested, the UI has loading, empty, and error states when it has a screen, and progress.md is updated.
