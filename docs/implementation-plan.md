# Implementation plan

## Phase 0 and 1 — foundation

Status: in progress in this milestone.

- Documentation contract
- Modular monolith scaffold, Next.js shell, Compose, CI
- Authentication cookies, CSRF, Argon2id, refresh rotation
- Tenant context, RLS, cross-tenant test
- Actuator health

## Phase 2 and the first slice

Status: in progress.

Login is already present. The slice still to build, in order:

1. Owner clinic and user management screens against the existing tables — **done**
2. Client and pet registration, including size category
3. Appointment booking with conflict prevention
4. Queue check-in and status transitions
5. Consultation with SOAP, differentials, doctor remarks, and doctor notes
6. Prescription lines
7. Invoice that snapshots prescription lines
8. Idempotent payment
9. Tests for tenant isolation on each of those tables

## Later phases

| Phase | Scope | Status |
| --- | --- | --- |
| 3 | Clinic, branch, users, roles, permissions enforcement | NOT_STARTED |
| 4 | Clients, leads, pets, timeline | NOT_STARTED |
| 5 | Appointments, schedule, queue, triage | NOT_STARTED |
| 6 | Consultation | NOT_STARTED |
| 7 | Prescriptions, vaccinations, deworming | NOT_STARTED |
| 8 | Pharmacy and inventory | NOT_STARTED |
| 9 | Vendors and procurement | NOT_STARTED |
| 10 | Billing, payments, expenses | NOT_STARTED |
| 11 | Laboratory, surgery, IPD, grooming | NOT_STARTED |
| 12 | WhatsApp, email, reminders, campaigns | NOT_STARTED |
| 13 | Files, reports, owner export | NOT_STARTED |
| 14 | Offline sync for approved mutations | NOT_STARTED |
| 15 | Advisory AI | NOT_STARTED |
| 16 | AWS infrastructure | NOT_STARTED |
| 17 | Security, performance, and restore validation | NOT_STARTED |
| 18 | Production readiness review | NOT_STARTED |

Voice and telephony stay out of every phase until a requirement adds them.

## Definition of done for a feature

Requirement and acceptance criteria exist, migration and constraints exist, API matches OpenAPI, authorization and RLS are tested, the UI has loading, empty, and error states when it has a screen, and progress.md is updated.
